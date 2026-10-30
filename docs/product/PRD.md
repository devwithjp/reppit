# reppit product requirements

Status: implementation source of truth

Updated: 30 October 2026
Owner: Prakash

## Product in one sentence

reppit is a Reddit-style feed for discovering and judging repositories, plus a task-based skill finder that agents can use from the terminal.

## Problem

Developers and coding agents choose from more repositories and skills than a person can review. GitHub stars show that someone clicked a button in the past. They do not show whether a project is maintained now, what broke for recent users, or whether a skill fits the task in front of an agent.

Three common scenarios define the problem:

1. An agent recommends a 40,000-star repository that is archived while a maintained 300-star alternative stays hidden.
2. A developer sees a downvote but cannot tell whether the project is insecure, abandoned, misleading, or simply a poor fit.
3. An agent needs a workflow for a task such as cinematic video editing, but ordinary repository search returns libraries rather than usable skill instructions.

## Target user

The launch user is an individual developer or small team that uses coding agents daily and chooses its own dependencies. They need a fast check before accepting a repository or letting an agent follow a skill.

## Goals

- Make repository discovery feel as easy as browsing Reddit.
- Rank items with current maintenance signals and useful community evidence, not stars alone.
- Let people upvote, downvote with a reason, comment, reply, and vote on useful comments.
- Let agents request skills by describing a task and decide whether to inspect, select, or explicitly install a result.
- Let anyone browse and search before signup; require an account only for community actions.
- Launch publicly with an honest 20-day story, real screenshots, and a real product demo.

## Non-goals

- reppit does not host packages, skills, or MCP servers.
- reppit does not scan source code or claim that an unknown security result is safe.
- reppit does not let sponsors affect ranking.
- reppit does not install a recommendation unless the user or agent explicitly asks.
- reppit does not add karma, streaks, badges, or vote-to-earn mechanics.
- reppit does not promise complete GitHub coverage at launch.

## Experience 1: Reddit-style repository discovery

### Feed

The home page is a shared feed with vote rails, item title, description, type, language, trust score, maintenance facts, downvote reasons, agent compatibility, and comment count.

Users can:

- browse all items or filter repositories, skills, and MCP servers;
- sort by Trusted, Most voted, or New;
- open an item or its discussion;
- upvote in place;
- open the item page to downvote with a required reason;
- search by describing a problem instead of naming a package.

### Item ranking

The default feed order is trust score, then weighted community score. Search reranks semantic candidates with relevance, community, health, and popularity. Archived and deprecated items are demoted. Paid placement is held in a separate system and is never read by ranking code.

Repo votes are weighted by account history and decay with a 180-day half-life. Votes can adjust the trust score by at most 12 points. Every negative repo vote requires one of five reasons.

### Discussion

Each item page contains a public discussion with top-level comments and replies.

- Signed-out visitors can read the discussion.
- Signed-in users can comment and reply.
- One user can cast one upvote or downvote per comment.
- Comment score changes discussion order only. It never changes item rank or trust score.
- New top-level comments default to Best order, with New available as a secondary order.
- Comment text is plain text, escaped on output, and limited to 5,000 characters.
- Authors can delete their own comments; deleted parents remain as a placeholder when replies exist.
- Operators can remove abusive content and suspend an account.

### Acceptance criteria

1. A feed row shows an upvote control, downvote control, current net repo-vote score, and a link with the comment count.
2. A signed-in upvote updates without a full page reload. Clicking it again withdraws it.
3. A downvote is not saved until one of the five reasons is selected.
4. The item page shows all comments and replies with author, age, score, and reply action.
5. A signed-in user can add a comment, reply to another comment, and vote a comment up or down.
6. Repo votes affect ranking; comment votes do not.
7. A signed-out community action leads to login and returns the user to the same item.
8. Empty discussion state says that nobody has commented yet without making the item look broken.

## Experience 2: task-based agent skill retrieval

The CLI command is:

```bash
reppit get skills "video editing to make cinematic videos"
```

Recommendations are the default. The command supports all agent choices:

- readable ranked recommendations;
- `--json` for structured agent output;
- `--instructions` to read the selected skill;
- `--select <rank|slug>` to choose a result;
- `--install` to install the selected result;
- `--install-top` to explicitly install the top result.

Each result contains the skill title, canonical source, match reason, and next actions. If no credible match exists, the command says so and installs nothing.

The same index is available to MCP clients. Read operations work with no write permission. Votes, reports, and submissions require an explicit write-scoped token.

### Acceptance criteria

1. A task query returns ranked skill results or an honest no-match result.
2. JSON output remains machine-readable for recommendation, selection, instructions, and install modes.
3. `--install` without a selected result fails safely with guidance.
4. `--install-top` installs only when a credible top result exists.
5. Sources point to the exact skill path, including skills nested inside a repository.
6. The website and CLI resolve the same item to the same source and trust facts.

## Accounts and onboarding

- Anyone can browse, search, open an item, read comments, and use read-only agent search.
- Signup supports email and password plus magic link.
- Email confirmation returns to the page the user started on.
- Login accepts safe internal return paths only.
- Voting, commenting, compatibility reports, repo submission, and token creation require login.
- Account pages show a user's repo votes, reports, and tokens.
- The launch flow must verify a real confirmation email, not only local mocks.

## Trust and safety

- Missing measurements remain unknown and never render as a clean result.
- Repo downvotes require reasons; comment downvotes do not affect repository reputation.
- Rate limits apply to search, repo votes, comments, comment votes, compatibility reports, and submissions.
- All user text is rendered as escaped plain text.
- One user gets one vote per item and one vote per comment.
- Shadow-banned repo votes have zero ranking weight.
- Campaign automation never scripts the X website. The nightly scheduler creates a local review packet; a person posts it, or a separate adapter uses the official X API.

