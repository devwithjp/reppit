# Data sources for the reppit index

**Primary: the GitHub GraphQL API with aliased batch queries.** One query returns 30–50 repos
with the complete field set including README text, and costs **1 rate-limit point** — measured,
not estimated. **Secondary: ecosyste.ms** (rename history, package links, no credentials),
**package registries** (npm/PyPI/crates, for download counts and deprecation flags),
**GH Archive** (hourly activity, for cheap change detection), **deps.dev** (OSSF Scorecard).
**Reason: the 755-item ceiling was never a GitHub rate limit — it was one REST call per repo.
Batching the same data through GraphQL raises the ceiling from ~2,500 repos/hour to a measured
89,408 repos/hour on a single free token, which indexes every GitHub repo above 100 stars in
about eight hours for nothing.**

All numbers below were measured by calling the APIs on 2026-10-08 from a single residential IP.
Timings are wall clock from `curl`/`urllib`. Every source in the recommendation was called at
least once; BigQuery was not, and is excluded from the recommendation for that reason.

---

## 1. Source-by-source evidence

### 1.1 GitHub REST API

Rate limits, read from `GET /rate_limit` rather than from the docs:

```
unauthenticated:   core 60/hr    search 10/hr   graphql 0     code_search 60/hr
personal token:    core 5000/hr  search 30/hr   graphql 5000  code_search 10/hr
```

Documented tiers (from `docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api`):

> The primary rate limit for unauthenticated requests is 60 requests per hour.
>
> All of these requests count towards your personal rate limit of 5,000 requests per hour.
>
> GitHub Apps authenticating with an installation access token use the installation's minimum
> rate limit of 5,000 requests per hour. If the installation is on a GitHub Enterprise Cloud
> organization, the installation has a rate limit of 15,000 requests per hour. For installations
> that are not on a GitHub Enterprise Cloud organization, the rate limit for the installation
> will scale with the number of users and repositories. Installations that have more than 20
> repositories receive another 50 requests per hour for each repository … The rate limit cannot
> increase beyond 12,500 requests per hour.

**Repos per hour for our field set.** The current ingester (`packages/core/src/github.ts`) makes
three REST calls per repo — `/repos/{o}/{n}`, `/repos/{o}/{n}/readme`, `/repos/{o}/{n}/releases/latest`.

| tier | req/hr | repos/hr at 3 req each |
|---|---|---|
| unauthenticated | 60 | **20** |
| personal access token | 5,000 | **1,666** |
| GitHub App installation (floor) | 5,000 | **1,666** |
| GitHub App installation (ceiling) | 12,500 | **4,166** |
| GitHub App on Enterprise Cloud | 15,000 | **5,000** |

That is the whole explanation for 755 indexed items. Measured single REST repo call:
`HTTP 200 in 0.465s, 6,260 bytes`.

Two REST facts worth keeping:

- **Conditional requests are free.** Re-requesting `/repos/golang/go` with `If-None-Match`
  returned `304` twice and `x-ratelimit-remaining` stayed at `4996` both times. 304s do not
  decrement the budget. GraphQL has no equivalent.
- **`open_issues_count` is wrong for our purposes.** REST reports 3,566 open issues for
  `vercel/next.js`; GraphQL `issues(states:OPEN){totalCount}` reports 1,072. REST counts pull
  requests as issues. The ranking's "issue load" signal must use the GraphQL number.
  `repos.ecosyste.ms` mirrors the inflated REST figure (3,540).

### 1.2 GitHub GraphQL API — the finding that changes the plan

The GraphQL budget is 5,000 **points** per hour, not 5,000 requests. Points are not one per repo.
A query that aliases N `repository(...)` lookups costs **1 point total**, regardless of N:

| batch size | README text included | wall clock | bytes | cost | nodeCount |
|---|---|---|---|---|---|
| 50 | no | 10.1 s | 50,788 | **1** | 1,250 |
| 50 | yes | 11.1 s | 480,626 | **1** | 1,250 |
| 25 | yes | 3.9 s | 267,365 | **1** | 625 |
| 10 | yes | 2.0 s | 74,208 | **1** | 250 |
| 30 | yes, 6 filename candidates | 6.4 s | 328,915 | **1** | 750 |

`x-ratelimit-remaining` fell by exactly 1 per call across the whole sequence
(4988 → 4987 → 4986 → 4985). Documented node limit is 500,000 per call, so nodes are not the
constraint; **GitHub's 10-second gateway timeout is**. Batches of 50 with six README candidates
return `502` after ~11 s. **Batch 30 is the safe working size.**

Measured sustained throughput, 600 real repos, batch 30, full field set including README text:

```
workers=1:  120 repos in 32.8s =  3.7 repos/s =  13,175 repos/hour |  4 points
workers=4:  240 repos in 18.5s = 12.9 repos/s =  46,600 repos/hour |  8 points
workers=8:  480 repos in 19.3s = 24.8 repos/s =  89,408 repos/hour | 16 points
```

