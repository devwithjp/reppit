#!/usr/bin/env python3
"""
reppit ingestion prototype -- demonstrates the recommended data-source path
end to end for a handful of real repositories.

See docs/architecture/data-sources.md for the reasoning and the measurements
behind these choices.

Two paths are implemented:

  PRIMARY   GitHub GraphQL API, aliased batch query.
            Needs GITHUB_TOKEN (a classic PAT with no scopes, or a fine-grained
            token with "Public repositories: read" -- public metadata only).
            Measured: 1 rate-limit point per 30 repos, full field set including
            README text. ~89,000 repos/hour at 8 workers.

  FALLBACK  ecosyste.ms + deps.dev + package registries.
            No credentials at all. 5,000 req/hour per IP, no account.
            Covers everything except README text, and adds download counts,
            deprecation flags and OSSF Scorecard which GitHub does not carry.

With no token the script runs the fallback path and says so. With a token it
runs both, so you can compare the fields each one yields.

Standard library only (urllib). No third-party dependencies.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "reppit-ingest-prototype (+https://reppit.dev)"
TIMEOUT = 60

# A deliberately awkward sample: a transferred repo (facebook/react is now
# react/react), a repo whose README is not README.md (torvalds/linux ships
# README; python/cpython ships README.rst), an archived repo, and a repo whose
# npm package is formally deprecated (request/request).
SAMPLE = [
    ("vercel", "next.js"),
    ("facebook", "react"),
    ("torvalds", "linux"),
    ("python", "cpython"),
    ("request", "request"),
]

# Candidate README paths, tried in order. GitHub's REST /readme endpoint
# resolves this automatically but costs one request per repo; in GraphQL we
# ask for all candidates at once and the whole batch still costs 1 point.
README_CANDIDATES = [
    "README.md",
    "readme.md",
    "README.rst",
    "README",
    "README.txt",
    "docs/README.md",
]


# --------------------------------------------------------------------------
# HTTP helpers
# --------------------------------------------------------------------------


def http_json(url, data=None, headers=None, method=None):
    """GET or POST a URL and parse JSON. Returns (payload, elapsed_seconds)."""
    hdrs = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, body, hdrs, method=method)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            payload = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return {"__http_error__": e.code, "__body__": e.read()[:300].decode("utf-8", "replace")}, time.time() - t0
    except Exception as e:  # noqa: BLE001 -- prototype
        return {"__error__": str(e)}, time.time() - t0
    return payload, time.time() - t0


# --------------------------------------------------------------------------
# PRIMARY: GitHub GraphQL
# --------------------------------------------------------------------------

_README_SELECTION = " ".join(
    'f%d: object(expression:"HEAD:%s"){... on Blob{ byteSize isTruncated text }}' % (i, path)
    for i, path in enumerate(README_CANDIDATES)
)

_FRAGMENT = (
    """
