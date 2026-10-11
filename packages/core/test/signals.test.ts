import { describe, it, expect } from "vitest";
import {
  packageNameFromPackageJson, packageNameFromPyproject, githubSlugFromUrl, checkNpm, checkPypi, osvOpenAdvisories,
  countDistinctAdvisories, checkPackageSignals, type FetchLike,
  packageNameFromSetupCfg, packageNameFromSetupPy, packageNameFromCargoToml, checkCrates, osvOpenAdvisoriesBatch, resolvePackage,
  fetchManifestsRaw, goModInfo, goProxyEscape, checkGo, confirmNoPackage, resolvePackages, combinePackageSignals,
  registryReleases, isPrerelease,
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
    expect(await checkNpm("request", ["request/request"], f)).toEqual({ ecosystem: "npm", name: "request", version: "2.88.2", deprecated: true, deprecationMessage: REQUEST_LATEST.deprecated, license: null });
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
    expect(await checkPypi("requests", ["psf/requests"], yanked)).toMatchObject({ deprecated: true, deprecationMessage: "every release yanked: broken" });
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
    expect(s).toEqual({ packageEcosystem: null, packageName: null, installPackage: null, installOptions: null, installKind: null, publishedPackages: null, deprecated: null, deprecationMessage: null, advisoriesOpen: null, signalsCheckedAt: now });
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

describe("more manifests", () => {
  it("reads setup.cfg, setup.py and Cargo.toml names", () => {
    expect(packageNameFromSetupCfg("[metadata]\nname = attrs\nversion = 1\n[options]\nname = nope")).toBe("attrs");
    expect(packageNameFromSetupCfg("[options]\nname = nope")).toBeNull();
    expect(packageNameFromSetupPy("from setuptools import setup\nsetup(\n    name='pytesseract',\n    version=v,\n)")).toBe("pytesseract");
    expect(packageNameFromSetupPy("setup(name=NAME)")).toBeNull();
    expect(packageNameFromCargoToml('[package]\nname = "clap"\nversion = "4.5.0"\n[dependencies]\nname = "x"')).toBe("clap");
    expect(packageNameFromCargoToml('[workspace]\nmembers = ["clap_builder"]')).toBeNull();
  });
});

describe("crates.io", () => {
  const crate = { name: "clap", repository: "https://github.com/clap-rs/clap", max_version: "4.5.20", max_stable_version: "4.5.20" };
  it("verifies the repository link and uses the newest live version", async () => {
    const f = fake({ "https://crates.io/api/v1/crates/clap": { crate, versions: [{ num: "4.5.20", yanked: false, created_at: "2026-09-01T00:00:00Z" }, { num: "4.5.19", yanked: false, created_at: "2026-08-01T00:00:00Z" }] } });
    expect(await checkCrates("clap", ["clap-rs/clap"], f)).toMatchObject({ ecosystem: "crates.io", version: "4.5.20", deprecated: false });
    expect(await checkCrates("clap", ["someone/else"], f)).toBeNull();
  });
  it("is deprecated when the latest version is yanked", async () => {
    const f = fake({ "https://crates.io/api/v1/crates/clap": { crate: { ...crate, max_version: "0.0.0", max_stable_version: null }, versions: [{ num: "1.0.1", yanked: true, created_at: "2026-09-01T00:00:00Z" }, { num: "1.0.0", yanked: true, created_at: "2026-01-01T00:00:00Z" }] } });
    expect(await checkCrates("clap", ["clap-rs/clap"], f)).toMatchObject({ deprecated: true, deprecationMessage: "latest version 1.0.1 yanked", version: "1.0.1" });
  });
});

describe("PyPI every release yanked", () => {
  it("is deprecated only when all published releases are yanked", async () => {
    const info = { name: "x", version: "2.0", project_urls: { Source: "https://github.com/a/x" }, classifiers: [] };
    const all = fake({ "https://pypi.org/pypi/x/json": { info, releases: { "1.0": [{ yanked: true }], "2.0": [{ yanked: true }], "0.1": [] } } });
    expect((await checkPypi("x", ["a/x"], all))?.deprecated).toBe(true);
    const some = fake({ "https://pypi.org/pypi/x/json": { info, releases: { "1.0": [{ yanked: true }], "2.0": [{ yanked: false }] } } });
    expect((await checkPypi("x", ["a/x"], some))?.deprecated).toBe(false);
  });
});

describe("resolvePackage", () => {
  it("falls through to setup.py and Cargo.toml when earlier names do not link back", async () => {
    const f = fake({
      "https://registry.npmjs.org/docs-site/latest": { name: "docs-site", version: "1.0.0", repository: "https://github.com/other/thing" },
      "https://crates.io/api/v1/crates/clap": { crate: { name: "clap", repository: "https://github.com/clap-rs/clap", max_stable_version: "4.5.20" }, versions: [{ num: "4.5.20", yanked: false, created_at: "2026-09-01T00:00:00Z" }] },
    });
    const hit = await resolvePackage(["clap-rs/clap"], { packageJson: '{"name":"docs-site"}', cargoToml: '[package]\nname = "clap"' }, f);
    expect(hit).toMatchObject({ ecosystem: "crates.io", name: "clap" });
  });
});

describe("OSV batch", () => {
  it("answers many packages in one call, shares vuln details, and leaves paged results unknown", async () => {
    let batchCalls = 0;
    const f = fake({
      "https://api.osv.dev/v1/querybatch": (init?: RequestInit) => {
        batchCalls++;
        const q = JSON.parse(String(init?.body)).queries as { package: { name: string } }[];
        expect(q).toHaveLength(3);
        return { results: [{ vulns: [{ id: "GHSA-1" }, { id: "PYSEC-1" }] }, {}, { vulns: [{ id: "GHSA-1" }], next_page_token: "t" }] };
      },
      "https://api.osv.dev/v1/vulns/GHSA-1": { id: "GHSA-1", aliases: ["PYSEC-1"] },
      "https://api.osv.dev/v1/vulns/PYSEC-1": { id: "PYSEC-1", aliases: ["GHSA-1"] },
    });
    const out = await osvOpenAdvisoriesBatch([
      { ecosystem: "PyPI", name: "a", version: "1" }, { ecosystem: "npm", name: "b", version: "2" }, { ecosystem: "crates.io", name: "c", version: "3" },
    ], f);
    expect(out).toEqual([1, 0, null]);
    expect(batchCalls).toBe(1);
    expect(f.hits.filter((h) => h.includes("/vulns/GHSA-1"))).toHaveLength(1);
  });
  it("makes everything unknown when the batch call fails", async () => {
    const f = fake({ "https://api.osv.dev/v1/querybatch": new Response("", { status: 503 }) });
    expect(await osvOpenAdvisoriesBatch([{ ecosystem: "npm", name: "b", version: "2" }], f)).toEqual([null]);
  });
});

describe("package resolution for monorepos and renamed packages", () => {
  const npmPkg = (name: string, repo: string, extra: object = {}) => ({ name, version: "1.0.0", repository: { url: `git+https://github.com/${repo}.git` }, ...extra });
  it("prefers the repo's own name over the name a manifest gives (docling, not docling-slim)", async () => {
    const urls = { project_urls: { Repository: "https://github.com/docling-project/docling" } };
    const f = fake({
      "https://pypi.org/pypi/docling/json": { info: { name: "docling", version: "2.0", ...urls } },
      "https://pypi.org/pypi/docling-slim/json": { info: { name: "docling-slim", version: "2.0", ...urls } },
    });
    expect(await resolvePackage(["docling-project/docling"], { pyproject: '[project]\nname = "docling-slim"' }, f)).toMatchObject({ ecosystem: "PyPI", name: "docling" });
  });
  it("finds a package in a folder named like the repo when the root package.json is private", async () => {
    const f = fake({ "https://registry.npmjs.org/drizzle-kit/latest": npmPkg("drizzle-kit", "drizzle-team/drizzle-orm") });
    const hit = await resolvePackage(["drizzle-team/drizzle-orm"], { packageJson: '{"name":"drizzle-root","private":true}', subPackageJsons: ['{"name":"drizzle-kit"}', null] }, f);
    expect(hit).toMatchObject({ ecosystem: "npm", name: "drizzle-kit" });
  });
  it("falls back to npm search by repository link", async () => {
    const f = fake({
      "https://registry.npmjs.org/-/v1/search?text=thing&size=10": { objects: [
        { package: { name: "unrelated", links: { repository: "https://github.com/x/other" } } },
        { package: { name: "@acme/thing-core", links: { repository: "https://github.com/acme/thing" } } },
      ] },
      "https://registry.npmjs.org/@acme%2fthing-core/latest": npmPkg("@acme/thing-core", "acme/thing"),
    });
    expect(await resolvePackage(["acme/thing"], { packageJson: '{"name":"root","private":true}' }, f)).toMatchObject({ name: "@acme/thing-core" });
  });
  it("reads the declared SPDX licence and ignores free text", async () => {
    const f = fake({ "https://registry.npmjs.org/date-fns/latest": npmPkg("date-fns", "date-fns/date-fns", { license: "MIT" }) });
    expect((await resolvePackage(["date-fns/date-fns"], { packageJson: '{"name":"@date-fns/root","private":true}' }, f))?.license).toBe("MIT");
    const { spdxish } = await import("../src/signals");
    expect(spdxish("Apache-2.0 OR MIT")).toBe("Apache-2.0 OR MIT");
    expect(spdxish({ type: "BSD-3-Clause" })).toBe("BSD-3-Clause");
    expect(spdxish("Copyright (c) 2020 someone. All rights reserved and more text here")).toBeNull();
    expect(spdxish("UNLICENSED")).toBeNull();
  });
});

describe("confirmed absence of a package", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  it("stores 'none' only when every manifest fetch answered found or 404", async () => {
    const raw404 = async () => new Response("", { status: 404 });
    const m = await fetchManifestsRaw("acme", "awesome-list", raw404);
    expect(m.complete).toBe(true);
    expect(await checkPackageSignals(["acme/awesome-list"], m, raw404, now)).toMatchObject({ packageEcosystem: "none", deprecated: null, advisoriesOpen: null });
  });
  it("stays unknown when any manifest fetch failed or was rate limited", async () => {
    let n = 0;
    const flaky = async () => (++n === 2 ? new Response("", { status: 503 }) : new Response("", { status: 404 }));
    const m = await fetchManifestsRaw("acme", "app", flaky);
    expect(m.complete).toBe(false);
    expect(await checkPackageSignals(["acme/app"], m, async () => new Response("", { status: 404 }), now)).toMatchObject({ packageEcosystem: null });
    const thrown = await fetchManifestsRaw("acme", "app", async () => { throw new Error("network"); });
    expect(thrown.complete).toBe(false);
  });
  it("manifests from GraphQL (no completeness claim) never confirm absence", async () => {
    expect(await checkPackageSignals(["acme/app"], { packageJson: null, pyproject: null }, async () => new Response("", { status: 404 }), now)).toMatchObject({ packageEcosystem: null });
  });
  it("a monorepo whose folders could not be fetched is not confirmed", async () => {
    const f = async (url: string) => url.endsWith("/HEAD/package.json") ? new Response('{"name":"root","private":true}') : url.includes("/HEAD/app/") ? new Response("", { status: 500 }) : new Response("", { status: 404 });
    expect((await fetchManifestsRaw("acme", "app", f)).complete).toBe(false);
  });
});

