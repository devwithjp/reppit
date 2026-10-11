import { describe, it, expect } from "vitest";
import { cleanWhy, parentRepo, safeNext, installCommand } from "./labels";

describe("cleanWhy", () => {
  it("drops the match label", () => {
    expect(cleanWhy("Good match: actively maintained, 8.9k stars.", "repo")).toBe("Actively maintained, 8.9k stars.");
    expect(cleanWhy("strong match.", "repo")).toBeNull();
    expect(cleanWhy("partial match: low maintenance activity.", "repo")).toBe("Low maintenance activity.");
  });
  it("never gives a skill its parent repo's stars", () => {
    expect(cleanWhy("Good match: 180k stars, works on codex, claude-code.", "skill")).toBe("Works on codex, claude-code.");
    expect(cleanWhy("good match: actively maintained, 296k stars.", "skill")).toBe("Actively maintained.");
  });
  it("leaves an LLM-written line alone", () => {
    expect(cleanWhy("Extracts tables from text PDFs; reported working in Claude Code.", "repo")).toBe("Extracts tables from text PDFs; reported working in Claude Code.");
  });
});

describe("helpers", () => {
  it("finds a skill's parent repo", () => {
    expect(parentRepo("skill", "obra/superpowers/skills/tdd")).toBe("obra/superpowers");
    expect(parentRepo("repo", "a/b")).toBeNull();
  });
  it("keeps next on site", () => {
    expect(safeNext("//evil.example.com")).toBe("/");
    expect(safeNext("/r/a/b")).toBe("/r/a/b");
  });
  it("installs a verified package, else clones", () => {
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", packageName: "b", packageEcosystem: "npm" })).toBe("npm install b");
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b" })).toBe("git clone https://github.com/a/b.git");
  });
});
