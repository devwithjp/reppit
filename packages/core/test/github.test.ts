import { describe, it, expect, vi, afterEach } from "vitest";
import { parseRepoRef, repoToItem, fetchReadmeRaw, README_MAX_CHARS, GitHubClient, ingestSkillsFromRepo, type GhRepo } from "../src/github";

afterEach(() => vi.unstubAllGlobals());
describe("skill discovery", () => {
  const commit = "0123456789abcdef0123456789abcdef01234567";
  const repo: GhRepo = { id: 1, full_name: "example/skills", name: "skills", owner: { login: "example" }, html_url: "https://github.com/example/skills", description: null, language: null, license: { spdx_id: "MIT" }, stargazers_count: 10000, forks_count: 1, open_issues_count: 0, pushed_at: "2026-10-01T00:00:00Z", archived: false };
  it("discovers nested skills while keeping documentation and parent popularity out", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/repos/example/skills")) return Response.json(repo);
      if (url.endsWith("/repos/example/skills/commits/HEAD")) return Response.json({ sha: commit });
      if (url.includes("/git/trees/")) return Response.json({ tree: [
        { path: "skills/engineering/review/SKILL.md", type: "blob" },
        { path: "skills/video/SKILL.md", type: "blob" },
        { path: "docs/example/SKILL.md", type: "blob" },
      ] });
      return new Response("---\nname: video-editing\ndescription: Make cinematic videos\n---\nUse deliberate cuts.");
    });
    const skills = await ingestSkillsFromRepo(new GitHubClient(""), "example", "skills", "skills", ["video-editing", "motion-graphics"]);
    expect(skills.map(s => s.slug)).toEqual(["example/skills/skills/engineering/review", "example/skills/skills/video"]);
    expect(skills[0].readme).toContain("Use deliberate cuts");
    expect(skills[0].stars).toBe(0);
    expect(skills[0].topics).toEqual(["agent-skill", "video-editing"]);
    expect(skills[0].url).toBe(`https://github.com/example/skills/tree/${commit}/skills/engineering/review`);
  });
  it("refuses a truncated source tree instead of silently claiming a complete import", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/commits/HEAD")) return Response.json({ sha: commit });
      return Response.json(url.includes("/git/trees/") ? { tree: [], truncated: true } : repo);
    });
    await expect(ingestSkillsFromRepo(new GitHubClient(""), "example", "skills")).rejects.toThrow("truncated");
  });
});

describe("parseRepoRef", () => {
  it("parses owner/name and URLs", () => {
    expect(parseRepoRef("vercel/next.js")).toEqual({ owner: "vercel", name: "next.js" });
    expect(parseRepoRef("https://github.com/anthropics/skills/")).toEqual({ owner: "anthropics", name: "skills" });
    expect(parseRepoRef("https://github.com/a/b.git")).toEqual({ owner: "a", name: "b" });
    expect(parseRepoRef("not a repo")).toBeNull();
  });
});

describe("repoToItem", () => {
  it("maps GitHub fields and computes health", () => {
    const item = repoToItem({
      id: 42, full_name: "o/n", name: "n", owner: { login: "o" }, html_url: "https://github.com/o/n", description: "d",
      language: "Go", topics: ["x"], license: { spdx_id: "MIT" }, stargazers_count: 10, forks_count: 1,
      open_issues_count: 0, pushed_at: new Date().toISOString(), archived: false,
    }, "readme", null);
    expect(item.slug).toBe("o/n"); expect(item.license).toBe("MIT");
    expect(item.healthScore).toBeGreaterThan(0.5);
    expect(item.githubId).toBe(42);
  });

  it("never stores REST open_issues_count, which includes open PRs", () => {
    // vercel/next.js, measured 2026-10-08: REST 3,566 = 1,072 issues + 2,494 PRs.
    const r: GhRepo = {
      id: 70107786, full_name: "vercel/next.js", name: "next.js", owner: { login: "vercel" }, html_url: "https://github.com/vercel/next.js",
      description: "The React Framework", language: "JavaScript", topics: [], license: { spdx_id: "MIT" }, stargazers_count: 143_241,
      forks_count: 30_000, open_issues_count: 3566, pushed_at: "2026-10-08T00:00:00Z", archived: false,
    };
    const item = repoToItem(r, null, null);
    expect(item.openIssues).toBeNull();
    expect(item.openPullRequests).toBeNull();
    // Health ignores issue load entirely when it is unknown: same score whatever REST reported.
    expect(repoToItem({ ...r, open_issues_count: 0 }, null, null).healthScore).toBe(item.healthScore);
  });
});

describe("fetchReadmeRaw", () => {
  const routes = (map: Record<string, Response>) => async (url: string) => map[url] ?? new Response("", { status: 404 });
  it("falls through the usual names and truncates", async () => {
    const long = "x".repeat(README_MAX_CHARS + 10);
    const f = routes({ "https://raw.githubusercontent.com/a/b/HEAD/README.rst": new Response(long) });
    expect((await fetchReadmeRaw("a", "b", f))?.length).toBe(README_MAX_CHARS);
  });
  it("returns null when there is none, and throws on 5xx only when strict", async () => {
    expect(await fetchReadmeRaw("a", "b", routes({}))).toBeNull();
    const down = async () => new Response("", { status: 503 });
    expect(await fetchReadmeRaw("a", "b", down)).toBeNull();
    await expect(fetchReadmeRaw("a", "b", down, { strict: true })).rejects.toThrow(/503/);
  });
});
