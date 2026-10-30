# reppit

**Reddit for repos and agent skills, with the front page delivered into your agent.**

Describe a problem, get the top GitHub repos, agent skills or MCP servers, ranked by community votes (with reasons), maintenance health, popularity and semantic relevance. Then install the winner from Claude Code, Codex, Cursor or the terminal with one command.

- **Vote with reasons.** Downvotes must carry a tag: `unmaintained`, `insecure`, `broken-on-agent`, `misleading`, `low-quality`. Tags show up in search results.
- **Agent compatibility reports.** "Works on Claude Code", "broken on Codex": the signal star counts and install counts can't give you.
- **Problem-first search.** `gitit find "parse PDF tables in Python"` returns the same ranked, explained answer as the website.
- **Open-core.** Everything in this repo is MIT. The hosted index (votes, comments, embeddings) is the product. See `DECISIONS.md`.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js site and catalog implementation (`reppit.dev`) |
| `apps/api` | Rust agent API, versioned under `/api/v1` (`api.reppit.dev`) |
| `packages/db` | Drizzle schema, migrations, PGlite (dev) / Postgres+pgvector (prod) client |
| `packages/core` | Ranking, vote weighting, rate limits, embeddings, GitHub ingestion, search pipeline. Pure functions, tested. |
| `packages/mcp-server` | `@gitit/mcp-server`: MCP tools `search_repos`, `get_repo`, `vote`, `report_compat`, `install_skill` |
| `packages/cli-rs` | Native `reppit` CLI (`get skills`, `find`, `show`, `add`, `vote`, `compat`) |
| `packages/cli` | Temporary TypeScript CLI compatibility adapter |
| `packages/skill` | Claude Code plugin + portable `SKILL.md` (`find-repo`) for Codex, Cursor and any agentskills.io harness |

## Run it

```bash
pnpm install
pnpm --filter @gitit/web seed --limit 300 --no-readme --skills   # GitHub public API; set GITHUB_TOKEN for 50x the rate limit
pnpm dev                                                        # http://localhost:3100
```

No Docker or Postgres needed: `pnpm dev` explicitly uses embedded PGlite with pgvector in `apps/web/.pglite`, even if `.env.local` still contains credentials from an older hosted project. Use `pnpm --dir apps/web start:local` for the same protection with a production build. For production set `DATABASE_URL` (Postgres 16 with pgvector; `docker compose up` gives you one).

Embeddings use gte-small (384 dimensions) in-process by default, with no API key; the model (about 34 MB) downloads once to `~/.cache/reppit/transformers` (`REPPIT_MODEL_CACHE` overrides). `EMBEDDING_PROVIDER=local` is the hashed test embedder, `supabase` calls the `embed` Edge Function. After changing models run `pnpm --filter @gitit/web exec tsx scripts/reembed.ts`. See `docs/architecture/embeddings.md`.

Disk: `onnxruntime-node` ships binaries for every platform (about 210 MB). On a Linux x64 machine short of space, delete everything under `node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/` except `linux/x64` (and the matching copies in the pnpm store); a reinstall restores them.

Set `ANTHROPIC_API_KEY` to have Claude write the one-line "why" per result; otherwise a template explanation is used.

The production frontend and agent API deploy independently. After Vercel and Supabase setup,
run `scripts/deploy-vercel.sh` for the Next.js site and `scripts/deploy-api-vercel.sh` for the
Rust API. The API keeps `LEGACY_API_URL=https://reppit.dev` as a rollback adapter while catalog
logic moves to Rust one vertical slice at a time.

Without a GitHub OAuth app (`GITHUB_ID`/`GITHUB_SECRET`) a dev-only username login is enabled.

## Use it from an agent

Task-based skill discovery with the native Rust CLI:

```bash
cargo run --manifest-path packages/cli-rs/Cargo.toml -- get skills "video editing to make cinematic videos"
cargo run --manifest-path packages/cli-rs/Cargo.toml -- get skills "cinematic video editing" --json
cargo run --manifest-path packages/cli-rs/Cargo.toml -- get skills "cinematic video editing" --select 1 --instructions
cargo run --manifest-path packages/cli-rs/Cargo.toml -- get skills "cinematic video editing" --install-top
cargo run --manifest-path packages/cli-rs/Cargo.toml -- get skills "cinematic video editing" --select 2 --install
```

Recommendations are the default. `--instructions` reads the selected skill, `--select`
accepts a rank or returned slug, and `--install`/`--install-top` explicitly run the skill
installer without prompting. `--json` keeps standard output machine-readable, including
when installing. Set `REPPIT_API_URL` to a running deployment while the public domain is
being configured. Searches with no matching skill never install anything.

The build-in-public campaign lives in `bip/campaign.json`. Run
`python3 bip/prepare-campaign.py` to render its 40 comics and review page. A cron entry
runs `bip/run-campaign.sh` every five minutes. It publishes only when an activated
schedule is due; `node bip/campaign.mjs status` shows it and
`node bip/campaign.mjs pause` stops it. The browser must remain signed in as @prakass_ds
and queued threads are assigned a random Sydney time between 5:15 PM and 9:45 PM.
and this machine must be awake. Browser typing does not guarantee exemption from X's
automation rules. An uncertain posting result pauses the campaign for inspection.

```bash
# Claude Code
claude --plugin-dir ./packages/skill          # or: /plugin marketplace add <this repo>
# Any MCP client
GITIT_API_URL=http://localhost:3100 node packages/mcp-server/dist/index.js
# Terminal (run apps/api locally on port 3000 first)
REPPIT_API_URL=http://localhost:3000 cargo run --manifest-path packages/cli-rs/Cargo.toml -- find "ORM for TypeScript with Postgres"
```

Voting and compatibility reports from an agent need an API key: sign in on the site, create one under **API keys**, export it as `REPPIT_API_KEY`.

## Gotchas

Before deploying, restore the Supabase project and run migrations with
`pnpm --filter @gitit/web exec tsx scripts/migrate.ts --rls` using its direct or session
database connection. Then populate the production index with `scripts/copy-index.ts`
and deploy the Supabase embedding function. `scripts/deploy-vercel.sh` runs a read-only
preflight for the database schema, index, RLS, Auth, and embedding function before it
changes Vercel settings. It configures variables for the selected production or preview
environment. Credentials stay in `~/.local/share/reppit-setup/supabase.env`.

After deployment, set the Supabase Auth site URL to the live site and allow its
`/auth/callback` redirect. Verify a real confirmation email, sign-in, voting, and token
creation before adding the site link to the Twitter campaign.

- PGlite is single-process: stop `pnpm dev` before running `pnpm seed` or `pnpm eval`.
- Native-ish packages used by workspace libraries (`@electric-sql/pglite`, `pg`) must also be listed in `apps/web/package.json` so Next can resolve and externalize them instead of bundling them.
- Unauthenticated GitHub search allows 10 requests/min; the seeder paces itself. `GITHUB_TOKEN` lifts that to 30/min and enables README ingestion at scale.

## Test

```bash
pnpm test                       # unit + PGlite integration tests
pnpm --filter @gitit/web eval   # hit@5 over 30 problem statements in apps/web/eval/queries.json
cargo test --manifest-path apps/api/Cargo.toml
cargo test --manifest-path packages/cli-rs/Cargo.toml
```

## Ranking, in one paragraph

Each vote is weighted by the voter's GitHub account age and activity (0.2 for a brand-new empty account, up to 2.0 for an established one; 0 for shadow-banned). Weighted votes decay with a 180-day half-life. Search embeds the query, takes the 50 nearest items by cosine similarity, and reranks them with `0.45·relevance + 0.30·community + 0.15·health + 0.10·popularity`. Featured listings live in a separate table and a separate UI slot and are never read by ranking code.