describe("Go modules", () => {
  it("reads the module path and Go's Deprecated convention", () => {
    expect(goModInfo("module github.com/ollama/ollama\n\ngo 1.24")).toEqual({ module: "github.com/ollama/ollama", deprecated: null });
    expect(goModInfo("// Deprecated: use github.com/x/y/v2 instead.\nmodule github.com/x/y\n")).toEqual({ module: "github.com/x/y", deprecated: "use github.com/x/y/v2 instead." });
    expect(goModInfo("go 1.22")).toBeNull();
    expect(goProxyEscape("github.com/BurntSushi/toml")).toBe("github.com/!burnt!sushi/toml");
  });
  it("verifies vanity paths through the proxy's Origin URL", async () => {
    const f = fake({ "https://proxy.golang.org/gorm.io/gorm/@latest": { Version: "v1.31.2", Origin: { URL: "https://github.com/go-gorm/gorm" } } });
    expect(await checkGo("module gorm.io/gorm", ["go-gorm/gorm"], f)).toMatchObject({ ecosystem: "Go", name: "gorm.io/gorm", version: "v1.31.2", deprecated: false });
    expect(await checkGo("module gorm.io/gorm", ["someone/fork"], f)).toBeNull();
  });
  it("is not a package when the proxy has never seen it", async () => {
    expect(await checkGo("module github.com/acme/tool", ["acme/tool"], fake({}))).toBeNull();
  });
  it("resolvePackage tries Go first when go.mod names this repo", async () => {
    const f = fake({ "https://proxy.golang.org/github.com/ollama/ollama/@latest": { Version: "v0.12.0", Origin: { URL: "https://github.com/ollama/ollama" } } });
    expect(await resolvePackage(["ollama/ollama"], { goMod: "module github.com/ollama/ollama" }, f)).toMatchObject({ ecosystem: "Go", name: "github.com/ollama/ollama" });
  });
});

