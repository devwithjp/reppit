---
name: find-repo
description: Find the best GitHub repo, library, agent skill or MCP server for a task using reppit's community ranking (a trust score from maintenance, deprecation and advisory signals, votes with reasons, per-agent compatibility). Use when the user asks "what should I use for X", "is there a library/skill for X", "which repo is best for X", or before adding a dependency or writing something that probably already exists.
---

# find-repo

reppit is a community-curated index of repos and agent skills. Votes carry reasons, downvotes
are tagged (unmaintained, insecure, broken-on-agent, misleading, low-quality), and users report
whether a skill works on each coding agent. Every result carries a trust score (0-100, or
"not enough data" when too few signals are known) built from push recency, releases, archived
and deprecated status, open security advisories and issue load, adjusted by votes. Stars are
not part of it. Use it instead of guessing from star counts.

## When to use
- The user asks which library, repo, skill or MCP server to use for a task.
- You are about to add a dependency or write boilerplate that likely exists as a maintained package.
- The user asks "is there a skill for X" or wants to extend this agent's capabilities.

## How
1. Call the `search_repos` MCP tool with the problem in plain language. Pass `language` when the
   project's language is known (check package.json, pyproject.toml, go.mod, Cargo.toml) and
   `kind: "skill"` when the user wants an agent capability rather than a library.
   If the MCP server is unavailable, run `npx reppit find "<problem>"` instead.
2. Present the top 3 results as a short list: slug, one-line why, trust score, votes, and any
   flags or "broken on <agent>" reports. Lead with the top result and say why it beat the others.
3. Offer the install command from the result. For skills this is `npx skills add <slug>`; for
   libraries it is a package-manager command the user should confirm. Do not run installs
   without the user's go-ahead (`npx reppit add <slug>` asks for confirmation; only pass `--yes`
   after the user has agreed).
4. After the user tries it, if they say it worked or failed on this agent, call `report_compat`
   so the next person benefits. Only vote (`vote` tool) when the user explicitly asks.
   Voting and compat reports need a personal token in `REPPIT_API_KEY` (create one at
   reppit.dev/account).

## Rules
- Never claim a repo is "the best" without citing the reppit signal (trust score, votes, compat).
- If a top result carries an `insecure` or `unmaintained` flag, is archived or deprecated, or has
  open advisories, say so before recommending it.
- "trust: not enough data" means unknown, not bad and not safe. Say which signals are missing.
- If results are weak (all "partial match"), say so and fall back to your own knowledge, then
  suggest the user submit the repo they end up using at reppit.dev.