**89,408 repos/hour on one free personal access token, spending 16 of 5,000 points for 480 repos.**
The rate-limit ceiling is 5,000 × 30 = **150,000 repos/hour**; at 8 workers we are wall-clock
bound, not quota bound. This is a **54× improvement over the REST path** on the identical token.

GraphQL also returns partial results on error, which REST cannot: a batch containing one
nonexistent repo returns `null` for that alias plus a `NOT_FOUND` entry in `errors`, and every
other alias still resolves. Batch ingestion does not need per-repo isolation.

**Discovery via GraphQL search.** `search(type:REPOSITORY, first:50)` also costs 1 point and
returns the full metadata field set (everything except README):

```
first:50  -> HTTP 200 6.8s  cost 1  repositoryCount 5616  returned 50
first:100 -> HTTP 502 11.0s (gateway timeout)
```

So discovery is 1 point per 50 repos and *is already hydration* for 12 of our 13 fields.
The 1,000-results-per-query cap still applies and forces star/date slicing.

**Index sizing, measured from `search/repositories` total counts:**

| query | repos |
|---|---|
| `stars:>=10000` | 5,617 |
| `stars:>=1000` | 65,429 |
| `stars:>=100` | 482,870 |
| `stars:>=50` | 836,145 |
| `stars:>=10` | 2,893,478 |
| `topic:mcp-server` | 33,733 |
| `topic:agent-skills` | 29,713 |
| `topic:claude-skill` | 5,828 |
| `topic:ai-agent stars:>=10` | 4,304 |

### 1.3 ecosyste.ms

Called: `repos.ecosyste.ms`, `packages.ecosyste.ms`, `advisories.ecosyste.ms`,
`timeline.ecosyste.ms`, `awesome.ecosyste.ms`.

**Rate limit confirmed.** Response headers on every service:

```
x-ratelimit-limit: 5000
x-ratelimit-tier: anonymous
x-ratelimit-consumer: anonymous
```

5,000/hour, no account, no key. Cached responses appear not to decrement the counter
(three repeated calls all reported `remaining: 4991`). Typical latency 0.05–0.8 s; the host
is Cloudflare-fronted with `cdn-cache-control: max-age=3600`.

**Licence.** `openapi.yaml` declares `license: CC-BY-SA-4.0`. Site footer: *"Code: AGPL-3 — Data:
CC BY-SA 4.0"*. The open-data dump pages variously say CC-BY and CC-BY-SA.

**Fields it carries** (`GET /api/v1/hosts/GitHub/repositories/vercel%2Fnext.js`,
`HTTP 200 in 0.070s`, 57 KB): `full_name owner description archived fork pushed_at size
stargazers_count open_issues_count forks_count subscribers_count default_branch topics
language license status homepage created_at updated_at html_url previous_names tags_count
template purl metadata.files scorecard commit_stats last_synced_at`.

Two fields here exist nowhere else:

- **`previous_names`** — `["zeit/next.js"]` for `vercel/next.js`. The only published rename history.
- **`metadata.files.readme`** — the actual README filename (`"README.rst"`, `"README"`, …),
  which removes the guesswork from README fetching.
- **`scorecard`** — a full OSSF Scorecard blob, but stale: dated `2025-08-11` for next.js,
  versus `2026-08-24` from deps.dev.

**Freshness.** `last_synced_at` ranged from `2026-09-18` to `2026-10-05` across the repos sampled —
days to weeks behind. Its star count for `vercel/next.js` was 142,997 against GitHub's live 143,241.

**Four limitations that disqualify it as the primary source:**

1. **Coverage holes.** `facebook/react`, `repos/lookup?url=…/facebook/react`, and the owner
   listing for `facebook` all return `404` / no match. (It is not entirely ecosyste.ms's fault —
   see §3 — but the record is simply absent either way.)
2. **No enumeration.** `?sort=stargazers_count&order=desc` is silently ignored; results come back
   in `full_name` order starting at `0/...`. Deep pagination hard-fails:
   `{"error":"Page limit exceeded (max 100)"}`. Maximum 10,000 records per query shape.
   You cannot ask it for "the top 50,000 repos".
3. **No README text.** Only the filename.
4. **The reverse join is unusable.** `packages/lookup?repository_url=https://github.com/vercel/next.js`
   took **27.4 seconds** and returned 100 fuzzy matches — `next-rspack`, `@aidenlx/next`,
   `org.mvnpm.at.next:swc-win32-ia32-msvc`. For `psf/requests` it returned `reqesst`,
   `httprequesthub`, `multiconnections`. It is substring matching, not a join.

**`packages.ecosyste.ms` is excellent** in the forward direction
(`/registries/npmjs.org/packages/next`, `HTTP 200 in 0.72s`):

