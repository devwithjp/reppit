import { describe, it, expect } from "vitest";
import {
  packageNameFromPackageJson, packageNameFromPyproject, githubSlugFromUrl, checkNpm, checkPypi, osvOpenAdvisories,
  countDistinctAdvisories, checkPackageSignals, type FetchLike,
} from "../src/signals";

/** Route table fake. Bodies below follow shapes recorded from the live APIs on 2026-10-11. */
function fake(routes: Record<string, unknown | ((init?: RequestInit) => unknown)>): FetchLike & { hits: string[] } {
  const hits: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    hits.push(url);
    const r = routes[url];
    if (r === undefined) return new Response("not found", { status: 404 });
    if (r instanceof Response) return r;
    const body = typeof r === "function" ? (r as (i?: RequestInit) => unknown)(init) : r;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as FetchLike & { hits: string[] };
  f.hits = hits;
  return f;
}

const REQUEST_LATEST = { name: "request", version: "2.88.2", deprecated: "request has been deprecated, see https://github.com/request/request/issues/3142", repository: { url: "git+https://github.com/request/request.git", type: "git" } };

describe("manifest parsing", () => {
  it("reads package.json names and skips private roots", () => {
    expect(packageNameFromPackageJson('{"name":"request","version":"2.88.2"}')).toBe("request");
    expect(packageNameFromPackageJson('{"name":"nextjs-project","private":true}')).toBeNull();
    expect(packageNameFromPackageJson("not json")).toBeNull();
    expect(packageNameFromPackageJson(null)).toBeNull();
  });
  it("reads PEP 621 and poetry names, not names from other tables", () => {
    expect(packageNameFromPyproject('[build-system]\nrequires = ["hatchling"]\n\n[project]\nname = "requests"\nversion = "2"\n')).toBe("requests");
    expect(packageNameFromPyproject('[tool.poetry]\nname = "httpie"  # cli\n')).toBe("httpie");
    expect(packageNameFromPyproject('[tool.black]\nname = "nope"\n')).toBeNull();
  });
  it("normalises GitHub repository URLs", () => {
    expect(githubSlugFromUrl("git+https://github.com/request/request.git")).toBe("request/request");
    expect(githubSlugFromUrl("git@github.com:Org/Repo.git")).toBe("org/repo");
    expect(githubSlugFromUrl("github:psf/requests")).toBe("psf/requests");
    expect(githubSlugFromUrl("https://github.com/psf/requests/tree/main")).toBe("psf/requests");
    expect(githubSlugFromUrl("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("checkNpm", () => {
  it("flags a deprecated package whose repository points back at the repo", async () => {
    const f = fake({ "https://registry.npmjs.org/request/latest": REQUEST_LATEST });
    expect(await checkNpm("request", ["request/request"], f)).toEqual({ ecosystem: "npm", name: "request", version: "2.88.2", deprecated: true, deprecationMessage: REQUEST_LATEST.deprecated });
  });
  it("ignores a same-named package that belongs to another repo", async () => {
    const f = fake({ "https://registry.npmjs.org/request/latest": REQUEST_LATEST });
    expect(await checkNpm("request", ["someone-else/request"], f)).toBeNull();
  });
  it("matches through an alias (renamed repo)", async () => {
    const f = fake({ "https://registry.npmjs.org/request/latest": REQUEST_LATEST });
    expect((await checkNpm("request", ["new-owner/request", "request/request"], f))?.deprecated).toBe(true);
  });
  it("encodes scoped names", async () => {
    const f = fake({ "https://registry.npmjs.org/@scope%2fpkg/latest": { version: "1.0.0", repository: "github:o/n" } });
    expect(await checkNpm("@scope/pkg", ["o/n"], f)).toMatchObject({ deprecated: false, deprecationMessage: null });
  });
});

describe("checkPypi", () => {
  const info = { name: "requests", version: "2.34.2", yanked: false, classifiers: [], project_urls: { Documentation: "https://requests.readthedocs.io", Source: "https://github.com/psf/requests" }, home_page: null };
  it("is not deprecated when active", async () => {
    const f = fake({ "https://pypi.org/pypi/requests/json": { info } });
    expect(await checkPypi("requests", ["psf/requests"], f)).toMatchObject({ ecosystem: "PyPI", deprecated: false });
  });
  it("is deprecated when the latest release is yanked or marked Inactive", async () => {
    const yanked = fake({ "https://pypi.org/pypi/requests/json": { info: { ...info, yanked: true, yanked_reason: "broken" } } });
    expect(await checkPypi("requests", ["psf/requests"], yanked)).toMatchObject({ deprecated: true, deprecationMessage: "latest release yanked: broken" });
    const inactive = fake({ "https://pypi.org/pypi/requests/json": { info: { ...info, classifiers: ["Development Status :: 7 - Inactive"] } } });
    expect((await checkPypi("requests", ["psf/requests"], inactive))?.deprecated).toBe(true);
  });
});

describe("OSV advisories", () => {
  it("merges aliases and drops withdrawn entries", () => {
    expect(countDistinctAdvisories([
      { id: "GHSA-1", aliases: ["CVE-1", "PYSEC-1"] },
      { id: "PYSEC-1", aliases: ["GHSA-1"] },
      { id: "GHSA-2" },
      { id: "GHSA-3", withdrawn: "2026-01-01T00:00:00Z" },
    ])).toBe(2);
  });
  it("counts distinct advisories against the given version", async () => {
    const f = fake({
      "https://api.osv.dev/v1/querybatch": { results: [{ vulns: [{ id: "GHSA-p8p7-x288-28g6", modified: "2026-09-10T03:49:52Z" }] }] },
      "https://api.osv.dev/v1/vulns/GHSA-p8p7-x288-28g6": { id: "GHSA-p8p7-x288-28g6", aliases: ["CVE-2023-28155"] },
    });
    expect(await osvOpenAdvisories({ ecosystem: "npm", name: "request" }, "2.88.2", f)).toBe(1);
  });
  it("returns 0 only when OSV answered with no vulns", async () => {
    const f = fake({ "https://api.osv.dev/v1/querybatch": { results: [{}] } });
    expect(await osvOpenAdvisories({ ecosystem: "npm", name: "left-pad" }, "1.3.0", f)).toBe(0);
  });
  it("returns null (unknown), never 0, when OSV fails", async () => {
    const f = fake({ "https://api.osv.dev/v1/querybatch": new Response("boom", { status: 500 }) });
    expect(await osvOpenAdvisories({ ecosystem: "npm", name: "x" }, "1.0.0", f)).toBeNull();
    const paged = fake({ "https://api.osv.dev/v1/querybatch": { results: [{ vulns: [{ id: "A" }], next_page_token: "t" }] } });
    expect(await osvOpenAdvisories({ ecosystem: "npm", name: "x" }, "1.0.0", paged)).toBeNull();
  });
});

describe("checkPackageSignals", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  it("repo with no package: everything unknown, but the check is recorded", async () => {
    const s = await checkPackageSignals(["torvalds/linux"], { packageJson: null, pyproject: null }, fake({}), now);
    expect(s).toEqual({ packageEcosystem: null, packageName: null, deprecated: null, deprecationMessage: null, advisoriesOpen: null, signalsCheckedAt: now });
  });
  it("deprecated npm package with an advisory", async () => {
    const f = fake({
      "https://registry.npmjs.org/request/latest": REQUEST_LATEST,
      "https://api.osv.dev/v1/querybatch": { results: [{ vulns: [{ id: "GHSA-p8p7-x288-28g6" }] }] },
      "https://api.osv.dev/v1/vulns/GHSA-p8p7-x288-28g6": { id: "GHSA-p8p7-x288-28g6" },
    });
    expect(await checkPackageSignals(["request/request"], { packageJson: '{"name":"request"}' }, f, now)).toMatchObject({
      packageEcosystem: "npm", packageName: "request", deprecated: true, advisoriesOpen: 1, signalsCheckedAt: now,
    });
  });
  it("registry outage returns null so callers keep existing values", async () => {
    const f = fake({ "https://registry.npmjs.org/request/latest": new Response("", { status: 503 }) });
    expect(await checkPackageSignals(["request/request"], { packageJson: '{"name":"request"}' }, f, now)).toBeNull();
  });
  it("advisory lookup failure leaves advisories unknown but keeps the deprecation result", async () => {
    const f = fake({ "https://registry.npmjs.org/request/latest": REQUEST_LATEST, "https://api.osv.dev/v1/querybatch": new Response("", { status: 500 }) });
    expect(await checkPackageSignals(["request/request"], { packageJson: '{"name":"request"}' }, f, now)).toMatchObject({ deprecated: true, advisoriesOpen: null });
  });
});
