# reppit — launch feature list

Written 11 October 2026. Sources: `docs/brand/positioning.md`, `docs/product/segment-and-scope.md`,
`docs/design/design-system.md`, `docs/design/critique.md`, the approved screens in `docs/design/*.html`,
and the code as it stands (`apps/web/app/api/**`, `packages/core`, `packages/mcp-server`, `packages/cli`,
`packages/skill`).

Wireframes for every v1 screen are in `docs/design/wireframes/`. Each wireframe carries numbered
callouts that point back to the IDs below.

## How to read this

- **One row per feature.** The user story names who wants it and why. Acceptance criteria are written so
  each line can become one end-to-end test: a precondition, an action, an observable result.
- **Status** is one of `v1` (shipping at launch), `v2` (built or schema'd, hidden until there are users),
  or `not doing`.
- **Surface** names where the feature lives: a web screen (as named in the wireframes), the MCP server,
  the CLI, the skill, or the API.
- Where the code and the approved design disagree, the criterion states the intended behaviour and the
  row says so in a note. Those disagreements are also collected under "Open questions" at the end.
- Numbers in criteria (limits, thresholds) come from the code where it exists
  (`packages/core/src/ratelimit.ts`, `ranking.ts`, `votes.ts`). Changing a number is a spec change, not a
  test change.

Reason tags (fixed set, five): `unmaintained`, `insecure`, `broken-on-agent`, `misleading`, `low-quality`.
Agents (fixed set, seven): `claude-code`, `codex`, `cursor`, `gemini-cli`, `copilot`, `windsurf`, `other`.

---

## Summary

| Status | Count |
|---|---|
| v1 | 38 |
| v2 | 7 |
| not doing | 6 |
| **Total** | **51** |

---

## 1. Finding things

### F-01 Problem-first search — `v1`

**Story.** As a developer whose agent picked a library, I want to describe the problem in plain words
and get a short ranked list, so that I can compare the agent's choice against the alternatives without
knowing their names.

**Surface.** Landing, masthead search on every page, Search results. API `GET /api/search`.

**Acceptance criteria**
1. Submitting "pull tables out of a pdf in python" from the landing page navigates to `/search?q=…` and
   shows at least one result.
2. A query shorter than 3 characters does not search; the page shows "Type at least 3 characters." and
   the API returns 400.
3. Results are ordered by blended rank (relevance, trust, community, popularity) by default; the sort
   control offers `Relevance` and `Trust`, and choosing `Trust` reorders by trust score descending.
4. The "Read as" line shows the parsed query as chips (task, format, language, surface). Removing the
   `language` chip re-runs the search without the language filter.
5. Kind tabs show counts (Repos n, Skills n, MCP servers n) and selecting one filters to that kind only.
6. The same query issued twice within the cache window returns identical results and the second
   response is marked `cached: true` in the API.
7. Every query is written to `search_log` with the normalised query and returned item IDs, and with
   `user_id` set when signed in.
8. An archived or deprecated item can appear in results but always carries its flag chip on the row.
9. The page title is `<query> — reppit` and the URL is shareable: opening it in a fresh session shows
   the same results.

### F-02 One-line reason per result — `v1`

**Story.** As a developer comparing three candidates, I want each result to say in one sentence why it
fits my problem, so that I am not reading five READMEs.

**Surface.** Search results, MCP `search_repos`, CLI `find`.

**Acceptance criteria**
1. Every search result row shows a one-line explanation, at most 240 characters, beneath the identifier.
2. If the explanation service fails or times out, results still render with the item description in
   place of the explanation, and no error is shown to the user.
3. A result whose relevance is below the weak-match threshold is labelled "partial match".
4. When every result on the page is a partial match, a notice above the list says "Nothing here is a
   strong match. Try describing the problem differently, or submit the repo you end up using."

### F-03 Trust score from six measured signals — `v1`

**Story.** As a developer looking at a repo nobody has voted on, I want a score computed from what the
repo is doing, so that the page is useful before any person has an opinion.

**Surface.** Feed row, Search row, Item page, Item page (cold start), MCP, CLI.

**Signals and points (from the approved item page).** Maintenance recency 25, release cadence 20,
deprecation flags 15, security advisories 15, issue load vs size 15, licence clarity 10. Total 100.
Votes then adjust the total by at most ±12, clamped to 0–100.

**Acceptance criteria**
1. Every indexed item has a trust score between 0 and 100, including items with zero votes.
2. The item page lists all six signals with the observed value, the points awarded and the maximum.
3. The six signal points shown on the item page sum to the pre-vote score, and the displayed score
   equals that sum plus the vote adjustment, clamped to 0–100.
4. An archived repo, or a package marked deprecated on its registry, scores 0 of 15 on deprecation flags
   and shows an `archived` or `deprecated` chip on every row it appears in.
5. A repo with one or more open advisories in the GitHub Advisory Database scores 0 of 15 on advisories
   and shows an `n advisories` chip.
6. The vote adjustment never exceeds +12 or −12, whatever the vote count (test: seed 500 upvotes on an
   item with a pre-vote score of 50; displayed score is 62).
7. Scores are recomputed at least hourly; the item page shows "computed n minutes/hours ago" and the
   value is never older than 2 hours on a healthy system.
8. The feed and search rows show the score as `TRUST nn/100` with the six-cell signal strip, so a cropped
   row explains itself.

Note: the code today has a 0–1 `healthScore` from four inputs (`ranking.ts`). Deprecation and advisory
ingestion (F-05) and the points model above are new build. See Open question 3.

### F-04 Unknown is a state, not a pass — `v1`

**Story.** As a developer, I want to see when reppit could not measure something, so that a missing
measurement is not silently counted as good.

**Surface.** Item page, Item page (cold start), signal strip on rows, compatibility tables.

**Acceptance criteria**
1. A signal that could not be fetched (source error, no data, registry not covered) shows "unknown" in
   the Observed column and its cell in the signal strip is drawn as unknown, not as holds or fails.
2. An unknown signal is awarded half its maximum points, and the item page says so in the row
   ("unknown, scored at half").
3. If three or more of the six signals are unknown, no number is shown; the score area reads
   "Not enough data to score" and the item sorts below all scored items under `Top`.
4. An agent with no compatibility reports shows `?` and "unknown", never `✓`.
5. The text "Unknown is an honest answer. It is not the same as 'works'." appears under any
   compatibility table that contains an unknown row.

### F-05 Deprecation and advisory ingestion — `v1`

**Story.** As a developer, I want archived, deprecated and insecure packages flagged automatically, so
that the worst picks are visible on day one with no votes.

**Surface.** Background job; results visible on every row and the item page.

**Acceptance criteria**
1. A nightly job reads the GitHub `archived` flag for every indexed repo and updates the item within 24
   hours of the flag changing.
2. For items with a known npm or PyPI package, the job reads the registry deprecation field and stores
   the deprecation message.
3. The job reads open advisories from the GitHub Advisory Database for every item with a resolvable
   package and stores count and highest severity.
4. A job failure for one item does not stop the run; the failed signal is marked unknown (F-04) and the
   failure is logged with the item slug.
5. The `/api/health` endpoint reports the time of the last successful ingestion run.

### F-06 Score history — `v1` (accrues)

**Story.** As a developer, I want to see whether the score is rising or falling, so that I can tell a
slowing project from a stable one.

**Surface.** Item page sidebar.

**Acceptance criteria**
1. A snapshot of each item's score is stored once a day.
2. The "Score history" block is shown only when at least two snapshots exist at least 30 days apart;
   otherwise the block is absent (not empty).
3. When shown, the trust panel footer reads "down n points since <month>" or "up n points since
   <month>" using the oldest snapshot within 6 months.

---

## 2. Voting and reports

### F-07 Upvote — `v1`

**Story.** As a developer who used a library and it worked, I want to say so in one action, so that the
next person sees it holds up.

**Surface.** Feed row vote rail, Search row vote rail, Item page sidebar composer. API
`POST /api/items/by-slug/{slug}/vote`.

**Acceptance criteria**
1. A signed-in user clicking the up triangle on a row records an upvote; the net count increases and the
   triangle shows as active without a page reload.
2. On the item page, the upvote button is labelled "It works as described" and records an upvote.
3. Clicking an active upvote again withdraws it (direction null); the count returns to its prior value.
4. A signed-out user clicking either vote control is sent to Sign in with `next` set to the current
   page, and after signing in returns there with no vote recorded.
5. One user has at most one vote per item; voting up then down leaves exactly one down vote.
6. Upvotes are shown on the item page as "works as described" in the reports list.

### F-08 Downvote with mandatory reason — `v1`

**Story.** As a developer whose agent installed something broken, I want to downvote it and say why,
so that the next person gets a decision, not a number.

**Surface.** Feed row, Search row, Item page composer, MCP `vote`, CLI `vote`. Flow (a).

**Acceptance criteria**
1. On a row, clicking the down triangle opens the reason picker; no vote is recorded until a reason is
   chosen and confirmed.
2. The picker lists exactly the five reasons and has no free-text-only option.
3. On the item page, the "Submit downvote" button is disabled until a reason is selected.
4. Closing the picker without choosing a reason records nothing.
5. The API rejects `direction: "down"` with no reason or an unknown reason with 400 and the message
   "Unknown reason tag."
6. An optional note of up to 500 characters may accompany the downvote and is shown in the reports list.
7. The recorded reason appears in the item's reason counts and in the "Reasons given" tags on its rows
   within one page load.
8. Choosing `broken-on-agent` asks "Which agent?" next and records a compatibility report (F-10) with
   status `broken` for that agent alongside the vote.

Note: the note field (criterion 6) is not in the vote API today; the compat API takes a note.

### F-09 Vote weight and decay — `v1`

**Story.** As a developer reading a score, I want old votes and brand-new accounts to count for less, so
that a launch-week pile-on or a 2022 rave does not decide what I install today.

**Surface.** Ranking (core), item page reports list, statement bar.

**Acceptance criteria**
1. A vote's effect halves every 180 days: a vote 180 days old contributes 0.5 of its weight, 360 days
   0.25 (unit test on `weightedScore`, end-to-end by seeding dated votes).
2. Each vote stores a weight between 0 and 2 at the time it is cast; a shadow-banned user's votes have
   weight 0.
3. The item page reports list shows each vote's current decayed weight to two decimals.
4. The item page vote summary reads "Net of decay" and the net shown equals the decayed weighted sum,
   rounded.
5. The statement bar on feed and search states the decay rule and the ±12 cap in one sentence.

Note: today's weight depends on GitHub account age, repos and followers. Email accounts (F-21) have
none of these. See Open question 1.

### F-10 Agent compatibility reports — `v1`

**Story.** As a developer using Codex, I want to know whether a library works under Codex specifically,
so that I do not spend twenty minutes discovering the sandbox lacks a binary.

**Surface.** Item page (compat table and report form), MCP `report_compat`, CLI `compat`. API
`POST /api/items/by-slug/{slug}/compat`.

**Acceptance criteria**
1. A signed-in user can report `works` or `broken` for one of the seven agents, with an optional note up
   to 500 characters.
2. Reporting again for the same item and agent replaces the user's earlier report; the count does not
   increase.
3. An unknown agent or a status other than `works`/`broken` returns 400 listing the valid values.
4. A signed-out report attempt goes to Sign in with `next` set, as in F-07.

### F-11 Agent compatibility display — `v1`

**Story.** As a developer, I want a per-agent summary on every row and a table on the item page, so
that I can see at a glance whether it works where I am.

**Surface.** Feed row, Search row, Item page, Item page (cold start), MCP, CLI.

**Acceptance criteria**
1. Rows show up to four agent chips: `✓`, `✗` or `?`, agent name, report count.
2. An agent is `✓` when works reports outnumber broken in the last 90 days, `✗` when broken outnumber
   works, `?` when there are no reports or they are tied.
3. The item page table lists Claude Code, Codex, Cursor and Gemini CLI always (as unknown if empty),
   plus any other agent with at least one report.
4. Each table row states "n ran it, m failed" and, when 3 or more notes share a cause that has been
   tagged, the cause (e.g. "failed on missing Ghostscript").

Note: grouping failures by cause (criterion 4) needs either manual tagging or clustering. Treat it as
manual tagging by the operator in v1; drop the cause text if not tagged.

### F-12 Withdraw or change your vote — `v1`

**Story.** As a developer who downvoted a library that was later fixed, I want to change my vote, so
that my old complaint does not count against it.

**Surface.** Item page composer, Account (your votes).

**Acceptance criteria**
1. The item page composer shows the user's current vote and reason, with a "Withdraw" link.
2. Withdrawing deletes the vote; counts and trust score update on the next load.
3. Changing a downvote's reason replaces the reason and resets the vote's timestamp (so its decay
   restarts).
4. The Account page lists the user's votes, newest first, each with a Withdraw action.

---

## 3. Browsing

### F-13 Item page — `v1`

**Story.** As a developer with a dependency half-installed, I want one page that tells me whether to keep
it, so that I can decide in under a minute.

**Surface.** Item page `/r/{owner}/{name}`. API `GET /api/items/by-slug/{slug}`.

**Acceptance criteria**
1. Visiting `/r/camelot-dev/camelot` shows: breadcrumbs (kind / language / topic / slug), `owner/name`,
   description, language, licence, stars, flag chips, the install command, the vote summary, the trust
   panel, reports, agent compatibility, the vote composer, "Considered instead".
2. The header vote summary is read-only (no vote control in the header); the only vote control on the
   page is the sidebar composer.
3. The install command has a Copy button; clicking it copies the exact command text.
4. "Considered instead" lists up to four related items with their trust scores, each linking to its item
   page.
5. Reports can be filtered by reason; selecting `unmaintained` shows only those reports.
6. A slug that is not indexed returns the 404 page (F-35) with the submit prompt.
7. The page has a canonical URL and an Open Graph title of `owner/name — trust nn/100`.
8. A Discussion section renders comments and replies, with a clear empty state (F-38).

### F-14 Item page at cold start — `v1`

**Story.** As the first developer to look at a new entry, I want the page to show what the repo is
doing, so that "no votes" does not read as "no information".

**Surface.** Item page (cold start).

**Acceptance criteria**
1. An item with zero votes shows the trust score at hero size with the label "Trust, of 100", and the
   line "Nobody has voted. Here is what the repo is doing."
2. The vote summary reads "no votes yet" (not "be first", not "0").
3. The reports section shows a dashed box "No reports yet." and no zero counts.
4. The compatibility table lists the four default agents as `?` unknown.
5. The "Scored, not voted" block shows how many indexed items have no votes and states that all have a
   score.
6. The page switches to the standard item layout (F-13) on the first vote, with no other change needed.

### F-15 Feed with Hot, Top, New — `v1`

**Story.** As a developer browsing without a specific problem, I want to see what is rising, what holds
up best, and what is new, so that I learn the landscape.

**Surface.** Feed `/browse`. API `GET /api/items?sort=hot|top|new`.

**Acceptance criteria**
1. The default sort is Hot. Selecting Top or New reorders the list and updates the URL (`?sort=top`).
2. Hot orders by `hot_score`, Top by trust score, New by date added.
3. The list loads 25 rows; "Load more" appends the next 25 until the list ends, then the control is
   replaced by "End of list".
4. Each row shows: rank, vote rail with net and the `VOTES` label, `owner/name`, language, licence,
   flags, a two-line clamped description, reason tags, agent chips, `TRUST nn/100`, signal strip, last
   push.
5. A row with no votes shows "no votes yet" in the reasons band, not empty tags.
6. Sort and kind choices survive a reload.

Note: the approved feed design shows Trust / New / Most reported / Falling. The API supports
hot / top / new. See Open question 3.

### F-16 Kind filter — `v1`

**Story.** As a developer who wants an agent capability, not a library, I want to restrict the list to
skills or MCP servers, so that I am not wading through libraries.

**Surface.** Feed, Search results.

**Acceptance criteria**
1. Tabs `Repos`, `Skills`, `MCP servers` filter by kind; the selected tab is underlined.
2. `?kind=skill` in the URL selects the Skills tab on load.
3. An unknown `kind` value is ignored and all kinds are shown.

### F-17 Statement bar and signal key — `v1`

**Story.** As a first-time visitor on a list page, I want the six-cell strip and the score explained
once, so that I do not have to guess what the colours mean.

**Surface.** Feed, Search results.

**Acceptance criteria**
1. Above the list, a statement bar reads: "No human sets the score: it is six measurements of the repo
   itself. Votes adjust it by at most ±12, lose half their weight every six months, and every downvote
   names a reason."
2. A key shows a sample strip and names the six inputs in order.
3. The key is shown once per page, not per row.
4. "How the trust score works" links to a static explainer page.

### F-18 How the trust score works — `v1`

**Story.** As a sceptical developer, I want to read exactly how the score is computed, so that I can
decide whether to believe it.

**Surface.** Static page `/trust`.

**Acceptance criteria**
1. The page lists the six signals, their maximum points, their sources and refresh interval.
2. It states the vote cap (±12), the decay (half every 180 days), how unknown signals are scored, and
   that sponsorship never affects ranking.
3. Every masthead "Trust score" link and every "How the trust score works" link resolves to it.

### F-19 Landing page (signed out) — `v1`

**Story.** As a developer arriving from a post on X, I want to understand what reppit is in three
seconds and try it at once, so that I do not bounce.

**Surface.** Landing `/` for signed-out visitors.

**Acceptance criteria**
1. The first screen at 1440×900 shows the claim, the search input, and the reason taxonomy with counts.
2. At 400 wide the claim and search input are both visible without scrolling.
3. The input's helper line shows live indexed counts ("1,842 repos and 310 agent skills indexed") read
   from the database, not hard-coded.
4. The reason counts are from the last 30 days; when the total is under 50, the block shows the five
   reasons without counts and the line "Counts appear once there are enough to mean something."
5. The MCP install command is shown with a Copy button.
6. A signed-in visitor to `/` sees the Feed instead.
7. No zero vote counts or empty sections appear anywhere on the page.

---

## 4. Contributing items

### F-20 Submit a repo — `v1`

**Story.** As a developer whose agent picked something reppit has not indexed, I want to add it, so that
I and the next person can see its score.

**Surface.** Submit `/submit`. API `POST /api/items`.

**Acceptance criteria**
1. A signed-in user entering `owner/name` or a GitHub URL and pressing Add is taken to the new item page,
   which shows a computed trust score.
2. Submitting a repo that is already indexed goes to its existing item page with the notice "Already
   indexed."
3. A malformed value shows "Provide a GitHub repo as owner/name or URL" and submits nothing.
4. A repo that does not exist on GitHub shows "Repo not found on GitHub."
5. A user who has submitted 10 repos in the last 24 hours sees "Submission limit reached for today"
   and the API returns 429.
6. A signed-out user visiting `/submit` sees the form disabled with "Sign in to submit" linking to Sign
   in with `next=/submit`.
7. A submitted item appears in New on the feed immediately.
8. v1 accepts GitHub repos only; the form says "Skills and MCP servers are indexed from their
   registries. Submit the source repo if one is missing."

---

## 5. Accounts

### F-21 Sign up with email confirmation — `v1`

**Story.** As a developer who wants to vote, I want to make an account with my email, so that my votes
count and I can change them later.

**Surface.** Sign up `/signup`. Server action `signUp(email, password, handle, next)`. Flow (c).

**Acceptance criteria**
1. Submitting a valid handle, email and password shows "Check your email" naming the address, and sends
   one confirmation email.
2. Handles are 2–39 characters, lowercase letters, digits and hyphens; an invalid handle shows the rule
   inline and nothing is sent.
3. Passwords under 10 characters are rejected inline.
4. A handle already taken shows "That handle is taken."
5. An email already registered shows the same "Check your email" screen (no account enumeration) and
   the email sent to that address says an account already exists, with a sign-in link.
6. Clicking the confirmation link signs the user in and lands on `next` (default: the feed) with the
   notice "Email confirmed."
7. An unconfirmed account cannot vote or report; attempting to shows "Confirm your email first" with a
   Resend link.
8. A confirmation link older than 24 hours shows "This link has expired" with a Resend button.
9. The form links to Terms and Privacy; signing up requires ticking "I agree to the Terms and Privacy
   notice".

### F-22 Sign in with password — `v1`

**Story.** As a returning developer, I want to sign in with my email and password, so that I can vote.

**Surface.** Sign in `/signin`. Server action `signInWithPassword(email, password, next)`.

**Acceptance criteria**
1. Correct credentials sign the user in and redirect to `next` or the feed; the masthead shows the
   handle.
2. Incorrect email or password shows "Email or password is wrong." with no indication of which.
3. After 10 failed attempts for one email in 15 minutes, further attempts show "Too many attempts. Use
   a sign-in link instead." for 15 minutes.
4. `next` values pointing off-site are ignored and the user lands on the feed.

### F-23 Sign in with a magic link — `v1`

**Story.** As a developer who does not want another password, I want a sign-in link by email, so that I
can sign in from the address alone. It is also the password reset path.

**Surface.** Sign in `/signin` ("Email me a link instead"). Server action `sendMagicLink(email, next)`.
Flow (c).

**Acceptance criteria**
1. Entering an email and choosing "Email me a link" shows "If an account exists for that address, a
   link is on its way." for any address, registered or not.
2. The link signs the user in and lands on `next`.
3. A link works once and expires after 15 minutes; a used or expired link shows "This link has expired"
   with a form to send another.
4. Requesting more than 5 links for one email in an hour shows the same message but sends nothing more.
5. Signing in through a magic link on an unconfirmed account confirms it.

### F-24 Sign out — `v1`

**Story.** As a developer on a shared machine, I want to sign out, so that nobody votes as me.

**Surface.** Masthead account menu, Account page.

**Acceptance criteria**
1. Choosing Sign out ends the session and redirects to `/`; the masthead shows "Sign in".
2. After sign out, pressing Back and trying to vote sends the user to Sign in.

### F-25 Account page — `v1`

**Story.** As a signed-in developer, I want to see and manage what I have contributed, so that I stay in
control of my votes and data.

**Surface.** Account `/account`.

**Acceptance criteria**
1. Shows handle, email, account age, and the current weight of a new vote from this account.
2. Lists the user's votes (item, direction, reason, date, current weight) with Withdraw (F-12).
3. Lists the user's compatibility reports and submissions.
4. "Change password" sends the user through the magic-link flow and then shows a set-password form.
5. "Delete account" asks for the handle to be typed, then deletes the account, its votes, reports and
   sessions, and signs out. Item scores are recomputed within an hour.
6. "Download my data" returns a JSON file of the account, votes, reports and submissions.
7. A signed-out visitor to `/account` is redirected to Sign in with `next=/account`.
8. No API key section is visible (F-39 is v2), unless Open question 2 is decided otherwise.

---

## 6. Inside the agent

### F-26 MCP server: `search_repos` — `v1`

**Story.** As a developer whose agent is about to add a dependency, I want the agent to ask reppit first,
so that I find out before the install, not after.

**Surface.** MCP server (stdio and streamable HTTP). Flow (b).

**Acceptance criteria**
1. `claude mcp add reppit -- npx -y reppit-mcp` installs the server and `search_repos` appears in the
   agent's tool list.
2. Calling `search_repos` with a problem returns up to `limit` results (default 5, max 10), each with
   slug, kind, one-line reason, trust score, flags, top reason tags, agent compatibility and install
   command, as text and as `structuredContent`.
3. `language` and `kind` filters behave as in F-01.
4. Unknown signals and agents are reported as "unknown" in the text, never omitted.
5. Without an API key, calls are rate limited per IP as anonymous search (F-31); a 429 returns the text
   "reppit search limit reached for this hour" rather than an exception.
6. The streamable HTTP mode answers at `/mcp`; any other path returns 404.

Note: the server currently registers as `gitit` and reports "health n%". Both change before launch: the
name to `reppit`, the health figure to `trust nn/100`.

### F-27 MCP server: `get_repo` and `install_skill` — `v1`

**Story.** As a developer, I want my agent to pull the full picture for one result and the exact install
command, so that it can explain its pick and I can confirm the install.

**Surface.** MCP server.

**Acceptance criteria**
1. `get_repo` with a valid slug returns description, trust score with all six signals, vote summary,
   reason counts, agent compatibility and a README excerpt up to 3,000 characters.
2. `get_repo` with an unknown slug returns "Not indexed on reppit" and a submit URL, not an error trace.
3. `get_repo` returns the public discussion with comment scores; deleted bodies remain hidden.
4. `install_skill` returns the command only; the server never executes it.
5. For skills the command is `npx reppit add <slug> --yes`; for libraries it is the package-manager command
   for the item's language.

### F-28 MCP server: `vote` and `report_compat` — `v1` (depends on Open question 2)

**Story.** As a developer who just found a library broken under my agent, I want to tell my agent to
report it, so that I do not have to switch to a browser.

**Surface.** MCP server. Flow (b).

**Acceptance criteria**
1. Both tools state in their description that they must only be called when the user explicitly asks.
2. `vote` with `direction: down` and no reason returns "A downvote needs a reason: unmaintained,
   insecure, broken-on-agent, misleading or low-quality." and records nothing.
3. Without credentials, both tools return "Sign in to reppit to vote or report: <url>" and record
   nothing.
4. With valid credentials, a vote or report made through MCP is visible on the item page under the
   user's handle and counts exactly as a web vote.
5. Votes and reports through MCP are subject to the same rate limits as the web (F-31).

### F-29 CLI — `v1`

**Story.** As a developer in a terminal without MCP, I want the same lookups as a command, so that any
agent that can run a shell can use reppit.

**Surface.** `npx reppit` (package currently `gitit-cli`).

**Acceptance criteria**
1. `reppit find "<problem>" [--lang x] [--kind repo|skill|mcp] [-n 5]` prints the same results as F-26
   in a fixed-width layout no wider than 80 columns.
2. `reppit show <owner/name>` prints the item summary with trust score and install command.
3. `reppit add <owner/name>` prints the install command and stops unless `--yes` is present. With
   `--yes`, a skill is fetched at its indexed commit, that commit is verified, and only then is the
   local snapshot handed to the agent skill installer.
4. `reppit vote` and `reppit compat` behave as F-28, including the reason requirement.
5. Any failure exits non-zero with a one-line message on stderr; `reppit` with no arguments prints help
   and exits 0.
6. Output contains no colour codes when stdout is not a TTY.

### F-30 Cross-agent skill `find-repo` — `v1`

**Story.** As a developer using any agent that reads skills, I want my agent to know when and how to ask
reppit, so that it checks before adding a dependency without me telling it to.

**Surface.** `packages/skill/skills/find-repo/SKILL.md`, installed via `npx skills add`.

**Acceptance criteria**
1. Installing the skill and asking the agent "what should I use to parse PDF tables in python" results
   in a `search_repos` call (or `reppit find` when MCP is unavailable).
2. The agent presents at most three results with slug, reason, trust score and any flag, and leads with
   why the top one won.
3. If the top result carries `insecure` or `unmaintained`, the agent says so before recommending it.
4. The agent does not run an install without the user's go-ahead.
5. The agent calls `report_compat` only after the user states the outcome, and `vote` only when asked.
6. The skill text uses the name reppit and the CLI name `reppit`, not gitit.

---

## 7. Limits, abuse, money

### F-31 Rate limits — `v1`

**Story.** As the operator, I want per-user and per-IP limits, so that one script cannot drown the
signal or the bill.

**Surface.** API, MCP, CLI.

**Acceptance criteria** (limits from `packages/core/src/ratelimit.ts`)
1. Anonymous search: the 31st search from one IP within an hour returns 429 with a JSON body naming the
   limit; the web page shows "Search limit reached for this hour. Sign in for more."
2. Signed-in search: limit is per user, 300 per hour (new rule; today signed-in web users fall under the
   IP rule).
3. Votes: the 61st vote from one user, or 121st from one IP, within an hour returns 429 "Too many
   votes, slow down".
4. Submissions: the 11th in 24 hours returns 429 (F-20).
5. Rate-limit counters survive a server restart and are shared across instances (today they are
   in-memory; launch needs a shared store).
6. 429 responses include a `Retry-After` header.

### F-32 Abuse defences — `v1`

**Story.** As a developer relying on reason counts, I want brigading and sock puppets to have little
effect, so that the reasons can be trusted.

**Surface.** Ranking, auth, operator tooling.

**Acceptance criteria**
1. One vote per user per item is enforced in the database (unique constraint), not only in the UI.
2. Votes from accounts younger than 24 hours, or unconfirmed, are rejected.
3. The operator can shadow-ban a user with one command; the user's existing and future votes get weight
   0, and the user sees no change in their own UI.
4. An item receiving more than 30 downvotes in one hour triggers an alert to the operator and holds the
   vote adjustment at its prior value until reviewed.
5. Vote notes and compat notes are stored as plain text and rendered escaped; HTML or script in a note
   appears literally.
6. Sign-up and magic-link endpoints are protected by a challenge after 5 attempts per IP per hour.

### F-33 The wall between ranking and money — `v1`

**Story.** As a developer, I want to know that nobody paid to rank above the thing that works, so that
the ranking means something.

**Surface.** Ranking code, Search results footer, `/trust`.

**Acceptance criteria**
1. The ranking module imports nothing from billing or sponsored placement (enforced by a lint rule or a
   test that fails on such an import).
2. Search results and the feed show the line "Nothing here is sponsored. Ranking and placement are
   separate systems and always will be."
3. The `/trust` page states the same rule.
4. Sponsored records in the schema have no column read by `blendedRank`, `hotScore` or the trust score.

### F-34 Search limits for agents — `v1`

**Story.** As a developer whose agent searches several times a session, I want the free limit to be
enough for normal work, so that the agent does not hit a wall mid-task.

**Surface.** MCP, CLI.

**Acceptance criteria**
1. A single agent session issuing 20 searches in an hour from one IP receives results for all 20.
2. Identical queries within the cache window do not count against the limit.
3. When the limit is reached, the MCP text and CLI message say when it resets.

---

## 8. Pages that must exist

### F-35 404 and error pages — `v1`

**Story.** As a developer following a stale link, I want to be told plainly what is missing and what to
do, so that I am not stuck.

**Surface.** 404, 500.

**Acceptance criteria**
1. Any unknown path returns HTTP 404 with the page "No page here." and a search input.
2. A path of the form `/r/{owner}/{name}` that is not indexed adds "reppit has not indexed
   owner/name." and a Submit button prefilled with it.
3. A server error returns HTTP 500 with "Something broke on our side." and a request ID, and nothing
   from the stack trace.
4. Both pages keep the masthead and footer.

### F-36 Cold-start states on list pages — `v1`

**Story.** As an early visitor, I want list pages that make sense with few votes, so that the site does
not look abandoned.

**Surface.** Landing, Feed, Search results.

**Acceptance criteria**
1. A row with no votes shows the trust score and "no votes yet"; it never shows `0 votes` or empty tag
   rows.
2. Under Hot, when fewer than 10 items have any votes, the list falls back to trust score order and says
   "Few votes yet, so this is ordered by trust score."
3. A search with zero results shows "Nothing indexed matches that." with a Submit link and the query
   preserved in the input.
4. The landing reason block follows F-19 criterion 4.

### F-37 Legal and privacy pages — `v1`

**Story.** As a developer signing up, I want to know what is stored about me, so that I can decide.

**Surface.** `/terms`, `/privacy`, footer on every page.

**Acceptance criteria**
1. `/terms` and `/privacy` exist and are linked from every page footer and from Sign up.
2. The privacy page lists every stored field about a user, the search log retention period, and the
   sub-processors (email sender, host, database, embedding and explanation providers).
3. Search queries are stored without IP addresses; IPs are held only in rate-limit counters and expire
   with them.

---

## 9. Community and v2

### F-38 Threaded comments — `v1`

**Decision update, 29 October.** Threaded discussion is now part of the launch product. A clear empty
state handles cold start. Repo votes affect item ranking; comment votes order the discussion only.

**Acceptance criteria.** Visitors can read comments and replies. Signed-in users can comment, reply,
vote comments up or down, and delete their own comments. Deleted parents remain as placeholders when
they have replies. Operators can remove abusive content. Comments are escaped plain text.

### F-39 API keys — `v2`

**Story.** As a developer running reppit inside CI or several agents, I want a key with a higher limit,
so that I am not throttled per IP.

**Note.** The schema and the old account page exist. The UI is hidden in v1. But MCP and CLI writes
(F-28) need some credential: see Open question 2.

### F-40 Sponsored placement — `v2`

**Story.** As a maintainer, I want to pay for a clearly labelled slot, so that people find my project,
without touching its rank.

**Note.** Schema exists and stays. No UI in v1. The wall (F-33) ships in v1.

### F-41 Topic and language pages — `v2`

Hidden until there is enough traffic for them to matter for search. Breadcrumbs on the item page show
language and topic as plain text, not links, in v1.

### F-42 Metering and paid tiers — `v2`

After there are users. Depends on F-39.

### F-43 Submit skills and MCP servers directly — `v2`

v1 indexes them from registries.

### F-44 GitHub sign-in — `v2` (pending Open question 1)

Exists in code today. Not part of the v1 auth design (email, password, magic link). It may come back
early because the vote weight model depends on GitHub account data.

### F-45 Saved searches and email alerts when a dependency's score drops — `v2`

Asked for by nobody yet; noted because the score history (F-06) makes it cheap later.

---

## 10. Not doing

### F-46 Direct messages — `not doing`

Discussion stays attached to an item. There are no private messages or standalone forums in v1.

### F-47 Skills marketplace with payments — `not doing`

ClawHub has it. The supply side is not our problem.

### F-48 Hosting MCP servers — `not doing`

Capital intensive and someone else's business.

### F-49 VS Code extension — `not doing`

The agent is the surface.

### F-50 Our own registry or installer — `not doing`

Delegate to `npx skills add` and native package managers.

### F-51 Karma, badges, streaks, vote-to-earn — `not doing`

Gamifying votes corrupts the only signal that matters. Vote weight is shown to the voter (F-25) as a
plain number, not as a level.

---

## Non-goals for v1

- **Not a popularity chart.** Stars are shown as a fact on the item page and never sorted by.
- **Not a security scanner.** Advisories are read from the GitHub Advisory Database; reppit does not
  scan code.
- **Not an installer.** reppit prints install commands. Nothing on the site, in MCP or in the skill runs
  an install without the user's explicit yes.
- **Not a chat app.** Comments and replies stay attached to an item; there are no DMs or standalone forums.
- **No free-text-only downvotes.** A note is optional; the reason tag is not.
- **No agent votes on the user's behalf.** MCP write tools are only called on explicit instruction.
- **No personalised ranking.** Everyone sees the same order for the same query.
- **No mobile app.** The site works at 400 wide; that is the mobile story.
- **No coverage promise.** v1 indexes a curated seed set plus submissions. Search may miss things and
  says so (F-02 criterion 4, F-36 criterion 3).

---

## Launch checklist

Each line is a yes/no check made on the production deployment, not on a laptop.

### Data
- [ ] The index holds at least the seed set (target 1,800+ repos, 300+ skills) and `/api/health` reports
      the item count.
- [ ] Every indexed item has a trust score, or is marked "Not enough data to score" (F-04).
- [ ] Deprecation and advisory ingestion (F-05) has completed at least one full run, and the last-run
      time is visible in `/api/health`.
- [ ] Every item has a real embedding (not the local fallback); `/api/health` reports the provider.
- [ ] The search eval has been run on the rebuilt index and the number, including the coverage ceiling,
      is written down and published.
- [ ] Sample data from the design prototypes is not in the production database. No fake votes, reports
      or reason counts anywhere.
- [ ] A database backup runs daily and one restore has been tested.

### Auth
- [ ] Sign up, email confirmation, password sign-in, magic-link sign-in and sign-out pass end to end on
      production with a real inbox (F-21 to F-24).
- [ ] Confirmation and magic-link emails come from a verified sending domain with SPF, DKIM and DMARC,
      and land in the inbox (not spam) at Gmail and Outlook.
- [ ] The dev-only credentials provider is off in production (`NODE_ENV=production`), checked by trying
      it.
- [ ] Sessions are cookies with `Secure`, `HttpOnly` and `SameSite=Lax`.
- [ ] The "Sign-in is being set up" placeholder message no longer appears anywhere.

### Legal and privacy
- [ ] `/terms` and `/privacy` are live and linked from every footer and from Sign up (F-37).
- [ ] Account deletion and data download work (F-25).
- [ ] No analytics or third-party script loads before consent where consent is required; the privacy
      page lists what does load.
- [ ] Repository names are real; nothing on the site states a vote count or compatibility report that
      did not happen.

### Error pages and edge states
- [ ] 404 and 500 pages render with the masthead and return the right status codes (F-35).
- [ ] Every cold-start state renders without zero counts (F-14, F-36).
- [ ] Every screen in `docs/design/wireframes/` has been checked at 1440 and 400 wide on production.

### Monitoring
- [ ] `/api/health` is polled every minute by an external uptime check that pages the operator.
- [ ] Server errors are captured with request IDs and alert above 1% of requests over 5 minutes.
- [ ] The downvote-burst alert (F-32 criterion 4) is wired and has been triggered once in staging.
- [ ] Explanation and embedding provider spend has a daily cap and an alert at 80% of it.
- [ ] Rate-limit counters are on the shared store (F-31 criterion 5).

### Naming
- [ ] Every user-visible string says reppit: site, MCP server name, CLI binary, skill text, email
      sender, environment variable documentation. No `gitit` remains in anything a user reads.
- [ ] `npx -y reppit-mcp` and `npx reppit` resolve to published packages owned by us.

---

## Open questions

Decisions needed before launch. Each one blocks at least one acceptance criterion above.

1. **What decides a vote's weight for an email account?** The weight model (`voteWeight` in
   `ranking.ts`) is built entirely on GitHub data: account age, public repos, followers. v1 auth is
   email, password and magic link, so every new account has none of it and votes at 0.2 forever, while
   a throwaway email costs nothing. Options: bring GitHub sign-in back as the only way to vote (F-44),
   allow linking a GitHub account to raise weight, or weight by reppit account age and activity. This
   decides F-09, F-25 criterion 1, F-32 and the sock-puppet story.
