import { describe, it, expect } from "vitest";
import { parseRepoRef, repoToItem, type GhRepo } from "../src/github";

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