describe("absence is not confirmed beside an ecosystem we cannot check", () => {
  it("a Java or Ruby repo with no npm/PyPI/crates/Go package stays unknown", async () => {
    const f = async (url: string) => (url.endsWith("/pom.xml") ? new Response("", { status: 200 }) : new Response("", { status: 404 }));
    expect(await confirmNoPackage("acme/javalib", { complete: true }, f)).toBe(false);
    const none = async () => new Response("", { status: 404 });
    expect(await confirmNoPackage("acme/list", { complete: true }, none)).toBe(true);
    expect(await confirmNoPackage("acme/list", { complete: false }, none)).toBe(false);
    expect(await confirmNoPackage("acme/list", { complete: true }, async () => new Response("", { status: 429 }))).toBe(false);
  });
});

describe("self-declared repository links", () => {
  it("rejects a thin repo-name package in an ecosystem that does not fit the repo's language", async () => {
    const f = fake({
      "https://registry.npmjs.org/rails/latest": { name: "rails", version: "4.1.0-beta", repository: { url: "git://github.com/rails/rails.git" } },
      "https://registry.npmjs.org/rails": { versions: { "4.1.0-beta": {} } },
    });
    const m = { packageJson: '{"private":true,"workspaces":["actioncable"]}' };
    expect(await resolvePackage(["rails/rails"], m, f, { language: "Ruby" })).toBeNull();
    // Unknown language: no extra requirement (the link back still has to hold).
    expect(await resolvePackage(["rails/rails"], m, f)).toMatchObject({ name: "rails" });
  });
  it("accepts an established cross-language package (typescript from a Go repo)", async () => {
    const f = fake({
      "https://registry.npmjs.org/typescript/latest": { name: "typescript", version: "6.0.2", repository: { url: "git+https://github.com/microsoft/TypeScript.git" } },
      "https://registry.npmjs.org/typescript": { versions: { "5.9.0": {}, "6.0.0": {}, "6.0.1": {}, "6.0.2": {}, "6.1.0-beta": {} } },
    });
    expect(await resolvePackage(["microsoft/TypeScript"], { packageJson: '{"private":true}' }, f, { language: "Go" })).toMatchObject({ name: "typescript" });
  });
  it("still trusts a name the repo's own manifest gives, whatever the language", async () => {
    const f = fake({ "https://registry.npmjs.org/tool/latest": { name: "tool", version: "1.0.0", repository: "acme/tool" } });
    expect(await resolvePackage(["acme/tool"], { packageJson: '{"name":"tool"}' }, f, { language: "Go" })).toMatchObject({ name: "tool" });
  });
});