2. **How do MCP and CLI writes authenticate if API keys are v2?** `vote` and `report_compat` require
   `GITIT_API_KEY`. Scope says API keys are v2 and their UI is hidden. Without a credential, the
   in-agent compatibility report, which is the one thing nobody else collects and is meant to come from
   inside the agent, cannot be submitted from inside the agent. Options: ship a minimal personal token
   on the Account page in v1, a device-code sign-in for the CLI and MCP, or make in-agent writes v2 and
   hand the user a link to the item page instead.
3. **What is the trust score, exactly, and what does the feed sort by?** The approved designs show a
   six-signal points table summing to 100 plus a ±12 vote adjustment, and a feed sorted by Trust / New /
   Most reported / Falling. The code computes a 0–1 health score from four inputs, blends it with votes
   and stars for search, and the feed API sorts by hot / top / new. This spec has picked the design's
   points model and hot/top/new, but the two need to be reconciled in one place: whether "Top" means
   trust score or weighted votes, whether "Most reported" and "Falling" ship, whether stars feed the
   trust score at all (the brand says no), and how unknown signals are scored (this spec says half
   points, and no score at three or more unknowns).

Smaller ones, noted so they are not lost:
- The product is reppit; the packages, MCP server name, env vars and default API URL say gitit
  (`gitit.dev`). Rename before launch or keep a compatibility alias?
- Does an upvote take a reason? The design labels it "works as described". This spec treats that as the
  label, not a tag, and lets an upvote carry an optional note.
- Who tags compatibility failure causes ("failed on missing Ghostscript") in v1? This spec says the
  operator, by hand, or not at all.