```json
{"name":"next","ecosystem":"npm","repository_url":"https://github.com/vercel/next.js",
 "status":null,"latest_release_number":"16.4.0",
 "latest_release_published_at":"2026-10-06T18:35:31.699Z",
 "downloads":246347357,"downloads_period":"last-month",
 "dependent_packages_count":8463,"dependent_repos_count":345645,
 "advisories":[73 full GHSA objects with severity, cvss, epss, version ranges]}
```

`/packages/request` returns `"status":"deprecated"`. One call yields the deprecation flag,
download count, latest release date, repository URL *and* the full advisory list — four of our
fields GitHub does not serve.

**Bulk dumps exist but are not viable** (`HEAD` on each, sizes measured):

| dump | size | last modified |
|---|---|---|
| `repos-2023-08-30.tar.gz` | **226.8 GB** | 2023-10-03 — three years stale |
| `packages-2026-02-05.tar.gz` | **63.7 GB** | 2026-02-05 |
| `advisories-2023-08-23.tar.gz` | 5.6 MB | 2023-08-23 — three years stale |

A 227 GB three-year-old repo dump is worse on every axis than 8 hours of API calls.

**`awesome.ecosyste.ms` is the best discovery source we found for a curated directory.**
It indexes awesome-lists and their member projects, each already joined to a full repository
record, its `readme`, `keywords`, `categories` and linked packages — exactly reppit's shape.

**`timeline.ecosyste.ms`** is GH Archive re-served as an API ("over 4 Billion events",
"updated hourly from GH Archive"), with only two endpoints: `/events` and `/events/{repoName}`.
Useful for per-repo activity, not for a global sweep.

### 1.4 GH Archive

`https://data.gharchive.org/YYYY-MM-DD-HH.json.gz`, no auth, no key, no documented limit.
Measured across four hours:

| file | gz size | events | distinct repos | PushEvents |
|---|---|---|---|---|
| `2026-10-07-15` | 7.1 MB | 6,218 | 5,047 | **0** |
| `2026-10-01-12` | 18.6 MB | 92,323 | 53,459 | 70,908 |
| `2026-06-15-12` | 21.8 MB | 162,822 | 79,347 | 138,311 |
| `2024-06-15-12` | 69.7 MB | 233,373 | 98,025 | 173,090 |
| `2020-06-15-12` | 65.2 MB | 121,300 | 47,467 | 57,275 |

**The 2026-10-07-15 file is defective** — a third the size of its neighbours with zero PushEvents.
GH Archive has gaps, and a pipeline that trusts a single hour will silently miss a day of activity.
Any consumer must sanity-check hourly files against a rolling baseline and re-fetch outliers.

Event shape (`repo` carries **both** id and name — this matters, see §4):

```json
{"type":"ReleaseEvent","repo":{"id":1223849840,"name":"tainacan/tainacan-openalex",
 "url":"https://api.github.com/repos/tainacan/tainacan-openalex"},
 "actor":"mateuswetah","created_at":"2026-10-07T15:00:00Z","payload":{...}}
```

**What it gives us:** which repos exist and which are *active*, for ~53,000 distinct repos per
hour, at 19 MB/hour and zero API quota. **What it cannot give us:** current state. It is a change
log, not a snapshot — no stars total, no topics, no licence, no README, no archived flag. There is
no rename event and no archive event in the public timeline. A repo that goes quiet emits nothing,
so absence of events never proves archival.

### 1.5 BigQuery public datasets — **not called, therefore not recommended**

`GET https://bigquery.googleapis.com/bigquery/v2/projects/bigquery-public-data/datasets/github_repos/tables/sample_repos`
returned **HTTP 401** (`"Request is missing required authentication credential"`), and no
`gcloud`/`bq` client is installed in this environment. I could not measure a byte-scan cost, so
per the ground rules BigQuery does not enter the recommendation.

What can be stated honestly: BigQuery bills **by bytes scanned**, with 1 TiB/month free and
$6.25/TiB thereafter (US multi-region, on-demand). GH Archive's own guidance:

> Note that you get 1 TB of data processed per month free of charge. In order to make best use of
> it, you can restrict your queries to relevant time ranges to minimize the amount of scanned data.

`githubarchive` is partitioned into `year.*`, `month.YYYYMM` and `day.YYYYMMDD` tables with the
event body kept as a serialised JSON string in a `payload` column — so any query that needs a
payload field scans that whole string column for every row in range. `bigquery-public-data.github_repos`
is a 2016-era snapshot plus periodically refreshed content tables; its `contents` table is in the
terabytes, meaning a single unfiltered query can consume the entire monthly free tier.

The honest position: BigQuery is a credible one-off bulk-discovery tool for someone who already
has a GCP project and is disciplined about column pruning and partition filters. It is not
something a small product should put on the critical path, and we have a free path that does not
need it. **Revisit only if §4's plan fails to reach coverage.**

