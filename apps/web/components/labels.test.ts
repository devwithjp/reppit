import { describe, it, expect } from "vitest";
import { cleanWhy, parentRepo, safeNext, installCommand, installNote } from "./labels";

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
  it("installs only the verified primary package, else clones", () => {
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", packageEcosystem: "npm" })).toBe("npm install b");
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", publishedPackages: [{ ecosystem: "PyPI", name: "b" }] })).toBe("pip install b");
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", packageEcosystem: "crates.io" })).toBe("cargo add b");
    // A monorepo's side package is verified as the repo's, but it is never offered as the install.
    const mono = { kind: "repo", slug: "prisma/orm", url: "https://github.com/prisma/orm", installPackage: null, publishedPackages: [{ ecosystem: "npm", name: "@prisma/orm-toolchain" }] };
    expect(installCommand(mono)).toBe("git clone https://github.com/prisma/orm.git");
    expect(installNote(mono)).toMatch(/none is verified as the one to install/);
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b" })).toBe("git clone https://github.com/a/b.git");
  });
});