fragment Repo on Repository {
  databaseId
  nameWithOwner
  name
  owner { login }
  url
  description
  homepageUrl
  primaryLanguage { name }
  licenseInfo { spdxId }
  stargazerCount
  forkCount
  issues(states: OPEN) { totalCount }
  pushedAt
  createdAt
  isArchived
  isDisabled
  isFork
  repositoryTopics(first: 25) { nodes { topic { name } } }
  latestRelease { publishedAt tagName }
  defaultBranchRef { name }
  %s
}
"""
    % _README_SELECTION
)


def github_graphql_batch(pairs, token):
    """One aliased GraphQL query for N repos. Costs 1 rate-limit point total.

    GraphQL resolves renames and transfers transparently: ask for
    facebook/react and you get back nameWithOwner "react/react".
    """
    aliases = " ".join(
        'r%d: repository(owner: "%s", name: "%s") { ...Repo }' % (i, owner, name)
        for i, (owner, name) in enumerate(pairs)
    )
    query = "query { rateLimit { cost remaining resetAt } " + aliases + " }" + _FRAGMENT
    return http_json(
        "https://api.github.com/graphql",
        data={"query": query},
        headers={"Authorization": "Bearer " + token},
    )


def pick_readme(node):
    """Choose the first candidate blob that looks like a real README."""
    for i, path in enumerate(README_CANDIDATES):
        blob = node.get("f%d" % i)
        if blob and blob.get("text") and len(blob["text"]) > 200:
            return path, blob["text"]
    return None, None


def normalise_github(node, requested):
    path, readme = pick_readme(node)
    return {
        "source": "github-graphql",
        "github_id": node.get("databaseId"),
        "requested_as": requested,
        "slug": node.get("nameWithOwner"),
        "renamed": node.get("nameWithOwner", "").lower() != requested.lower(),
        "url": node.get("url"),
        "description": node.get("description"),
        "topics": [t["topic"]["name"] for t in (node.get("repositoryTopics") or {}).get("nodes", [])],
        "language": (node.get("primaryLanguage") or {}).get("name"),
        "license": (node.get("licenseInfo") or {}).get("spdxId"),
        "stars": node.get("stargazerCount"),
        "forks": node.get("forkCount"),
        "open_issues": (node.get("issues") or {}).get("totalCount"),
        "pushed_at": node.get("pushedAt"),
        "last_release_at": (node.get("latestRelease") or {}).get("publishedAt"),
        "last_release_tag": (node.get("latestRelease") or {}).get("tagName"),
        "archived": node.get("isArchived"),
        "disabled": node.get("isDisabled"),
        "readme_path": path,
        "readme_chars": len(readme) if readme else 0,
    }


# --------------------------------------------------------------------------
# FALLBACK / ENRICHMENT: ecosyste.ms, deps.dev, registries. No credentials.
# --------------------------------------------------------------------------


def ecosystems_repo(owner, name):
    """repos.ecosyste.ms. 5,000 req/hour per IP, no account, CC-BY-SA 4.0.

    Carries previous_names, which is the only published record of a repo's
    rename history, plus an OSSF Scorecard snapshot.
    """
    slug = urllib.parse.quote("%s/%s" % (owner, name), safe="")
    return http_json("https://repos.ecosyste.ms/api/v1/hosts/GitHub/repositories/" + slug)


def depsdev_project(owner, name):
    """deps.dev. No account, no documented published limit, free.

    Fresher OSSF Scorecard than ecosyste.ms, and carries stars/forks/issues
    and the resolved licence as a cross-check.
    """
    key = urllib.parse.quote("github.com/%s/%s" % (owner, name), safe="")
    return http_json("https://api.deps.dev/v3alpha/projects/" + key)


def npm_package(pkg):
    """registry.npmjs.org. The authoritative deprecation flag lives here:
    versions[latest].deprecated is a string when the maintainer deprecated it."""
    return http_json("https://registry.npmjs.org/" + urllib.parse.quote(pkg, safe="@/"))


def npm_downloads(pkg):
    """api.npmjs.org. Accepts up to 128 comma-separated package names per call."""
    return http_json("https://api.npmjs.org/downloads/point/last-month/" + urllib.parse.quote(pkg, safe="@/,"))


def ecosystems_package(registry, pkg):
    """packages.ecosyste.ms. Carries status ("deprecated"/"removed"),
    download counts, and the full advisory list for the package."""
    return http_json(
        "https://packages.ecosyste.ms/api/v1/registries/%s/packages/%s"
        % (registry, urllib.parse.quote(pkg, safe="@/"))
    )


def github_repo_advisories(owner, name):
    """Repository security advisories. Repo-keyed, works unauthenticated
    (60 req/hour by IP), does not batch. See the doc: this is the one field
    with no cheap source."""
    return http_json(
        "https://api.github.com/repos/%s/%s/security-advisories?per_page=100&state=published"
        % (owner, name)
    )


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

FIELDS = [
    "slug", "description", "topics", "language", "license", "stars", "forks",
    "open_issues", "pushed_at", "last_release_at", "archived", "deprecated",
    "advisories_open", "readme_chars",
]


def show(title, row):
    print("  " + title)
    for f in FIELDS:
        if f not in row:
            continue
        v = row[f]
        if isinstance(v, list):
            v = ", ".join(map(str, v[:6])) + (" (+%d)" % (len(v) - 6) if len(v) > 6 else "")
        if isinstance(v, str) and len(v) > 92:
            v = v[:89] + "..."
        print("    %-17s %s" % (f, "-" if v is None else v))


def run_primary(token):
    print("=" * 78)
    print("PRIMARY PATH -- GitHub GraphQL, one aliased batch query for %d repos" % len(SAMPLE))
    print("=" * 78)
    payload, elapsed = github_graphql_batch(SAMPLE, token)
    if "__http_error__" in payload or "__error__" in payload:
        print("  request failed: %s" % json.dumps(payload)[:400])
        return None
    data = payload.get("data") or {}
    rl = data.get("rateLimit") or {}
    print("  %.2fs wall clock | rate-limit cost %s point(s) | %s points remaining this hour"
          % (elapsed, rl.get("cost"), rl.get("remaining")))
    print("  => %d repos for %s point(s). The hourly budget is 5,000 points.\n"
          % (len(SAMPLE), rl.get("cost")))
    for err in payload.get("errors", []) or []:
        print("  partial error (the rest of the batch still returned): %s" % err.get("message"))
    out = {}
    for i, (owner, name) in enumerate(SAMPLE):
        node = data.get("r%d" % i)
        requested = "%s/%s" % (owner, name)
        if not node:
            print("  %s -> not found\n" % requested)
            continue
        row = normalise_github(node, requested)
        out[requested] = row
        flag = ""
        if row["renamed"]:
            flag = "   <-- RENAMED/TRANSFERRED since we asked for %s" % requested
        show("%s (github id %s)%s" % (row["slug"], row["github_id"], flag), row)
        print()
    return out


def run_fallback():
    print("=" * 78)
    print("NO-CREDENTIAL PATH -- ecosyste.ms + deps.dev + registries")
    print("=" * 78)
    for owner, name in SAMPLE:
        requested = "%s/%s" % (owner, name)
        eco, t_eco = ecosystems_repo(owner, name)
        dd, t_dd = depsdev_project(owner, name)
        row = {}
        notes = []

        if "__http_error__" in eco:
            notes.append("repos.ecosyste.ms %s (it does not hold every repo; "
                         "transferred repos 404 under the old name)" % eco["__http_error__"])
        else:
            row.update({
                "slug": eco.get("full_name"),
                "description": eco.get("description"),
                "topics": eco.get("topics"),
                "language": eco.get("language"),
                "license": eco.get("license"),
                "stars": eco.get("stargazers_count"),
                "forks": eco.get("forks_count"),
                "open_issues": eco.get("open_issues_count"),
                "pushed_at": eco.get("pushed_at"),
                "archived": eco.get("archived"),
            })
            if eco.get("previous_names"):
                notes.append("previous_names: %s" % ", ".join(eco["previous_names"]))
            notes.append("last_synced_at: %s" % eco.get("last_synced_at"))
            sc = (eco.get("scorecard") or {}).get("data") or {}
            if sc:
                notes.append("ecosyste.ms scorecard %s (as of %s)" % (sc.get("score"), sc.get("date")))

        if "__http_error__" not in dd:
            sc = dd.get("scorecard") or {}
            if sc:
                overall = sc.get("overallScore")
                if overall is None:
                    overall = sum(c.get("score", 0) for c in sc.get("checks", []) if c.get("score", -1) >= 0)
                    overall = "see checks"
                notes.append("deps.dev scorecard as of %s (%d checks)"
                             % ((sc.get("date") or "?")[:10], len(sc.get("checks", []))))
            row.setdefault("stars", dd.get("starsCount"))
            row.setdefault("license", dd.get("license"))

        # Deprecation and downloads: package registries only. GitHub has no
        # deprecation flag at all.
        pkg_name = {"request/request": ("npmjs.org", "request"),
                    "vercel/next.js": ("npmjs.org", "next"),
                    "python/cpython": None,
                    "torvalds/linux": None,
                    "facebook/react": ("npmjs.org", "react")}.get(requested)
        if pkg_name:
            registry, pkg = pkg_name
            ep, _ = ecosystems_package(registry, pkg)
            if "__http_error__" not in ep:
                row["deprecated"] = (ep.get("status") == "deprecated")
                row["advisories_open"] = len([a for a in (ep.get("advisories") or [])
                                              if not a.get("withdrawn_at")])
                notes.append("npm %s: %s downloads/%s, status=%s, latest release %s"
                             % (pkg, ep.get("downloads"), ep.get("downloads_period"),
                                ep.get("status") or "active",
                                (ep.get("latest_release_published_at") or "?")[:10]))
                row["last_release_at"] = ep.get("latest_release_published_at")

        print("  %s  (ecosyste.ms %.2fs, deps.dev %.2fs)" % (requested, t_eco, t_dd))
        if row:
            show("", row)
        for n in notes:
            print("    note: %s" % n)
        print()


def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    print()
    if token:
        run_primary(token)
    else:
        print("=" * 78)
        print("GITHUB_TOKEN is not set, so the PRIMARY path is skipped.")
        print("Set GITHUB_TOKEN to a classic PAT with no scopes (public data only),")
        print("or GH_TOKEN, and re-run to see the recommended path. Running the")
        print("no-credential fallback instead.")
        print("=" * 78)
        print()
    run_fallback()
    print("Field definitions and the full coverage matrix: docs/architecture/data-sources.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