### 1.6 Package registries

| call | result | time |
|---|---|---|
| `registry.npmjs.org/request` | `versions["2.88.2"].deprecated` = `"request has been deprecated, see …"` | 0.15 s |
| `registry.npmjs.org/request` with `Accept: application/vnd.npm.install-v1+json` | abbreviated doc, 130 KB vs 307 KB | 0.12 s |
| `api.npmjs.org/downloads/point/last-month/next` | `{"downloads":253413359,…}` | 0.72 s |
| `api.npmjs.org/downloads/point/last-week/next,react,vue,svelte,express` | **5 packages in one response** (limit 128) | — |
| `replicate.npmjs.com/registry/_changes?limit=3` | `{"results":[…],"last_seq":2494878}` — CouchDB feed, resumable by `seq` | — |
| `pypi.org/pypi/requests/json` | `info.yanked`, `info.license`, `info.classifiers`, `info.project_urls.Source` | 0.27 s |
| `pypi.org/pypi/requests/json` → `info.downloads` | **`{"last_day":-1,"last_month":-1,"last_week":-1}` — dead field** | — |
| `pypistats.org/api/packages/requests/recent` | `{"last_month":1202777296,…}` — the working substitute | 0.75 s |
| `pypi.org/simple/` (JSON index) | 44.6 MB, full package list, `x-pypi-last-serial: 41952098` | **22.8 s** |
| `crates.io/api/v1/crates/serde` | `downloads`, `recent_downloads`, `repository`, per-version `yanked` | 2.19 s |
| `crates.io/api/v1/crates/serde` **with no User-Agent** | **HTTP 403** | — |
| `static.crates.io/db-dump.tar.gz` | **1.97 GB**, `last-modified` today — a daily full dump | — |

Notes that bite in practice:

- npm's abbreviated-metadata media type halves the payload but **drops the `deprecated` field**;
  deprecation needs the full document.
- PyPI's `info.downloads` has been hard-coded to `-1` for years. Use `pypistats.org`.
- crates.io hard-rejects requests without a User-Agent. Their documented preference is the daily
  `db-dump.tar.gz` over crawling, and at 1.97 GB/day that is the right call for Rust.
- PyPI's simple index is a 22.8-second, 44.6 MB request. Fetch it daily at most, and use
  `x-pypi-last-serial` to decide whether to bother.

### 1.7 Security: GitHub Advisory Database, OSV, deps.dev

| call | result |
|---|---|
| GraphQL `securityVulnerabilities(ecosystem:NPM, package:"next")` | `totalCount: 172`, cost **1 point**, 0.43 s, full GHSA + CVE + CVSS + version ranges |
| REST `/advisories?ecosystem=npm&affects=next` | 73 advisories, 0 withdrawn — **but `x-ratelimit-limit: 60`** (unauthenticated IP bucket) |
| REST `/repos/vercel/next.js/security-advisories` | **69 advisories, repo-keyed**, 0.3 s, 1 REST point, does not batch |
| GraphQL `repository.vulnerabilityAlerts{totalCount}` | **`0`** — requires admin on the repo. Useless to us. |
| `api.osv.dev/v1/querybatch` | batched multi-package query, works unauthenticated, returns IDs only (needs a second call for detail) |
| `api.deps.dev/v3alpha/projects/github.com%2Fvercel%2Fnext.js` | OSSF Scorecard dated **2026-08-24**, 14 checks, plus stars/forks/issues/licence. No auth. 0.3–0.8 s. |

### 1.8 OSSF Scorecard freshness, head to head

For `vercel/next.js`: ecosyste.ms carries a Scorecard dated **2025-08-11** (score 5.3);
deps.dev carries one dated **2026-08-24**. **deps.dev is a year fresher.** Use deps.dev for
Scorecard and ecosyste.ms for everything else.

---

## 2. Source comparison table