describe("install package: only the repo's primary package", () => {
  const npm = (name: string, repo: string, extra: object = {}) => ({ name, version: "1.0.0", repository: { url: `git+https://github.com/${repo}.git` }, ...extra });
  const search = (repo: string, names: string[]) => ({ objects: names.map((n) => ({ package: { name: n, links: { repository: `https://github.com/${repo}` } } })) });
  const privateRoot = { packageJson: '{"name":"root","private":true}' };

  it("prisma/orm: a tooling side package is published, not installable", async () => {
    const f = fake({
      "https://registry.npmjs.org/orm/latest": npm("orm", "dresende/node-orm2"),
      "https://registry.npmjs.org/-/v1/search?text=orm&size=10": search("prisma/orm", ["@prisma/orm-toolchain"]),
      "https://registry.npmjs.org/@prisma%2form-toolchain/latest": npm("@prisma/orm-toolchain", "prisma/orm", { version: "8.0.0-rc.1" }),
    });
    const r = await resolvePackages(["prisma/orm"], privateRoot, f, { language: "TypeScript" });
    expect(r.packages.map((p) => p.name)).toEqual(["@prisma/orm-toolchain"]);
    expect(r.install).toBeNull();
  });
  it("TanStack/query: core and react packages link back, neither is the install", async () => {
    const f = fake({
      "https://registry.npmjs.org/-/v1/search?text=query&size=10": search("TanStack/query", ["@tanstack/query-core", "@tanstack/react-query"]),
      "https://registry.npmjs.org/@tanstack%2fquery-core/latest": npm("@tanstack/query-core", "TanStack/query"),
      "https://registry.npmjs.org/@tanstack%2freact-query/latest": npm("@tanstack/react-query", "TanStack/query"),
    });
    const r = await resolvePackages(["TanStack/query"], privateRoot, f, { language: "TypeScript" });
    expect(r.packages.map((p) => p.name)).toEqual(["@tanstack/query-core", "@tanstack/react-query"]);
    expect(r.install).toBeNull();
  });
  it("diegomura/react-pdf: the same-named npm package belongs to someone else; types are not the install", async () => {
    const f = fake({
      "https://registry.npmjs.org/react-pdf/latest": npm("react-pdf", "wojtekmaj/react-pdf"),
      "https://registry.npmjs.org/-/v1/search?text=react-pdf&size=10": search("diegomura/react-pdf", ["@react-pdf/types"]),
      "https://registry.npmjs.org/@react-pdf%2ftypes/latest": npm("@react-pdf/types", "diegomura/react-pdf"),
    });
    const r = await resolvePackages(["diegomura/react-pdf"], privateRoot, f, { language: "TypeScript" });
    expect(r.packages.map((p) => p.name)).toEqual(["@react-pdf/types"]);
    expect(r.install).toBeNull();
  });
  it("OpenHands: a UI package found by search is never the install; the root pyproject's package is", async () => {
    const urls = { project_urls: { Repository: "https://github.com/OpenHands/OpenHands" } };
    const base = {
      "https://registry.npmjs.org/-/v1/search?text=openhands&size=10": search("OpenHands/OpenHands", ["@openhands/agent-canvas"]),
      "https://registry.npmjs.org/@openhands%2fagent-canvas/latest": npm("@openhands/agent-canvas", "OpenHands/OpenHands"),
      "https://registry.npmjs.org/@openhands%2fagent-canvas": { versions: { "1.0.0": {}, "1.1.0": {}, "1.2.0": {} } },
    };
    const noPy = await resolvePackages(["OpenHands/OpenHands"], privateRoot, fake(base), { language: "Python" });
    expect(noPy.packages.map((p) => p.name)).toEqual(["@openhands/agent-canvas"]);
    expect(noPy.install).toBeNull();
    // As on GitHub today: the root package.json itself publishes the UI package. Still not the install for a Python repo.
    const rootUi = await resolvePackages(["OpenHands/OpenHands"], { packageJson: '{"name":"@openhands/agent-canvas"}' }, fake(base), { language: "Python" });
    expect(rootUi.packages.map((p) => p.name)).toEqual(["@openhands/agent-canvas"]);
    expect(rootUi.install).toBeNull();
    const withPy = await resolvePackages(["OpenHands/OpenHands"], { ...privateRoot, pyproject: '[project]\nname = "openhands-ai"' },
      fake({ ...base, "https://pypi.org/pypi/openhands-ai/json": { info: { name: "openhands-ai", version: "1.0", ...urls } } }), { language: "Python" });
    expect(withPy.install?.name).toBe("openhands-ai");
  });
  it("installs when the name is the repo's, @owner/repo, or the root manifest's own", async () => {
    const ws = await resolvePackages(["websockets/ws"], { packageJson: '{"name":"ws"}' }, fake({ "https://registry.npmjs.org/ws/latest": npm("ws", "websockets/ws") }));
    expect(ws.install?.name).toBe("ws");
    const scoped = await resolvePackages(["acme/thing"], privateRoot, fake({ "https://registry.npmjs.org/@acme%2fthing/latest": npm("@acme/thing", "acme/thing") }));
    expect(scoped.install?.name).toBe("@acme/thing");
    const rootName = await resolvePackages(["vercel/next.js"], { packageJson: '{"name":"next"}' }, fake({ "https://registry.npmjs.org/next/latest": npm("next", "vercel/next.js") }));
    expect(rootName.install?.name).toBe("next");
    // Repo name beats the root manifest's name (docling, not docling-slim).
    const urls = { project_urls: { Repository: "https://github.com/docling-project/docling" } };
    const docling = await resolvePackages(["docling-project/docling"], { pyproject: '[project]\nname = "docling-slim"' }, fake({
      "https://pypi.org/pypi/docling/json": { info: { name: "docling", version: "2", ...urls } },
      "https://pypi.org/pypi/docling-slim/json": { info: { name: "docling-slim", version: "2", ...urls } },
    }));
    expect(docling.install?.name).toBe("docling");
    expect(docling.packages.map((p) => p.name)).toEqual(["docling", "docling-slim"]);
  });
});

