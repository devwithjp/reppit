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
