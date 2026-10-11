import { describe, it, expect } from "vitest";
import { cleanWhy, parentRepo, safeNext, installCommand, installFor } from "./labels";

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
  it("installs only the verified primary package", () => {
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", packageEcosystem: "npm" })).toBe("npm install b");
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", publishedPackages: [{ ecosystem: "PyPI", name: "b" }] })).toBe("pip install b");
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", installPackage: "b", packageEcosystem: "crates.io" })).toBe("cargo add b");
    expect(installCommand({ kind: "skill", slug: "o/r/skills/x", url: "https://github.com/o/r" })).toBe("npx skills add o/r/skills/x");
  });

  it("never offers git clone: no primary package means the install docs", () => {
    const none = installFor({ kind: "repo", slug: "a/b", url: "https://github.com/a/b" });
    expect(none).toEqual({ type: "docs", href: "https://github.com/a/b#readme", label: null, note: "No published package points back at this repo." });
    expect(installCommand({ kind: "repo", slug: "a/b", url: "https://github.com/a/b" })).toBeNull();
    // A monorepo's side packages belong to the repo, but none is offered as the install.
    const mono = installFor({ kind: "repo", slug: "prisma/orm", url: "https://github.com/prisma/orm", installPackage: null,
      publishedPackages: [{ ecosystem: "npm", name: "@prisma/orm-toolchain" }, { ecosystem: "npm", name: "@prisma/client-x" }] });
    expect(mono).toMatchObject({ type: "docs", label: "several packages, none verified as primary" });
    expect(mono.note).toBe("It publishes 2 packages and none is verified as the one to install.");
    const one = installFor({ kind: "repo", slug: "a/b", url: "https://github.com/a/b", publishedPackages: [{ ecosystem: "npm", name: "x" }] });
    expect(one.note).toBe("It publishes 1 package, not verified as the one to install.");
    // An application is never a package install, even with a package recorded.
    const app = installFor({ kind: "repo", slug: "ollama/ollama", url: "https://github.com/ollama/ollama", installKind: "app", installPackage: "github.com/ollama/ollama", packageEcosystem: "Go" });
    expect(app).toMatchObject({ type: "docs", label: "app" });
  });
});
