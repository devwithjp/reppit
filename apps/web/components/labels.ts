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

/**
 * Agent compatibility has no reports behind it before launch. Every place that presents the feature
 * says so, and says where a report comes from. One wording, so pages cannot drift apart.
 */
export const AGENT_REPORTS_NOTE = "Agent reports start at launch. When you run a library in your agent, say whether it worked; that is where this column comes from.";

/** Add the MCP server to an agent. Single source so it can change with the package name. */
export const MCP_INSTALL = "claude mcp add reppit -- npx -y reppit-mcp";
/** The CLI, for agents without MCP. */
export const CLI_EXAMPLE = 'npx reppit find "parse pdf tables in python"';

type InstallRow = {
  kind: string; slug: string; url: string;
  installPackage?: string | null; packageEcosystem?: string | null;
  publishedPackages?: { ecosystem: string; name: string }[] | null;
  /** "app" for applications (installed from a release or app store, not a package manager). Optional until the column lands. */
  installKind?: string | null;
};

/** Either a command to paste, or a pointer to the project's own install docs. Never a `git clone`. */
export type Install =
  | { type: "command"; command: string; note?: string }
  | { type: "docs"; href: string; label: string | null; note?: string };

/**
 * How to get the thing. A package install is offered only for the repo's primary package
 * (installPackage): one whose name matches the repo or its root manifest. A monorepo's side packages
 * belong to the repo but are not "the thing to install", so they never appear here. An application,
 * or a repo with no primary package, gets a link to its README's install section instead: cloning
 * the source is never an install, least of all when an agent reads the line.
 */
export function installFor(i: InstallRow): Install {
  if (i.kind === "skill") return { type: "command", command: `npx skills add ${i.slug}` };
  const docs = `${i.url.replace(/\/+$/, "")}#readme`;
  if (i.installKind === "app") return { type: "docs", href: docs, label: "app", note: "An application, not a library. Install it the way its README says." };
  const pkg = i.installPackage;
  if (pkg) {
    const eco = i.publishedPackages?.find((p) => p.name === pkg)?.ecosystem ?? i.packageEcosystem;
    const note = `Verified ${eco ? `${eco} ` : ""}package ${pkg}: its registry entry points back at this repo.`;
    if (eco === "npm") return { type: "command", command: `npm install ${pkg}`, note };
    if (eco === "PyPI") return { type: "command", command: `pip install ${pkg}`, note };
    if (eco === "crates.io") return { type: "command", command: `cargo add ${pkg}`, note };
    if (eco === "Go") return { type: "command", command: `go get ${pkg}`, note };
  }
  const n = i.publishedPackages?.length ?? 0;
  if (n > 1) return { type: "docs", href: docs, label: "several packages, none verified as primary", note: `It publishes ${n} packages and none is verified as the one to install.` };
  if (n === 1) return { type: "docs", href: docs, label: "1 package, not verified as primary", note: "It publishes 1 package, not verified as the one to install." };
  return { type: "docs", href: docs, label: null, note: "No published package points back at this repo." };
}

/** The command alone, or null when the answer is "see the install docs". */
export function installCommand(i: InstallRow): string | null {
  const r = installFor(i);
  return r.type === "command" ? r.command : null;
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