## Infrastructure

- Product interface: Next.js on Vercel at `reppit.dev`.
- Agent-facing HTTP interface: Rust at `api.reppit.dev`, versioned under `/api/v1`.
- Production data and authentication: Supabase Postgres with pgvector and Supabase Auth.
- Local development and tests: PGlite.
- Ranking, ingestion, voting, and search migrate vertically to Rust; the TypeScript core remains a compatibility adapter until parity tests pass.
- CLI: native Rust binary, distributed through a small `npx reppit` launcher and platform-specific npm packages. MCP server: thin client of the same hosted Rust interface.
- Nightly maintenance: refresh repository signals and curated skill sources.

## Launch campaign

The campaign runs for 20 days. Each campaign night contains a two-post X thread with one black-and-white stick-figure comic per post.

- Future posts are assigned one random time from 5:15 PM to 9:45 PM Australia/Sydney.
- At the due time, the scheduler creates a private local review page with approved copy, matching figures, and copy buttons. It never opens, types into, uploads to, or clicks Post on X.
- A person publishes the reviewed thread and records both live status URLs. Fully automatic publishing is allowed only through the official X API under X's automation rules.
- The first roughly 10 tweets frame the problem through concrete scenarios and measured figures.
- The middle of the campaign explains the Reddit-style feed and task-based skill retrieval.
- No production link is posted until the live signup, vote, comment, and skill-search flows pass verification.
- Once live, posts use the real URL, real app screenshots, and a short demo video.
- Copy stays plain, measured, and blunt: short sentences, no hype, no fake urgency, no emojis, and no unsupported numbers.
- Popular skills may be used as timely examples only when they are genuinely indexed and relevant. Their names and sources remain visible; reppit does not imply endorsement.

## Demo video

Target length: 45–60 seconds, silent-first with captions and optional light narration.

Storyboard:

1. An agent suggests a repository; the developer sees only a star count.
2. Open the reppit feed and switch between Trusted, Most voted, and New.
3. Open an item, inspect maintenance signals, upvote or choose a downvote reason.
4. Add a comment and reply to a useful comment.
5. Run `reppit get skills "video editing to make cinematic videos"`.
6. Show recommendations, inspect instructions, then use an explicit install flag.
7. End on the live URL and the line: “Browse repos. Find skills for the task.”

The video must be recorded against the live product or a production-equivalent preview with seeded non-sensitive data. It may not fake a successful action that the product cannot perform.

## Launch measures

Primary:

- unique visitors who run a search;
- signup completion rate;
- users who cast a repo vote or comment;
- skill searches from CLI or MCP;
- return visitors on a second day.

Quality:

- share of searches that return a credible match;
- no-match queries, grouped by task;
- downvotes by reason;
- comments and replies per active item;
- failed signup, confirmation, vote, comment, and install attempts.

Campaign:

- qualified profile visits;
- link clicks after the live URL is introduced;
- demo completion rate;
- replies containing a real search task or concrete product miss.

## Launch gates

The product is ready to link only when all of these pass:

1. Production database, migrations, RLS, Auth, and embedding function pass preflight.
2. The curated repo and skill index is populated and the cinematic-video example returns a credible skill or an honest no-match.
3. Signup, confirmation, login, logout, return path, repo upvote, reason-backed downvote, comment, reply, and comment vote work on the live domain.
4. CLI and MCP packages install from their public package names and point to production.
5. Desktop and phone flows pass full-story verification.
6. Legal/privacy pages and basic moderation controls exist.
7. Screenshots and demo video show the deployed product and contain no private data.
8. The campaign reminder state is active, after-5 scheduling is verified, and the next review packet matches the approved digest.

## Current state

| Area | State on 30 Oct 2026 |
|---|---|
| Feed, search, trust score, repo ranking | Built locally |
| Repo upvote/downvote with required reasons | Built locally |
| Reddit-style discussion | Built locally: comments, replies, Best/New, comment votes, author deletion, and operator removal |
| Legal and moderation | Privacy/terms pages, operator removal, and account suspension built locally |
| Task-based skill CLI choices | Built and tested locally: recommend, select, fetch instructions, and explicit top/selected install; installs verify the indexed commit first |
| Nested skill ingestion | Built and refreshed from five curated sources; nightly workflow configured |
| Email/password and magic-link auth | Built locally; live provider verification blocked |
| Vercel/Supabase deployment | Two linked Vercel projects exist and deploy scripts now stage, verify, then promote; Vercel and Supabase CLI authorization plus a clean production Supabase project are still required |
| Domain | `reppit.dev` was available at USD 13 for one year with USD 13 renewal on 30 Oct 2026; it was not premium and no purchase has been made |
| Rust migration | The native CLI and versioned Rust gateway are built and contract-tested locally. Search and item actions still relay to the TypeScript service; direct Rust-owned catalog logic remains post-launch migration work, not a completed launch claim |
| npm CLI and MCP publication | Public source and release workflows are live at `github.com/devwithjp/reppit`; npm authentication, owned native-package scope, and publication remain |
| 20-day X scheduler and comics | First thread posted. Future randomized nights use a local review-packet reminder; prohibited Playwright posting was removed |
| Live screenshots and demo video | Local desktop/phone screenshots and a checked 49.9-second H.264 demo candidate exist; both must be recaptured against the verified deployment before posting |

## External launch blockers

- Complete Supabase CLI authorization, create or select the clean production project, then run migrations, RLS checks, function deployment, and seed.
- Connect the new Supabase project to the created Vercel `reppit` project.
- Configure npm trusted publishing for `reppit` plus the owned native-package scope.
- Recheck and explicitly approve the live `reppit.dev` purchase quote before any charge.