describe("signals across every published package", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const pkg = (name: string, deprecated = false) => ({ ecosystem: "npm" as const, name, version: "1.0.0", deprecated, deprecationMessage: deprecated ? "gone" : null });
  it("sums advisories over all packages, and is unknown if any count is unknown", () => {
    const r = { packages: [pkg("@x/core"), pkg("@x/react")], install: null, options: [], installKind: "docs" as const };
    expect(combinePackageSignals(r, [1, 2], now)).toMatchObject({ advisoriesOpen: 3, installPackage: null, packageName: "@x/core", publishedPackages: [{ ecosystem: "npm", name: "@x/core" }, { ecosystem: "npm", name: "@x/react" }] });
    expect(combinePackageSignals(r, [1, null], now).advisoriesOpen).toBeNull();
  });
  it("deprecation follows the primary package only; side packages alone leave it unknown", () => {
    expect(combinePackageSignals({ packages: [pkg("a", true), pkg("b")], install: null, options: [], installKind: "docs" }, [0, 0], now).deprecated).toBeNull();
    expect(combinePackageSignals({ packages: [pkg("a", true), pkg("b", true)], install: null, options: [], installKind: "docs" }, [0, 0], now).deprecated).toBeNull();
    const app = pkg("tool", true);
    expect(combinePackageSignals({ packages: [app], install: null, options: [], installKind: "app" }, [0], now).deprecated).toBe(true);
    const main = pkg("main", true);
    expect(combinePackageSignals({ packages: [main, pkg("side")], install: main, options: [main], installKind: "package" }, [0, 0], now)).toMatchObject({ deprecated: true, installPackage: "main" });
  });
});

