# Decisions

One paragraph per irreversible or hard-to-reverse choice. Newest at the bottom.

## 2026-10-08 Open-core licensing
Code is MIT. The hosted dataset (vote graph, comments, embeddings, rankings) is the product and is not covered by the code license. Reason: in-agent distribution requires an open, auditable client; the moat is the community data, which only accrues to whoever hosts it. Precedent: Context7 (MIT server, proprietary backend).

## 2026-10-08 Embedded Postgres for dev and tests
`packages/db` uses PGlite (Postgres in WASM, with the `vector` extension) when `DATABASE_URL` is unset, and node-postgres otherwise. Same Drizzle schema for both. Reason: zero-infra onboarding and CI, no Docker dependency for contributors, identical SQL semantics to production pgvector.

## 2026-10-08 Money never touches the ranker
Featured listings are a separate table and a separate UI slot. The ranking module (`packages/core/src/ranking.ts`) has no import path to billing or featured data. Any PR that adds one is rejected.

## 2026-10-08 Downvotes require a reason
A downvote without a reason tag is rejected by the API. Reason tags (`unmaintained`, `insecure`, `broken-on-agent`, `misleading`, `low-quality`) are first-class data surfaced in search results. Reason: a bare downvote is noise; a tagged one is the signal competitors (skills.sh, GitHub stars) cannot produce.

## 2026-10-08 Single app for web and API
Next.js route handlers serve the HTTP API; no separate API server in v1. The MCP server and CLI are thin HTTP clients. Reason: one deploy, one auth session model, and the plan allowed either Hono or route handlers.

Superseded on 2026-10-29 by [ADR-0001](docs/adr/0001-rust-agent-interface.md): the finished Next.js frontend stays, while the agent-facing interface and CLI move to Rust behind `/api/v1`.

## 2026-10-08 Name is reppit
Checked 12 single-word English candidates on npm; 11 were taken, which killed the dictionary-word direction outright. reppit wins on the namespace that matters, because the CLI and MCP server both ship as npm packages and `reppit` is free there. Ships on reppit.dev since .com and .app are gone. GitHub username is held by a dormant 2015 account, so the org is reppit-dev. Register repit.dev as a typo redirect; the double p is the name's only real weakness. Rejected repit (npm name held by a dormant 2022 package) and repvote (clean namespace but names one feature and would age badly).

## 2026-10-08 Beachhead is individual agent-first developers, not platform teams
The money is in platform teams buying dependency governance, but they buy through procurement from a vendor with references, and none of that exists. Individual developers who use agents daily are reachable today on the same channel we build in public on, and they produce the votes. Stated plainly: the free tier is the data acquisition cost, and the expansion segment's product cannot exist until the beachhead has voted.

## 2026-10-08 Ranking must be useful at zero users
A community-ranked site with no community ranks nothing. Every signal that can be computed without a human is computed: maintenance recency, archived and deprecated flags, open security advisories, issue load, license clarity, popularity. Votes adjust that baseline rather than constituting it. This moves deprecation and advisory ingestion above comments in priority, and it is why threaded comments are cut from v1: an empty comment section looks worse than no comment section.

## 2026-10-08 GraphQL batching, not REST, is the ingestion path
The 755-item index ceiling was never a GitHub rate limit; it was our own code making three REST calls per repo, which caps a 5,000/hour token at about 1,666 repos/hour. A GraphQL query that aliases N repository lookups costs one rate-limit point regardless of N, measured at 89,408 repos/hour on the same token and the same field set including README text. That is a 54x improvement for no money. Batch size is bounded by GitHub's 10-second gateway timeout rather than quota, so 30 per query is the safe working size. Every public repo above 100 stars is roughly 8 hours of backfill at zero cost.

## 2026-10-08 Repository identity is the numeric id, not the slug
facebook/react now resolves to react/react; GraphQL follows the transfer silently and returns the new name, REST returns a 301, and ecosyste.ms returns 404. Storing "owner/name" as identity means a transfer reads as a disappearance, which already caused false misses in the search evaluation. Primary key becomes the GitHub numeric database id, with the slug as a mutable label. GH Archive events carry both the id and the name, so rename detection is free and hourly for any repo with public activity.

