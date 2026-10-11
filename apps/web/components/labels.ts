/** Human labels for the enum values the API speaks. One place, so every screen says the same thing. */

export const REASONS = ["unmaintained", "insecure", "broken-on-agent", "misleading", "low-quality"] as const;
export type Reason = (typeof REASONS)[number];

export const REASON_LABEL: Record<string, string> = {
  unmaintained: "unmaintained",
  insecure: "insecure",
  "broken-on-agent": "broken on an agent",
  misleading: "misleading",
  "low-quality": "low quality",
};

export const REASON_GLOSS: Record<string, string> = {
  unmaintained: "nobody is fixing it",
  insecure: "known holes, unpatched",
  "broken-on-agent": "fails under a coding agent",
  misleading: "the README oversells it",
  "low-quality": "works, badly",
};

/** Agents the API accepts, in the order the item page lists them. The first four always show. */
export const AGENTS = ["claude-code", "codex", "cursor", "gemini-cli", "copilot", "windsurf", "other"] as const;
export const CORE_AGENTS = ["claude-code", "codex", "cursor", "gemini-cli"];

export const AGENT_LABEL: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  windsurf: "Windsurf",
  other: "Other",
};

export const KIND_LABEL: Record<string, string> = { repo: "repos", skill: "skills", mcp: "MCP servers" };

/**
 * The reppit CLI and MCP server are not on npm yet. Until NEXT_PUBLIC_REPPIT_PUBLISHED=1 is set at build
 * time, no page shows a reppit install command: `npx -y` on an unclaimed name fails today and is a
 * squatting risk tomorrow. Third-party library install lines are unaffected. Render through <ReppitInstall>.
 */
export const REPPIT_PUBLISHED = process.env.NEXT_PUBLIC_REPPIT_PUBLISHED === "1";
export const UNPUBLISHED_NOTE = "The reppit CLI and MCP server are published on launch day.";

/** Add the MCP server to an agent. Single source so it can change with the package name. */
export const MCP_INSTALL = "claude mcp add reppit -- npx -y reppit-mcp";
/** The CLI, for agents without MCP. */
export const CLI_EXAMPLE = 'npx reppit find "parse pdf tables in python"';

type InstallRow = {
  kind: string; slug: string; url: string;
  installPackage?: string | null; packageEcosystem?: string | null;
  publishedPackages?: { ecosystem: string; name: string }[] | null;
};

/**
 * What to paste to get the thing. A package install is offered only for the repo's primary
 * package (installPackage): one whose name matches the repo or its root manifest. A monorepo's
 * side packages are verified as belonging to the repo, but they are not "the thing to install",
 * so they never appear here. Without a primary package, clone the source.
 */
export function installCommand(i: InstallRow): string {
  if (i.kind === "skill") return `npx skills add ${i.slug}`;
  const pkg = i.installPackage;
  if (pkg) {
    const eco = i.publishedPackages?.find((p) => p.name === pkg)?.ecosystem ?? i.packageEcosystem;
    if (eco === "npm") return `npm install ${pkg}`;
    if (eco === "PyPI") return `pip install ${pkg}`;
    if (eco === "crates.io") return `cargo add ${pkg}`;
    if (eco === "Go") return `go get ${pkg}`;
  }
  return `git clone ${i.url}.git`;
}

/** One plain sentence explaining the install line, so a clone is never mistaken for a package. */
export function installNote(i: InstallRow): string | undefined {
  if (i.kind !== "repo") return undefined;
  if (i.installPackage) return `Verified ${i.packageEcosystem ?? ""} package ${i.installPackage}: its registry entry points back at this repo.`.replace("  ", " ");
  if (i.publishedPackages?.length) return `This repo publishes ${i.publishedPackages.length} packages and none is verified as the one to install, so this clones the source. Check its install docs.`;
  return "No published package points back at this repo, so this clones the source.";
}

/**
 * The one-line reason, minus anything the UI should not repeat:
 * - the "Strong/Good/Partial match" label (a fixed threshold on similarity, not a judgement we stand behind);
 * - for skills, star counts, which belong to the parent repo, not the skill.
 * Returns null when nothing useful is left.
 */
export function cleanWhy(why: string | undefined, kind: string): string | null {
  if (!why) return null;
  let s = why.replace(/^\s*(strong|good|partial|weak)\s+match\s*[:.\u2014-]?\s*/i, "");
  if (kind === "skill") s = s.replace(/,?\s*\b\d+(?:[.,]\d+)?k?\s+stars\b/gi, "");
  s = s.replace(/^[\s,;:.]+/, "").replace(/\s+,/g, ",").replace(/,\s*\./g, ".").trim();
  if (!s || /^[.]$/.test(s)) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The repo a skill lives in: "owner/repo" from "owner/repo/path/to/skill". Null for anything else. */
export function parentRepo(kind: string, slug: string): string | null {
  if (kind !== "skill") return null;
  const parts = slug.split("/");
  return parts.length > 2 ? `${parts[0]}/${parts[1]}` : null;
}

/** Split "owner/name" (or "owner/repo/path/name" for skills) into a muted prefix and the name. */
export function splitSlug(slug: string): { owner: string; name: string } {
  const i = slug.lastIndexOf("/");
  return i < 0 ? { owner: "", name: slug } : { owner: slug.slice(0, i + 1), name: slug.slice(i + 1) };
}

/** Path to an item page. Skills have slugs with more than two segments. */
export const itemHref = (slug: string) => `/r/${slug.split("/").map(encodeURIComponent).join("/")}`;

/** Only allow same-site relative return paths. */
export function safeNext(next: unknown, fallback = "/"): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : fallback;
}
