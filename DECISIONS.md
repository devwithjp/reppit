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

## 2026-10-08 Name is reppit
Checked 12 single-word English candidates on npm; 11 were taken, which killed the dictionary-word direction outright. reppit wins on the namespace that matters, because the CLI and MCP server both ship as npm packages and `reppit` is free there. Ships on reppit.dev since .com and .app are gone. GitHub username is held by a dormant 2015 account, so the org is reppit-dev. Register repit.dev as a typo redirect; the double p is the name's only real weakness. Rejected repit (npm name held by a dormant 2022 package) and repvote (clean namespace but names one feature and would age badly).

## 2026-10-08 Beachhead is individual agent-first developers, not platform teams
The money is in platform teams buying dependency governance, but they buy through procurement from a vendor with references, and none of that exists. Individual developers who use agents daily are reachable today on the same channel we build in public on, and they produce the votes. Stated plainly: the free tier is the data acquisition cost, and the expansion segment's product cannot exist until the beachhead has voted.

## 2026-10-08 Ranking must be useful at zero users
A community-ranked site with no community ranks nothing. Every signal that can be computed without a human is computed: maintenance recency, archived and deprecated flags, open security advisories, issue load, license clarity, popularity. Votes adjust that baseline rather than constituting it. This moves deprecation and advisory ingestion above comments in priority, and it is why threaded comments are cut from v1: an empty comment section looks worse than no comment section.