## 2026-10-08 ecosyste.ms stays out of ranking inputs
ecosyste.ms is CC-BY-SA 4.0. Share-alike on a ranking input would reach into the hosted dataset that the open-core decision depends on being ours. It is therefore used only for identity resolution and discovery, with visible attribution, and never as a signal the ranking reads. Its bulk dump is also 226 GB and three years stale, and it cannot enumerate by stars, so it was never viable as the primary source regardless.

## 2026-10-08 Never render a missing advisory count as zero
Every security advisory source is keyed by package; the ranking is keyed by repository, and many repos ship no package at all. The repo-keyed GitHub endpoint is correct but costs one un-batchable call per repo, and the ecosyste.ms reverse lookup returns fuzzy string matches (psf/requests returns "reqesst"). Until a forward package-to-repo join is materialised, the advisory signal is present-or-absent for the packaged subset only. Showing "0 advisories" for a repo we never checked would be a fabricated safety claim, which matters because DECISIONS.md already makes this signal load-bearing at zero users.

## 2026-10-11 Supabase for database and auth
Production runs on Supabase: Postgres with pgvector for the index, Supabase Auth for accounts. The app talks to Postgres server-side through Drizzle, and Row Level Security is on for every table with no policies for the public roles, so the browser-facing API exposes nothing. Local development keeps embedded PGlite, so contributors still need no database install. Auth in v1 is email and password plus magic link; GitHub sign-in waits for an OAuth app.

## 2026-10-11 Email accounts earn vote weight with age
Vote weight was built entirely from GitHub history, which left every email account at 0.2 forever while a throwaway email costs nothing. Accounts with no GitHub history now ramp from 0.2 to 1.0 over 60 days of reppit account age, capped at 1.0. GitHub-backed accounts keep their curve up to 2.0. Sock puppets stay cheap to ignore and real users are not punished indefinitely.

## 2026-10-11 One trust score, defined once, without stars
The score people see is a single core function used by the site, API, MCP server and CLI: six signals worth 100 points, unknown signals scored neutral, no number at all when three or more are unknown, and votes moving it by at most twelve points. Stars are not an input. The positioning says stars measure the past; a score that quietly included them would make that a lie.

## 2026-10-11 A personal token ships in v1
Agent compatibility reports are meant to come from inside the agent, and that needs a credential. The api_keys table and the Bearer check already existed, so v1 ships one revocable personal token per account. Paid API tiers and metering stay in v2.

## 2026-10-29 Discussion ships in v1, separate from item ranking
The earlier cold-start plan hid threaded comments until v2. That decision is reversed: the product is now explicitly a Reddit-style discovery community, so public comments and replies are part of the launch experience. Repo votes remain the only human discussion signal that can change an item's community score. Comment votes order the discussion and never change item rank or trust score. This keeps the ranking interface small and auditable while allowing people to explain tradeoffs in their own words.

## 2026-10-30 Rust owns CLI behavior; npm owns installation

The command implementation is one native Rust binary. `npx reppit` remains the main beta entry point through a dependency-free JavaScript launcher that selects an exact-version platform package, verifies the binary SHA-256, and forwards arguments and exit status. Search, ranking, and policy remain server-side. The launcher does not duplicate CLI behavior. Direct archives and Homebrew can follow, but do not replace the `npx` path at beta launch.

## 2026-10-30 X scheduling prepares review packets, not browser posts

The randomized 20-night schedule stays, but its cron job only creates a private local page with the approved copy and figures and shows a reminder. A person publishes the thread and records its URLs. If automatic publishing is added, it must use the official X API. Scripting the X website with Playwright, CDP, or similar browser control is not an accepted campaign path because X explicitly prohibits non-API website automation and warns it can suspend the account.