describe("release cadence from registries (deps.dev)", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  const v = (version: string, publishedAt: string) => ({ versionKey: { version }, publishedAt });
  it("takes the newest stable release and counts stable releases in the past year", async () => {
    const f = fake({ "https://api.deps.dev/v3/systems/npm/packages/zod": { versions: [
      v("3.0.0", "2024-01-01T00:00:00Z"), v("4.6.4", "2026-08-01T00:00:00Z"), v("4.6.5", "2026-09-13T23:25:14Z"), v("4.7.0-beta.1", "2026-10-01T00:00:00Z"),
    ] } });
    expect(await registryReleases("npm", "zod", f, now)).toEqual({ lastReleaseAt: new Date("2026-09-13T23:25:14Z"), releasesLastYear: 2 });
  });
  it("ignores Go pseudo-versions and PyPI pre-releases, encodes scoped and module names", async () => {
    expect(isPrerelease("Go", "v1.31.3-0.20260914162115-b3d3bf219f02")).toBe(true);
    expect(isPrerelease("PyPI", "2.0.0rc1")).toBe(true);
    expect(isPrerelease("PyPI", "2.0.0")).toBe(false);
    const f = fake({ "https://api.deps.dev/v3/systems/go/packages/gorm.io%2Fgorm": { versions: [v("v1.31.2", "2026-06-22T03:37:04Z"), v("v1.31.3-0.20260914162115-b3d3bf219f02", "2026-09-14T00:00:00Z")] } });
    expect((await registryReleases("Go", "gorm.io/gorm", f, now))?.lastReleaseAt).toEqual(new Date("2026-06-22T03:37:04Z"));
    expect(await registryReleases("npm", "nothing", fake({}), now)).toBeNull();
  });
  it("is applied from the install package only, never a side package", () => {
    const pkg = { ecosystem: "npm" as const, name: "@x/core", version: "1", deprecated: false, deprecationMessage: null };
    const rel = { lastReleaseAt: now, releasesLastYear: 9 };
    expect(combinePackageSignals({ packages: [pkg], install: null, options: [], installKind: "docs" }, [0], now, rel)).not.toHaveProperty("lastReleaseAt");
    expect(combinePackageSignals({ packages: [pkg], install: pkg, options: [pkg], installKind: "package" }, [0], now, rel)).toMatchObject({ lastReleaseAt: now, releasesLastYear: 9 });
  });
});

