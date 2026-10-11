# gitit

**Reddit for repos and agent skills, with the front page delivered into your agent.**

Describe a problem, get the top GitHub repos, agent skills or MCP servers, ranked by community votes (with reasons), maintenance health, popularity and semantic relevance. Then install the winner from Claude Code, Codex, Cursor or the terminal with one command.

- **Vote with reasons.** Downvotes must carry a tag: `unmaintained`, `insecure`, `broken-on-agent`, `misleading`, `low-quality`. Tags show up in search results.
- **Agent compatibility reports.** "Works on Claude Code", "broken on Codex": the signal star counts and install counts can't give you.
- **Problem-first search.** `gitit find "parse PDF tables in Python"` returns the same ranked, explained answer as the website.
- **Open-core.** Everything in this repo is MIT. The hosted index (votes, comments, embeddings) is the product. See `DECISIONS.md`.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js site and HTTP API (`/api/search`, `/api/items`, …) |
| `packages/db` | Drizzle schema, migrations, PGlite (dev) / Postgres+pgvector (prod) client |
| `packages/core` | Ranking, vote weighting, rate limits, embeddings, GitHub ingestion, search pipeline. Pure functions, tested. |
| `packages/mcp-server` | `@gitit/mcp-server`: MCP tools `search_repos`, `get_repo`, `vote`, `report_compat`, `install_skill` |
| `packages/cli` | `gitit` CLI (`find`, `show`, `add`, `vote`, `compat`) |
| `packages/skill` | Claude Code plugin + portable `SKILL.md` (`find-repo`) for Codex, Cursor and any agentskills.io harness |

## Run it

```bash
pnpm install
pnpm --filter @gitit/web seed --limit 300 --no-readme --skills   # GitHub public API; set GITHUB_TOKEN for 50x the rate limit
pnpm dev                                                        # http://localhost:3100
```

No Docker or Postgres needed: without `DATABASE_URL` the app uses embedded PGlite with pgvector in `apps/web/.pglite`. For production set `DATABASE_URL` (Postgres 16 with pgvector; `docker compose up` gives you one).

Embeddings use gte-small (384 dimensions) in-process by default, with no API key; the model (about 34 MB) downloads once to `~/.cache/reppit/transformers` (`REPPIT_MODEL_CACHE` overrides). `EMBEDDING_PROVIDER=local` is the hashed test embedder, `supabase` calls the `embed` Edge Function. After changing models run `pnpm --filter @gitit/web exec tsx scripts/reembed.ts`. See `docs/architecture/embeddings.md`.

Disk: `onnxruntime-node` ships binaries for every platform (about 210 MB). On a Linux x64 machine short of space, delete everything under `node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/` except `linux/x64` (and the matching copies in the pnpm store); a reinstall restores them.

Set `ANTHROPIC_API_KEY` to have Claude write the one-line "why" per result; otherwise a template explanation is used.

Without a GitHub OAuth app (`GITHUB_ID`/`GITHUB_SECRET`) a dev-only username login is enabled.

## Use it from an agent

```bash
# Claude Code
claude --plugin-dir ./packages/skill          # or: /plugin marketplace add <this repo>
# Any MCP client
GITIT_API_URL=http://localhost:3100 node packages/mcp-server/dist/index.js
# Terminal
GITIT_API_URL=http://localhost:3100 node packages/cli/dist/index.js find "ORM for TypeScript with Postgres"
```

Voting and compatibility reports from an agent need an API key: sign in on the site, create one under **API keys**, export it as `GITIT_API_KEY`.

## Gotchas

- PGlite is single-process: stop `pnpm dev` before running `pnpm seed` or `pnpm eval`.
- Native-ish packages used by workspace libraries (`@electric-sql/pglite`, `pg`) must also be listed in `apps/web/package.json` so Next can resolve and externalize them instead of bundling them.
- Unauthenticated GitHub search allows 10 requests/min; the seeder paces itself. `GITHUB_TOKEN` lifts that to 30/min and enables README ingestion at scale.

## Test

```bash
pnpm test                       # unit + PGlite integration tests
pnpm --filter @gitit/web eval   # hit@5 over 30 problem statements in apps/web/eval/queries.json
```

## Ranking, in one paragraph

Each vote is weighted by the voter's GitHub account age and activity (0.2 for a brand-new empty account, up to 2.0 for an established one; 0 for shadow-banned). Weighted votes decay with a 180-day half-life. Search embeds the query, takes the 50 nearest items by cosine similarity, and reranks them with `0.45·relevance + 0.30·community + 0.15·health + 0.10·popularity`. Featured listings live in a separate table and a separate UI slot and are never read by ranking code.
