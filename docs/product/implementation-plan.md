# reppit implementation and launch plan

This plan follows the installed Matt Pocock workflow: sharpen the domain model, define deep interfaces, deliver vertical test-driven slices, review the changes, then verify the complete live story.

## Working rules

- `GLOSSARY.md` is the canonical product language.
- `docs/product/PRD.md` is the scope and acceptance source of truth.
- Each feature is built as one vertical slice through UI, route, domain logic, and data.
- Tests observe public interfaces, not private implementation.
- A slice is not done when it compiles; it is done when its user-visible flow passes.
- Deployment is staged to preview, verified, then promoted.
- The campaign never posts a link or demo claim before the matching live flow passes.

## Phase 1 — lock the product model

- [x] Define Item, Feed, Repo vote, Discussion, Comment vote, Trust score, Skill recommendation, and Explicit install.
- [x] Separate repo votes from comment votes: repo votes affect ranking; comment votes affect discussion order only.
- [x] Record comments as a launch requirement, reversing the earlier v2 decision.
- [x] Put the complete product and launch requirements in one PRD.
- [x] Reconcile the older feature list and segment document with the PRD so they no longer say comments are hidden.

Exit: no document describes comments as out of scope, and the ranking rule has one meaning everywhere.

## Phase 2 — Reddit-style community slice

Seams under test:

- public feed row: vote controls and discussion count;
- public item page: comments, replies, and empty state;
- authenticated write routes: repo vote, comment, reply, comment vote, delete;
- ranking query: repo votes affect item order; comment votes do not.

Slices:

1. [x] Show a discussion link and count on every feed row.
2. [x] Load and render top-level comments and replies on the item page.
3. [x] Let a signed-in user add a comment and see it without leaving the item (domain integration tested; live auth verification remains).
4. [x] Let a signed-in user reply to a comment (domain integration tested; live auth verification remains).
5. [x] Add one-vote-per-user comment upvotes/downvotes and Best/New ordering.
6. [x] Add author deletion with deleted-parent placeholders.
7. [x] Add operator removal and account suspension controls.
8. Verify signed-out actions return through login to the same item.

Exit: the complete feed → item → vote → comment → reply flow passes on desktop and phone.

## Phase 3 — agent skill slice

1. [x] Finish the curated nested-skill refresh and configure its nightly workflow.
2. [x] Define the shared Rust contract and ship health/search as the first backend tracer slice.
3. [x] Replace the TypeScript CLI implementation with a native Rust binary while preserving command behavior and JSON output.
4. Run representative searches: cinematic video editing, TypeScript integration tests, PDF extraction, and one deliberate miss.
5. [x] Verify recommendation, JSON, instructions, selection, explicit install, and no-match behavior.
6. [x] Align MCP tools with the same `/api/v1` contract and sources.
7. [x] Replace the duplicate TypeScript CLI with a checksum-verifying npm launcher and define five native release targets.
8. Publish and smoke-test the five native packages, then publish the `reppit` launcher last through npm trusted publishing.

Exit: a fresh agent can get recommendations, inspect one, and explicitly install it without reading a human table.

## Phase 4 — auth and onboarding slice

1. Verify anonymous browse/search/comment reading.
2. Verify password signup, confirmation email, password login, magic link, logout, and safe return paths.
3. Verify repo votes, comments, replies, compatibility reports, submissions, and token creation require login.
4. Add clear recovery for expired or unavailable email links.
5. Verify phone layouts and keyboard access.

Exit: a new person can arrive from an X link, understand the product, sign up, return to the same item, and take one community action.

## Phase 5 — production foundation

1. Restore or create Supabase; run migrations and RLS setup.
2. Populate production with the local repository and skill index.
3. Deploy and verify the embedding function.
4. Authorize Vercel, create/link the project, and set preview environment variables.
5. Deploy with the production domain skipped; run full-story verification on preview.
6. Promote the verified deployment and set Supabase site/redirect URLs.
7. Connect the final domain when available.
8. Publish the MCP client, the five native CLI packages, then the `reppit` launcher; verify fresh public installs before showing commands on the site.

Exit: browser, HTTP routes, database, auth email, CLI, and MCP all work against the same production index.

## Phase 6 — review and verification

1. Run unit and database integration tests.
2. Run typecheck and production build.
3. Run the project standards/code review from the current merge base.
4. Fix critical and important findings; rerun affected tests.
5. Run full-story browser verification from anonymous arrival through authenticated community action.
6. Verify no secrets, private emails, or local paths appear in public output.
7. Record launch metrics before posting the URL.

Exit: every PRD launch gate has evidence and no required path is assumed from a green build alone.

## Phase 7 — campaign, screenshots, and demo

1. Keep campaign nights at random times between 5:15 PM and 9:45 PM Sydney; the scheduled job creates a local review packet and notification only.
2. Use tweets 1–10 mainly for the problem: stale stars, weak maintenance correlation, ecosystem size, and zombie dependencies.
3. Use later posts to explain the feed, reason-backed downvotes, discussions, and skill retrieval.
4. Once production passes, replace placeholder references with the live URL and capture desktop/phone screenshots.
5. Re-run `apps/web/scripts/capture-product-demo.mjs` against the verified deployment and replace the local 49.9-second launch candidate.
6. Add captions, crop for X, and verify every shown action is real.
7. Use popular, relevant skills as concrete examples with visible attribution; do not imply partnership or endorsement.
8. Publish the reviewed demo thread manually or through the official X API, then measure completion, clicks, searches, and concrete replies.

Exit: the public story moves from problem to proof, and every proof links to a working product.

## Immediate order of work

1. Complete the in-progress Supabase CLI authorization, select the clean production project, and capture fresh project credentials.
2. Run production migrations, RLS, embedding function deployment, and index seed.
3. Deploy preview, verify the complete signed-in story, then promote.
4. Create the public release repository, configure npm trusted publishing, and publish the MCP/native/launcher packages in dependency order.
5. Recapture the prepared screenshots and demo against production, then verify the final frames contain the live URL and published CLI state.
6. Add the live URL and demo to the reviewed campaign posts.