describe("apps and registry choice", () => {
  const pypi = (name: string, repo: string) => ({ info: { name, version: "1.0", project_urls: { Source: `https://github.com/${repo}` } }, releases: { "1.0": [{}], "1.1": [{}], "1.2": [{}] } });
  const crate = (name: string, repo: string, bins: string[] = []) => ({ crate: { name, repository: `https://github.com/${repo}`, max_stable_version: "1.0.0" }, versions: [{ num: "1.0.0", yanked: false, created_at: "2026-09-01T00:00:00Z", bin_names: bins }, { num: "0.9.0", yanked: false, created_at: "2026-08-01T00:00:00Z" }, { num: "0.8.0", yanked: false, created_at: "2026-07-01T00:00:00Z" }] });
  it("a Go module whose root is a main package is an app: no go get", async () => {
    const f = fake({ "https://proxy.golang.org/github.com/ollama/ollama/@latest": { Version: "v0.12.0", Origin: { URL: "https://github.com/ollama/ollama" } } });
    const r = await resolvePackages(["ollama/ollama"], { goMod: "module github.com/ollama/ollama", goRootIsMain: true }, f, { language: "Go" });
    expect(r).toMatchObject({ install: null, installKind: "app", options: [] });
    expect(r.packages[0].name).toBe("github.com/ollama/ollama"); // still used for advisories
    const lib = await resolvePackages(["ollama/ollama"], { goMod: "module github.com/ollama/ollama" }, f, { language: "Go" });
    expect(lib).toMatchObject({ installKind: "package", install: { name: "github.com/ollama/ollama" } });
  });
  it("a crate whose binary carries its name is an app (hurl); a fixture binary is not (clap)", async () => {
    const hurl = await resolvePackages(["Orange-OpenSource/hurl"], { cargoToml: "[workspace]" }, fake({ "https://crates.io/api/v1/crates/hurl": crate("hurl", "Orange-OpenSource/hurl", ["hurl"]) }), { language: "Rust" });
    expect(hurl).toMatchObject({ install: null, installKind: "app" });
    const clap = await resolvePackages(["clap-rs/clap"], { cargoToml: '[package]\nname = "clap"' }, fake({ "https://crates.io/api/v1/crates/clap": crate("clap", "clap-rs/clap", ["stdio-fixture"]) }), { language: "Rust" });
    expect(clap).toMatchObject({ installKind: "package", install: { name: "clap" } });
  });
  it("offers one install per registry, the repo language's first (polars)", async () => {
    const f = fake({ "https://crates.io/api/v1/crates/polars": crate("polars", "pola-rs/polars"), "https://pypi.org/pypi/polars/json": pypi("polars", "pola-rs/polars") });
    const r = await resolvePackages(["pola-rs/polars"], { cargoToml: "[workspace]" }, f, { language: "Rust" });
    expect(r.options.map((o) => o.ecosystem)).toEqual(["crates.io", "PyPI"]);
    expect(r.install?.ecosystem).toBe("crates.io");
    const asPython = await resolvePackages(["pola-rs/polars"], { cargoToml: "[workspace]" }, f, { language: "Python" });
    expect(asPython.install?.ecosystem).toBe("PyPI");
  });
  it("skips an app entry for a library entry elsewhere (uv: the crate is a binary, pip install uv is the install)", async () => {
    const f = fake({ "https://crates.io/api/v1/crates/uv": crate("uv", "astral-sh/uv", ["uv"]), "https://pypi.org/pypi/uv/json": pypi("uv", "astral-sh/uv") });
    const r = await resolvePackages(["astral-sh/uv"], { cargoToml: "[workspace]", pyproject: '[project]\nname = "uv"' }, f, { language: "Rust" });
    expect(r).toMatchObject({ installKind: "package", install: { ecosystem: "PyPI", name: "uv" } });
  });
});