| source | fields provided | rate limit (measured) | licence / terms | cost | freshness | account? |
|---|---|---|---|---|---|---|
| **GitHub GraphQL** | description, topics, language, licence SPDX, stars, forks, **true** open-issue count, pushed_at, latest release, archived, disabled, README text, repo `databaseId` | 5,000 **points**/hr; **1 point per 30–50 repos**; 10 s gateway timeout | GitHub ToS §H + AUP §7 — API use expressly not "scraping" | free | live | yes (PAT, no scopes) |
| **GitHub REST** | same minus README-filename resolution; `open_issues_count` inflated by PRs | 60/hr anon, 5,000/hr PAT, ≤12,500/hr App, 15,000/hr EC; **304s are free** | as above | free | live | optional |
| **GitHub search (REST)** | full metadata, 100/page | **30/hr**, 1,000 results/query | as above | free | ~minutes | yes |
| **GitHub search (GraphQL)** | full metadata, 50/page | **1 point/50**, 1,000 results/query | as above | free | ~minutes | yes |
| **repos.ecosyste.ms** | most repo metadata + `previous_names` + README **filename** + stale Scorecard | **5,000/hr per IP** | **CC-BY-SA 4.0** — attribution + share-alike | free | days–weeks | **no** |
| **packages.ecosyste.ms** | downloads, `status:"deprecated"`, latest release date, repo URL, full advisory list | 5,000/hr per IP | CC-BY-SA 4.0 | free | ~1 day | **no** |
| **advisories.ecosyste.ms** | GHSA/CVE/CVSS/EPSS, package version ranges | 5,000/hr per IP | CC-BY-SA 4.0 | free | hours | **no** |
| **awesome.ecosyste.ms** | curated lists → projects + repo + readme + categories | 5,000/hr per IP | CC-BY-SA 4.0 | free | ~weeks | **no** |
| **GH Archive** | event stream: repo id + name, type, actor, timestamp | none observed; ~19 MB/hr | GitHub public event data; project code MIT | free (bandwidth) | hourly, **with gaps** | **no** |
| **npm registry** | official `deprecated` string, licence, repo URL, version times | none documented | npm Open-Source Terms; attribution not required | free | live | **no** |
| **npm downloads API** | real download counts, **128 packages/request** | none documented | as above | free | daily | **no** |
| **PyPI JSON** | `yanked`, licence, classifiers, project URLs | none documented; be polite | PyPI ToS; data is package metadata | free | live | **no** |
| **pypistats.org** | PyPI download counts (PyPI's own field is dead) | none documented | PyPI download stats, public | free | daily | **no** |
| **crates.io API** | downloads, recent downloads, `yanked`, repo URL | **403 without User-Agent**; prefers the dump | crates.io policies; UA with contact required | free | live | **no** |
| **crates.io db-dump** | full registry, 1.97 GB | n/a | as above | free | **daily** | **no** |
| **deps.dev** | OSSF Scorecard (freshest), stars/forks/issues, licence, `isDeprecated` per version | none documented | Apache-2.0 / open data | free | ~6 weeks (Scorecard cadence) | **no** |
| **OSV.dev** | advisories, batched queries | none documented | CC-BY-4.0 | free | hours | **no** |
| **BigQuery `githubarchive` / `github_repos`** | **NOT CALLED — 401, no credentials** | n/a | varies by dataset | **bytes scanned**; 1 TiB/mo free, then $6.25/TiB | hourly / 2016 snapshot | yes (GCP) |

---

## 3. Coverage matrix

**A** = authoritative, use this. **✓** = carries it, usable as fallback or cross-check.
**~** = carries something related but wrong or stale. **–** = does not carry it.

| required field | GitHub GraphQL | GitHub REST | repos.ecosyste.ms | packages.ecosyste.ms | npm / PyPI / crates | deps.dev | GH Archive |
|---|---|---|---|---|---|---|---|
| description | **A** | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| topics | **A** | ✓ | ✓ | ~ (`keywords`) | ~ (`keywords`) | – | – |
| primary language | **A** | ✓ | ✓ | – | – | – | – |
| licence | **A** (SPDX) | ✓ (SPDX) | ~ (`"mit"`, `"other"` — not SPDX) | ✓ (`normalized_licenses`) | ✓ | ✓ | – |
| stars | **A** | ✓ | ✓ (days stale) | ✓ | – | ✓ | – |
| forks | **A** | ✓ | ✓ (days stale) | ✓ | – | ✓ | – |
| open issue count | **A** (`issues(states:OPEN)`) | ~ **includes PRs** | ~ mirrors REST's inflated count | – | – | ~ (same inflation) | – |
| last push date | **A** | ✓ | ✓ (days stale) | – | – | – | ✓ (as an event) |
| latest release date | **A** (`latestRelease`) | ✓ | ✓ (`/releases`) | **A** for packaged projects | ✓ | ✓ | ✓ (ReleaseEvent) |
| archived flag | **A** | ✓ | ✓ (days stale) | – | – | – | – |
| **deprecated flag** | **–** (GitHub has no such concept) | – | ~ (`status`, usually null) | **A** (`status:"deprecated"`) | **A** (npm `deprecated`, PyPI `yanked`, crates `yanked`) | ✓ (`isDeprecated` per version) | – |
| **open security advisories** | ~ package-keyed only; `vulnerabilityAlerts` needs admin | ~ `/repos/…/security-advisories` is repo-keyed but **1 call/repo** | – | ✓ package-keyed, full objects | – | ✓ via Scorecard `Vulnerabilities` | – |
| README text | **A** (needs filename candidates) | ✓ (`/readme` auto-resolves, 1 call/repo) | ~ **filename only** | – | ~ (npm/PyPI ship a description body) | – | – |
| *(derived)* repo identity across renames | **A** (`databaseId`, `node(id:)`) | ✓ (301 → `/repositories/{id}`) | ✓ (`previous_names`) | – | – | – | ✓ (id+name pairs, free) |
| *(bonus)* download counts | – | – | – | **A** | **A** | ✓ | – |
| *(bonus)* OSSF Scorecard | – | – | ~ (a year stale) | – | – | **A** | – |

### The field no source covers well: **open security advisories, per repository**

Every advisory source in existence is keyed by **package**, not by repository, because that is how
vulnerabilities are actually scoped. Our ranking is keyed by repository. Bridging that gap is the
one genuinely unsolved problem:

- GitHub's `vulnerabilityAlerts` is repo-keyed but **returned `0` for `vercel/next.js`** — it
  requires admin permission on the repository. Dead end.
- GitHub's `/repos/{o}/{n}/security-advisories` **is** repo-keyed and correct (69 results for
  next.js) but costs one REST call per repo, does not batch, and covers only advisories the
  maintainer published through GitHub — not advisories filed against the package by others.
  At 5,000 REST/hr it adds ~97 hours to a 483,000-repo backfill.
