import { describe, it, expect } from "vitest";
import { parseRepoRef, repoToItem } from "../src/github";

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
      full_name: "o/n", name: "n", owner: { login: "o" }, html_url: "https://github.com/o/n", description: "d",
      language: "Go", topics: ["x"], license: { spdx_id: "MIT" }, stargazers_count: 10, forks_count: 1,
      open_issues_count: 0, pushed_at: new Date().toISOString(), archived: false,
    }, "readme", null);
    expect(item.slug).toBe("o/n"); expect(item.license).toBe("MIT");
    expect(item.healthScore).toBeGreaterThan(0.5);
  });
});
