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

/** Add the MCP server to an agent. Single source so it can change with the package name. */
export const MCP_INSTALL = "claude mcp add reppit -- npx -y reppit-mcp";
/** The CLI, for agents without MCP. */
export const CLI_EXAMPLE = 'npx reppit find "parse pdf tables in python"';

/**
 * What to paste to get the thing. Only what we can know from the row: a package name is used only
 * when ingestion verified it points back at this repo. Otherwise, clone the source.
 */
export function installCommand(i: { kind: string; slug: string; url: string; packageName?: string | null; packageEcosystem?: string | null }): string {
  if (i.kind === "skill") return `npx skills add ${i.slug}`;
  if (i.packageName && i.packageEcosystem === "npm") return `npm install ${i.packageName}`;
  if (i.packageName && i.packageEcosystem === "PyPI") return `pip install ${i.packageName}`;
  return `git clone ${i.url}.git`;
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