- ecosyste.ms' reverse lookup (`packages/lookup?repository_url=`) is the obvious bridge and it
  **does not work**: 27.4 seconds, 100 fuzzy string matches, `psf/requests` → `reqesst`.
- A large fraction of repos — `torvalds/linux`, most agent-skill repos, most tooling — ship **no
  package at all**, so there is no package key to look up even in principle.

**The workable approach is to build the join in the forward direction and cache it.** Walk
`packages.ecosyste.ms` (or npm's `_changes` feed, PyPI's simple index, the crates.io dump) once,
read each package's `repository_url`, and materialise a `repo_url → [packages]` table locally.
That is a one-time bulk pass over ~13 M packages, not 483,000 reverse lookups. Then advisories per
repo = union of advisories across its mapped packages.

**Until that table exists, treat the advisory signal as present-or-absent rather than a count, and
populate it only for the packaged subset.** Say so in the UI. A missing advisory count must not be
rendered as "0 advisories" — a repo with no package would score as clean when it is simply unknown.

Two smaller gaps worth stating:

- **README path resolution.** `vercel/next.js` has no root README: `readme.md` is a 23-byte
  pointer reading `packages/next/README.md`. Six filename candidates found a README for 9 of 10
  sampled repos; next.js was the miss. Fall back to REST `/readme` (which resolves properly) or
  ecosyste.ms `metadata.files.readme` for the stragglers.
- **Licence normalisation.** ecosyste.ms returns `"mit"` and `"other"`; GitHub returns `"MIT"` and
  `"NOASSERTION"`. Normalise to SPDX on write, and do not let `"other"`/`"NOASSERTION"` collapse
  into "no licence" — they mean *unrecognised*, not *absent*.

---

## 4. Ingestion plan

### 4.1 Backfill: 755 → a defensible index

Both phases use GraphQL. Measured rate: **1 point per 50 repos (search) / per 30 repos (hydration)**,
**89,408 repos/hour at 8 workers**, budget **5,000 points/hour**.

**Phase 1 — discovery, which is also 12 of our 13 fields.**
`search(type:REPOSITORY, first:50)` sliced by stars, then by `created:` ranges wherever a slice
exceeds the 1,000-result cap. Seeded additionally from `awesome.ecosyste.ms` lists and the
topic queries in §1.2 (`topic:mcp-server`, `topic:agent-skills`, `topic:claude-skill`) so the
agent-skills niche is not left to star count alone.

**Phase 2 — README hydration.** Batch 30 aliased `repository(...)` lookups with six README
filename candidates. 1 point per batch.

| tier | repos | P1 points | P2 points | total points | budget-hours | wall clock @8 workers |
|---|---|---|---|---|---|---|
| agent-skills niche (topics) | ~60,000 | 1,200 | 2,000 | 3,200 | 0.6 h | **~40 min** |
| `stars:>=1000` | 65,429 | 1,309 | 2,181 | 3,490 | 0.7 h | **~45 min** |
| `stars:>=100` | 482,870 | 9,657 | 16,096 | 25,753 | **5.2 h** | **~8 h** |
| `stars:>=50` | 836,145 | 16,723 | 27,872 | 44,595 | 9 h | ~14 h |

**Recommendation: ship Tier "agent-skills + `stars:>=1000`", about 125,000 items, in under two
hours; run `stars:>=100` overnight to reach ~483,000.** Cost: **$0**, one free personal access
token, one machine. Compare: the same 483,000 repos through the current REST ingester would take
**290 hours** on the same token.

Phase 1 should close most of the 54-of-107 gap in the search evaluation, since a repo a human
wrote an evaluation query for is very likely above 100 stars or carries one of the seeded topics.
I could not verify this directly — the evaluation set is not in the repository. **Run the eval
against the Tier-1 index before starting the overnight Tier-2 run**, and if repos are still
missing, check them against §4.3 first: a repo that was renamed is a miss for a reason the index
size will never fix.

**Store `databaseId` as the primary key from the first row written.** Retrofitting it later means
re-resolving the entire index.

### 4.2 Incremental updates

Three loops at different cadences.

**Hourly — GH Archive, zero API quota.** Fetch `data.gharchive.org/YYYY-MM-DD-HH.json.gz`
(~19 MB). Extract `(repo.id, repo.name, type)`. Intersect `repo.id` against the index. Typically a
few thousand of the ~53,000 distinct repos per hour are ours; queue those for re-hydration.
**Sanity-check the file against a 7-day rolling median of event count and PushEvent share, and
re-fetch any hour that deviates by more than ~50%** — the `2026-10-07-15` file would have been
caught by that rule.

**Daily — targeted re-hydration.** Re-run Phase 2 batches over the queued repos plus everything in
`stars:>=1000` (2,181 points, ~45 min). Only re-fetch README when the stored
`defaultBranchRef.target.oid` has changed; store the oid for exactly this purpose.

**Weekly — full sweep for the things that emit no events.** Archival, deletion, transfer and
licence changes produce no GH Archive event. Re-resolve the whole index by `databaseId` in
`node(id:)` batches of 30: 16,096 points ≈ 3.2 budget-hours, ~5.4 h wall clock, once a week.

**Also weekly:** npm/PyPI/crates deprecation and download refresh (npm takes 128 packages per
downloads call; crates.io via the 1.97 GB daily dump), and a deps.dev Scorecard refresh — its
Scorecard cadence is roughly six-weekly, so weekly polling is already generous.

### 4.3 Detecting renames, transfers and archival

This is a live bug, not a hypothesis. **`facebook/react` no longer exists** — the repository was
transferred to the `react` organisation. GraphQL resolves it silently and tells you so:

```
repository(owner:"facebook", name:"react")  ->  nameWithOwner "react/react"   databaseId 10270250
repository(owner:"zeit",     name:"next.js") ->  nameWithOwner "vercel/next.js"
```

REST is louder about it: `GET /repos/zeit/next.js` returns
`301 Location: https://api.github.com/repositories/70107786`, and
`GET /repositories/70107786` returns the canonical `full_name`.
`repos.ecosyste.ms` simply returns `404` for `facebook/react` but *does* carry
`previous_names: ["zeit/next.js"]` for next.js.

**The fix is structural: the repository's numeric `databaseId` is the identity, the slug is a
label.** Four mechanisms, in order of cost:

1. **Free, hourly.** GH Archive events carry **both** `repo.id` and `repo.name`. If a known
   `repo.id` appears under a `repo.name` we have not seen, that is a rename or transfer, detected
   at zero API cost for any repo with public activity.
2. **Cheap, on write.** Every GraphQL hydration returns `nameWithOwner`. Compare it to the slug we
   asked for; a mismatch is a rename. The prototype prints exactly this. Write a redirect row from
   the old slug so the search evaluation and inbound links keep resolving.
3. **Weekly, batched.** `node(id: "R_kgDO…")` resolves by ID and batches 30 per point, so the whole
   index can be re-checked for rename, transfer **and archival** in one weekly sweep.
   (The legacy base64 node IDs are deprecated; GitHub returns a `next_global_id` in
   `extensions.warnings` — store that, not the old form.)
4. **Deletion.** A `databaseId` that resolves to `null` with a `NOT_FOUND` error, consistently,
   across two sweeps, is deleted or made private. Tombstone it rather than dropping the row —
   the vote graph and comments must survive the repo.

Archival specifically: `isArchived` only ever changes in the weekly sweep, because archiving emits
no event and an archived repo goes silent. Do not infer archival from inactivity; the ranking
already penalises staleness separately and double-counting it would be wrong.

---

## 5. What we must not do

**Scraping github.com.** The Acceptable Use Policies draw the line explicitly, and the line is
exactly where we need it:

> Scraping refers to extracting information from our Service via an automated process, such as a
> bot or webcrawler. **Scraping does not refer to the collection of information through our API.**
> Please see Section H of our Terms of Service for our API Terms.
> — GitHub Acceptable Use Policies, §7 Information Usage Restrictions

So our API ingestion is simply not the restricted activity. What **is** restricted:

> You will not reproduce, duplicate, copy, sell, resell or exploit any portion of the Service, use
> of the Service, or access to the Service without our express written permission.
> — AUP §6, Services Usage Limits

Read with §7 and ToS §D.8, this restricts reselling *access to GitHub*, not storing public
repository metadata. ToS §D.8 is explicit:

> By choosing to contribute Content to a public repository, you are choosing to and directing us to
> make such Content accessible to everyone on the internet. **Unless specifically set forth herein,
> these Terms do not restrict lawful access to or use of the contents of public repositories by
> third parties**, or by GitHub or its Affiliates.
> — GitHub Terms of Service, §D.8 Public Repositories and Lawful Access

**Personal information.** The binding restriction is about *people*, not repositories:

> You may not use information from the Service (whether scraped, collected through our API, or
> obtained otherwise) for spamming purposes, including for the purposes of sending unsolicited
> emails to users or **selling personal information, such as to recruiters, headhunters, and job
> boards**. Your use of information from the Service must comply with the GitHub Privacy Statement.
> — AUP §7

> You may not use the API to download data or Content from GitHub for spamming purposes, including
> for the purposes of selling GitHub users' personal information, such as to recruiters,
> headhunters, and job boards.
> — GitHub Terms of Service, §H API Terms

Concretely, do not:

- **Store or index maintainer email addresses.** They are in commit objects and in GH Archive
  payloads (`"author":{"email":"madara_08@mail.ru",…}` appears in the raw PushEvent data we
  downloaded). Strip them at the parser, before anything is persisted.
- **Build a contactable profile of a developer** from aggregated activity, or expose "who commits
  to what" as a browsable surface. Repository metadata is the product; people are not.
- **Sell, export or share any person-level dataset**, under any framing.

**Rate limits and tokens.**

> Abuse or excessively frequent requests to GitHub via the API may result in the temporary or
> permanent suspension of your Account's access to the API. GitHub, in our sole discretion, will
> determine abuse or excessive usage of the API. … **You may not share API tokens to exceed
> GitHub's rate limitations.**
> — GitHub Terms of Service, §H API Terms

So: **do not pool personal access tokens from contributors or users to multiply throughput.** It is
named and prohibited. If 150,000 repos/hour is ever insufficient, the sanctioned route is a GitHub
App (12,500 points/hr per installation) or GitHub's own paid tier — §H closes with *"GitHub may
offer subscription-based access to our API for those Users who require high-throughput access."*
Our measured plan needs 5.2 budget-hours for the entire backfill, so this will not come up.

Also do not use GitHub's visual design or logos — ToS §G.1 forbids reusing GitHub's HTML/CSS and
visual design elements, and §G.2 routes logo use through `github.com/logos`.

**Rank abuse.** AUP §4 prohibits *"rank abuse, such as automated starring or following"* and
*"inauthentic interactions, such as fake accounts and automated inauthentic activity."* reppit is a
voting product. Our vote graph must never drive any action on GitHub, and no reppit automation may
star, follow or watch anything.

**ecosyste.ms: CC-BY-SA 4.0 is the sharpest constraint we take on.**

The data licence (declared in their OpenAPI spec and site footer) requires **attribution** and
**share-alike**. Share-alike on a *derived* database is the risk: if reppit's rankings are a
derivative of ecosyste.ms data, the licence argues they must be published under CC-BY-SA too — and
`DECISIONS.md` states the hosted dataset is the product and deliberately not open. Therefore:

- **Attribute ecosyste.ms visibly** on any page or API response carrying their data, with a link to
  the CC-BY-SA 4.0 licence. This is required regardless of anything below.
- **Keep ecosyste.ms data out of the ranking inputs.** Derive every ranked signal from GitHub's API
  and from the registries (whose terms carry no share-alike), and use ecosyste.ms for
  **identity resolution and discovery** — `previous_names`, README filenames, package links —
  where it informs *which* record to fetch rather than becoming part of the stored signal.
- **Take legal advice before shipping anything commercial** that mixes CC-BY-SA data into a closed
  dataset. This is a genuine open question, not a formality, and it is the single strongest
  argument against making ecosyste.ms the primary source.

OSV.dev is CC-BY-4.0 (attribution, no share-alike) and deps.dev is Apache-2.0 — both are
comfortable. crates.io requires a **User-Agent with contact details** (we measured a hard `403`
without one) and prefers the daily dump over crawling; honour both. npm and PyPI impose no
attribution requirement, but send an identifying User-Agent anyway.

**Finally: never present a missing signal as a clean one.** A repo with no advisory data must
render as *unknown*, not as *0 advisories*. `DECISIONS.md` commits to ranking usefully at zero
users precisely by computing deprecation and advisory signals automatically — which makes a false
negative on those two fields the most damaging bug the index can ship.

---

## 6. Reproducing this

`scripts/ingest-prototype.py` runs both paths end to end over five deliberately awkward repos
(a transferred repo, two with non-standard README filenames, one with a deprecated npm package).
Standard library only.

```bash
python3 scripts/ingest-prototype.py                      # no credentials, ecosyste.ms path
GITHUB_TOKEN=ghp_... python3 scripts/ingest-prototype.py # adds the recommended GraphQL path
```

The token needs **no scopes** — a classic PAT with everything unchecked, or a fine-grained token
with "Public repositories: read", is enough for all public metadata.
