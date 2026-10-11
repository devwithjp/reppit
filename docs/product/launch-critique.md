# reppit launch critique

## Third pass, 2026-10-12 (rebuild)

Same method as before: Chrome through Playwright, desktop and 400px, against the rebuilt production build (761 entries). I ran the full query set again, then name lookups, then seven queries I had never typed before, to see whether the gains hold beyond the libraries I'd already named. Sign-in is still not available on this machine, so the signed-in flows (voting, compatibility reports, tokens) are judged only from what the pages say. I read no source this pass. The two earlier passes are below, unchanged.

### Verdict

**Yes, I'd use the site next week. I wouldn't add it to my agent yet, and it isn't ready for a public launch.**
- **What's better:** my query set now mostly returns the library I'd pick, at #1, with the real install command and an honest note of how many signals the score rests on. "Too little measured" replaced the fake 79s, and dead libraries are capped (redux-form 35).
- **What still stops me:** a third of fresh queries for things not in the index still return confident junk. "Feature flags" returns redis, sequelize and yt-dlp. The install line is still wrong, or a `git clone`, for several major projects. And nearly every score is still exactly 85.

### What the team said changed, checked

| Claim | What I saw | Status |
|---|---|---|
| Package offered only when it's the repo's primary one; prisma, TanStack Query and react-pdf point to install docs | The wrong packages are gone for those three. But the copy button now gives **`git clone https://github.com/prisma/orm.git`**, and the note says "Check its install docs" with **no link**, plus a grammar slip ("publishes 1 packages"). The same happens for TanStack/query, react-pdf, yaak, hoppscotch, bruno and opendataloader-pdf. Prisma's trust score is **still computed from `@prisma/orm-toolchain`**, the package the page now says isn't the one to install. **Not fixed:** OpenHands still gives `npm install @openhands/agent-canvas`. polars gives `cargo add polars` (a Python developer wants `pip install polars`). ollama gives `go get github.com/ollama/ollama`, and hurl gives `cargo add hurl`. Neither is how you install those apps. | **Partly** |
| A number only with at least 3 measured signals, otherwise "too little measured" plus the known facts | anything-llm, llama.cpp and Mailspring now say "too little measured · 2 of 4 measured" with the facts table. 19 of 118 rows. | **True** |
| Not-applicable counts as half, so no package can't raise the score | The /trust page says so, and repos with no package no longer outrank measured ones (anything-llm has no number now). | **True** |
| Idle a year capped at 50, two years at 35 | redux-form: 35, "last push 2 years ago". httpie: 50. | **True** |
| Every score shows how many signals it rests on | "4 of 6 measured" on every search row, item page, the /agent transcript and the homepage example. | **True** |
| A language in the query filters results | "schema validation typescript" no longer returns pydantic. "http client for python async" is all Python. "orm for python" returns only Python. | **True** |
| Single identifiers are name lookups | Works for indexed names (`zod`, `clap`, `polars`, `httpx`, `envalid`, `express-rate-limit`, `ollama`, `llama.cpp` are all #1) and for `sqlalchemy` and `pino` ("Not in the index yet"). **Fails for some unindexed names:** `requests` returns Alamofire, guzzle, Scrapling. `fastapi` returns fastapi_mcp and then a TikTok downloader. | **Mostly** |
| zod, clap, polars, httpx, express-rate-limit, envalid added | All present and all #1 for their own queries. | **True** |
| CLI/MCP commands hidden until published; /agent lists what each tool does | The commands are gone. "Published on launch day." Each tool is described: `search_repos` and `get_repo` read only; `vote` and `report_compat` "act as you, with your personal token"; `install_skill` "returns an install command, it never runs it"; without a token the server only reads. | **True** |

### Search, like for like

Top three, then whether my pick is in the top three and at #1. Hit = something I'd actually choose.

| Query | Pass 1 top | Pass 2 top | Pass 3 top three | Top 3 | #1 |
|---|---|---|---|---|---|
| parse pdf tables in python | opendataloader-pdf (Java) | docling | docling 85, pdfplumber 91, pdf-inspector 85 | Yes | Yes |
| typescript orm for postgres | drizzle-orm | prisma/orm | prisma/orm 85 (`git clone`), drizzle-orm 87, typeorm 85 | Yes | Yes, but Prisma's line is `git clone` |
| rate limit an express api | scalar | redisson | **express-rate-limit 93**, redisson (too little), firecrawl-mcp | Yes | Yes |
| run an llm locally | llm-app | llm-app | llm-app 83, anything-llm (too little), OpenHands (wrong package) | No | No |
| validate env vars in node | developer-roadmap | validator.js | **envalid 92**, validator.js | Yes | Yes |
| websocket server for node | ws | ws | ws 87, yaak, hoppscotch | Yes | Yes |
| background jobs with redis in node | river (Go) | bullmq | bullmq 85, xstate, bull | Yes | Yes |
| cli argument parsing in rust | tree-sitter | Not in index | **clap 93** (only result) | Yes | Yes |
| http client for python async | aiohttp | aiohttp | aiohttp 85, httpx 79, httpie 50 | Yes | Yes |
| date library javascript | electron | date-fns | date-fns 87, dayjs 85, timeago.js 82 | Yes | Yes |
| react form validation | react-hook-form | react-hook-form | react-hook-form 85, react-final-form 81, valibot 85 | Yes | Yes |
| markdown parser | parsedown (PHP) | marked | marked 85, parsedown (too little), opendataloader-pdf | Yes | Yes |
| send transactional email from node | n/a | react-email | react-email, nodemailer, novu | Yes | No |
| dataframe library faster than pandas | n/a | Not in index | **Not in the index yet**, although polars is indexed and the query `dataframe` finds it | No | No |
| state management for react | n/a | react | react, zustand, react-hook-form | Yes | No |
| end to end browser testing | n/a | SeleniumBase | SeleniumBase, playwright 87, browser-use | Yes | No |
| schema validation typescript | n/a | valibot | **zod 93**, valibot, joi | Yes | Yes |

| Set | Pass 1 top 3 / #1 | Pass 2 top 3 / #1 | Pass 3 top 3 / #1 |
|---|---|---|---|
| Brief's 8 | 4 / 2 | 4 / 4 | **7 / 7** |
| Original 12 | 8 / 4 | 8 / 8 | **11 / 11** |
| 5 new from pass 2 | n/a | 4 / 1 | **4 / 1** |
| All 17 | n/a | 12 / 9 | **15 / 12** |

**Caveat: much of this jump is teaching to the test.** Every query that moved from miss to hit since pass 2 (rate limiting, env validation, Rust CLI parsing), plus zod taking #1 for schema validation, moved because the team hand-added exactly the libraries my critique named. To check whether it generalises, I typed seven queries I'd never used:

| Fresh query | Result | Hit? |
|---|---|---|
| `sqlalchemy` | Not in the index yet | No (honest) |
| `pino` | Not in the index yet | No (honest) |
| structured logging for node | maxun, a data-structures textbook, brightdata-mcp | No (junk) |
| resize images in python | Pillow | Yes |
| python web framework | Flask, Django | Yes |
| mock http requests in tests | hoppscotch, hurl, bruno: API clients | No (junk) |
| feature flags | redis, sequelize, yt-dlp | No (junk) |

**Fresh hit rate: 2 of 7.** The ranking is fine when the library is in the index. The index is still the bottleneck. When the right answer is missing, the relevance floor lets junk through for problem-style queries, and it catches only single words.

### The four questions

**1. Would I use it next week? Would I add it to my agent once the packages are published?**
- **The site: yes.** I'd use it as a check on what my agent picked. "zod 93 · 5 of 6 measured · last release 28 days ago" and "redux-form 35 · last push 2 years ago" are the answers I came for.
- **The agent: not yet.** The tool descriptions are now good enough that permissions wouldn't stop me. Two things would:
  - The MCP returns install lines and an agent acts on them. Today that means a `git clone` for Prisma and TanStack Query, `cargo add polars` for a Python project, `go get` for ollama, and an unrelated npm package for OpenHands.
  - "The server tells the agent to use [vote] only when you ask" is a prompt instruction, not a permission check. I'd want vote and report_compat to need confirmation in my client, or a read-only token by default.

**2. Does it now deliver on "stars say it was popular, reppit says it still works"?**
- **For the dead ones, yes.** That's the half that matters most. Archived is capped at 25, idle a year at 50, two years at 35, and advisories show (httpie 50, ollama 72 with 9 advisories). For the first time the product reliably tells me when **not** to use something, and stars can't do that.
- **For the healthy ones, no.** 79 of 118 scores were exactly 85. Release cadence is measured for only the six newly added repos (they score 91–93), and issue load for none. So the 85-versus-93 gap mostly reflects whether reppit fetched release data, not whether the project is healthier. zod 93 vs valibot 85, and pdfplumber 91 vs docling 85, are measurement artefacts that look like judgements.
- **"Still works" for my agent** is unanswered: zero agent-compatibility reports anywhere I looked.

Today the product delivers "it's dead or insecure", not yet "it still works".

**3. Launch-ready for a public build-in-public launch, assuming sign-in works?** **No.** It's close, and the remaining reasons are specific:
1. **Releases and issue load aren't measured for about 99% of the index.** Every healthy library scores 85, the seeded ones score 93, and the first sharp commenter will line up zod 93 against valibot 85 and ask why. This is the score's credibility, on launch day, in public.
2. **Wrong or useless install lines for well-known projects.** Prisma and TanStack Query get `git clone`, with an unlinked "check its install docs". Polars gets `cargo add`, ollama `go get`, OpenHands an unrelated npm package. And Prisma's trust score is built from a package the page itself disowns. Build-in-public readers will try the famous ones first.
3. **Junk above the floor for problem queries outside the index** (feature flags, structured logging, mocking HTTP, `requests`, `fastapi`). After pass 2's honest "Not in the index yet", it's jarring when it doesn't fire. Also, "dataframe library faster than pandas" says "not in the index" while polars is indexed, so the floor also has false negatives.
4. **An empty community layer:** 743 of 761 entries have no votes and there are no agent-compat reports. Launching with empty compatibility tables invites "nobody uses this". The team should seed honest reports on the top 50 before launch.

Smaller: the homepage and /trust intro still say "not enough data" while the UI says "too little measured". The /agent demo transcript still ends on a `git clone` for opendataloader-pdf, and for the same problem returns weaker results than the site's own search (docling, pdfplumber).

### Updated must-fix list, ranked

Struck through = resolved on this build.

1. **Measure releases and issue load across the whole index** (GitHub API with a token budget, run as a batch). Until then, either don't rank by trust between scores that differ only because release data was fetched, or show "releases not measured" on the row. Without this, the score separates dead from alive but not good from fine. *Medium.*
2. **Finish install lines.**
   - **No package to offer:** link the repo's install docs (or README install section) and make the copy button copy nothing, never `git clone`.
   - **Several registries:** pick the one matching the query's language or the repo's main language (`pip install polars` for Python).
   - **Apps vs libraries:** label apps as apps (ollama, hurl, OpenHands) rather than handing out `go get` / `cargo add`.
   - **Prisma's score:** stop computing deprecation and advisories from a package the page has rejected.
   - **Copy:** fix "1 packages".

   *Small to medium.*
3. **Tighten the relevance floor for multi-word problem queries, and fix its false negatives.** "Feature flags" should say "not in the index", and "dataframe library faster than pandas" should find polars. `requests` and `fastapi` should be name lookups that say "not in the index", not fuzzy matches. *Medium.*
4. **Keep growing the index on real demand, not on the critique's list.** sqlalchemy, pino, requests, fastapi, msw/nock, a feature-flag library, pandas. Log "not in the index" queries from day one and seed from them. *Medium, ongoing.*
5. **Seed agent-compatibility reports and some honest votes on the ~50 most-searched entries before launch.** Make `vote` / `report_compat` need confirmation in the client, or default to a read-only token. *Medium.*
6. **Small copy consistency:** "not enough data" vs "too little measured", and an /agent transcript that ends on a real install command. *Small.*
7. ~~Publish `reppit-mcp` / `reppit` or hide the commands.~~ Hidden until launch. Publishing them is now a launch-day task. Reserve both names on npm today regardless.
8. ~~Show how many signals a score rests on; no number for thin data.~~ Done.
9. ~~Stale repos scoring like healthy ones (redux-form 60).~~ Done: idle caps at 50/35.
10. ~~Repos without a package outranking measured ones.~~ Done: not-applicable counts as half, and thin data gets no number.
11. ~~Language-blind ranking.~~ Done.
12. ~~Exact name first; obvious libraries missing (zod, clap, polars, httpx, express-rate-limit, envalid).~~ Done.
13. ~~Archived/deprecated cap~~, ~~signal enrichment~~, ~~overclaiming copy~~, ~~mobile nav~~, ~~data errors~~: done in earlier passes, and still holding.

---

## Second pass, 2026-10-12

I ran the same queries as the first pass, the same way: Chrome through Playwright, at desktop width and at 400px, against the production build on localhost:3100 (755 entries). I added a set of name lookups and five new queries. Sign-in is still not available on this machine, so I judged only what a signed-out user can use. I checked each change the team said it made against the running site, and read the source only to confirm one suspicion. The first pass is kept unchanged below.

### Verdict

**Probably yes for search, still no for the MCP server.** The product now does part of what it says. Search finds the obvious library first for most of my queries, the install line is usually the real `npm install` / `pip install`, archived repos visibly score 25, and when something isn't indexed it says so instead of making up matches. I'd use the site as a second opinion when my agent picks a dependency. The trust number itself still tells me very little: 82% of the scores I saw were exactly 85 or exactly 79. And the agent integration, which the site calls the main way people will use it, still cannot be installed.

### What the team said changed, checked

| Claim | What I saw | Status |
|---|---|---|
| Trust scores for 610 of 720 repos | 101 of 107 result rows across 11 searches had a number; 6 said "not enough data". That's consistent with the claim. | **True** |
| No-package repos marked "not applicable", page says "2 of 4 measured" | anything-llm: "Deprecated / Advisories: publishes no package, not applicable", "79 from 2 of 4 measured signals". The search row shows only "79/100", with no hint of how thin it is. | **True on the item page, hidden in search** |
| Archived or deprecated capped at 25 | localstack: 25/100, "capped at 25", ARCHIVED and 1 ADVISORY badges. The homepage line about it was rewritten to match. | **True** |
| Full-text blended in, exact names first, relevance floor, "Not in the index yet" | `ollama`, `llama.cpp`, `pdfplumber`, `react` are all #1. Keyboard mash, `zod`, `clap`, `envalid` and two problem queries get "Not in the index yet". One leak: `express-rate-limit` returns only OptimalBits/bull. `/api/health` still reports `"embedding":"local"`, so the full-text match is carrying the ranking. | **Mostly true** |
| Overclaiming copy rewritten, MCP tab hidden, phone nav reworked | "Measured, not voted" replaces "works on day one". /submit and /trust now mention "not enough data". The MCP tab is gone from the header and footer, but `/?kind=mcp` still renders an empty "Browse MCP servers" page. Phones now get a three-tab nav (Browse / Trust score / In your agent) with no horizontal scroll. | **True** |
| Package detection covers npm, PyPI, crates.io, Go | drizzle-orm, ws, react, docling, localstack, ollama (Go) all resolve. But in monorepos it often picks the wrong package (see below). | **True, with a correctness bug** |

### Search, before and after

Same queries as the first pass. "Hit" means something I'd actually choose is in the top three.

| Query | First pass top result | Now top result | Hit now? | Note |
|---|---|---|---|---|
| parse pdf tables in python | opendataloader-pdf (Java) | docling, 85 | Yes, #1 | pdfplumber #2 (now indexed), MinerU #3. All Python, all `pip install`. A clear fix. |
| typescript orm for postgres | drizzle-orm | prisma/orm, 85 | Yes, #1 | Drizzle #2, TypeORM #3. **But Prisma's install line is `npm install @prisma/orm-toolchain`**, a Prisma 8 release candidate for tooling, not `prisma` / `@prisma/client`. |
| rate limit an express api | scalar | redisson/redisson | No | Redisson (Java), go-zero (Go), firecrawl-mcp, bull. Still nothing about rate limiting. |
| run an llm locally | pathwaycom/llm-app | pathwaycom/llm-app | No | anything-llm, then OpenHands (`npm install @openhands/agent-canvas`, which is wrong for a Python agent app). ollama and llama.cpp are still not in the top five for the most obvious question in the set. |
| validate env vars in node | developer-roadmap | validator.js (only result) | No | Fewer results, but still the wrong tool, and no "not indexed" message. |
| websocket server for node | ws | ws, 87 | Yes, #1 | Then yaak and hoppscotch: API clients, not servers. |
| background jobs with redis in node | river (Go) | bullmq, 85 | Yes, #1 | xstate at #2 is wrong; bull at #3 is the legacy predecessor. |
| cli argument parsing in rust | tree-sitter | Not in the index yet | No (honest) | Correct answer given the index. clap is not indexed. |
| http client for python async | aiohttp | aiohttp, 85 | Yes, #1 | httpie at #2 with 53/100, "1 open security advisory, last push 2 years ago". The score is doing its job here. |
| date library javascript | electron | date-fns, 87 | Yes, #1 | dayjs #2. A clear fix. |
| react form validation | react-hook-form | react-hook-form, 85 | Yes, #1 | Unchanged and good. |
| markdown parser | parsedown (PHP) | marked, 85 | Yes, #1 | parsedown #2 is honestly "not enough data". opendataloader-pdf at #3 is noise. |

**Hit rate on these 12: 8 of 12 in the top three, the same as before. #1 correct went from 4 of 12 to 8 of 12. On the brief's eight queries: 4 of 8 in the top three, the same; #1 correct went from 2 of 8 to 4 of 8.** The misses have not moved: rate limiting, local LLMs, env validation, Rust CLI parsing. The difference is that the hits are now first and the junk has mostly gone, and one miss out of four is now an honest "not in the index".

Name lookups: `ollama`, `llama.cpp`, `pdfplumber`, `react` are all #1 (before: 0 of 7 at #1). `zod`, `clap`, `envalid` and the keyboard mash say "Not in the index yet". `express-rate-limit` wrongly returns bull.

Five new queries I'd really type:

| Query | Top three | Hit? | Note |
|---|---|---|---|
| send transactional email from node | react-email, nodemailer, novu | Yes (nodemailer #2) | Reasonable. |
| dataframe library faster than pandas | Not in the index yet | No (honest) | No polars. |
| state management for react | react, zustand, react-hook-form | Yes (zustand #2) | Returning React itself for "state management for react" is the weak version of an exact-name match. TanStack Query's install line is `@tanstack/query-core`, not `@tanstack/react-query`. |
| end to end browser testing | SeleniumBase, playwright, browser-use | Yes (playwright #2) | Playwright scores 87 against SeleniumBase's 85 and still ranks second. |
| schema validation typescript | valibot, joi, pydantic | Yes, #1 | pydantic (Python) at #3 for a TypeScript query. zod is not indexed, and for this query that's the gap people will notice. |

New queries: 4 of 5 in the top three, 1 of 5 correct at #1.

### The four questions

**1. Would I come back next week?** Yes, for the website, as a quick sanity check on what my agent picked. The archived cap, the advisory flags (httpie 53, ollama "9 advisories") and the honest "Not in the index yet" are each worth a visit. No, for adding it to my agent. `npm view reppit-mcp` still returns 404, so the command on every page fails. And the install lines are wrong often enough (Prisma, TanStack Query, react-pdf, OpenHands) that I would not let an agent act on them without checking.

**2. Does "2 of 4 measured" help, or is it noise dressed as a number?** It's noise dressed as a number, and so is most of the scale. Releases and issue load are unknown for every entry I opened, so the most a healthy repo can score is 85 with a package and 79 without. Of 107 scores in my searches, 72 were exactly 85 and 16 exactly 79. The number encodes "publishes a package or not" plus "not archived". "79 from 2 of 4 measured" means "pushed recently and not archived", which GitHub shows already, rescaled to look like a grade. It's also unfair in a way that will mislead: a package-less repo can never lose points on advisories, so anything-llm (79) outranks ollama (72) on trust because ollama's advisories could be measured. And on the other side, redux-form, untouched for two years, scores 60. That's a pass-looking number for a dead library, because last push is only 25 of the 100 points.

What I'd want instead:
- **Search rows:** below 3 measured signals, show the facts ("pushed 4 days ago · not archived · no package") with no number. If the number stays, put "2 of 4 measured" on the row, not only on the item page.
- **Stale repos:** cap anything not pushed in over a year, the same way archived is capped, so dead libraries stop scoring 60.
- **The ceiling:** measure releases and issue load (GitHub API, token budget). Until then, scores between 79 and 87 shouldn't be treated as a ranking.

**3. The biggest reason a developer like me would still leave:** the install lines are wrong when it matters most. The product's pitch is "check before your agent installs", and for Prisma it would install a release-candidate tooling package. For TanStack Query it gives the framework-agnostic core rather than the React package, for react-pdf only the type definitions, and for OpenHands an unrelated UI package. The registry back-link check proves the package belongs to the repo, not that it's the one to install. In a monorepo every package links back. One wrong install via MCP, and I'd uninstall reppit. Close second: the index still misses obvious libraries (zod, clap, polars, express-rate-limit, envalid). With 755 entries, roughly a third of my real queries end in "not in the index" or a miss.

### Updated must-fix list, ranked

Items struck through are resolved on this build.

1. **Pick the right package in monorepos, or show none.** Prefer the package whose name matches the repo or project name (`prisma`, `@tanstack/react-query`, `@react-pdf/renderer`). Skip `-types`, `-core`, `-toolchain`, `-cli` and pre-release-only packages. Ignore packages that are clearly side tools (OpenHands' UI package). When in doubt, link to the repo's install docs instead of printing a command. This is now the main way the product can hurt someone. *Medium.*
2. **Publish `reppit-mcp` and `reppit` to npm, or take the commands off the site.** Still 404 on both. This is unchanged from the first pass, and it's still a squatting hole behind `npx -y`. Say on /agent what `vote` and `install_skill` can do without my approval. *Small to medium.*
3. **Make the trust number carry information.** Measure releases and issue load so healthy repos stop hitting the 85 ceiling. Hide the number, or show "2 of 4 measured" on the search row, when only push and archived are known. Cap repos not pushed in over a year. Fix the ranking bias where an unmeasurable repo outranks a measured one. *Medium.*
4. **Seed the index with the obvious answers.** zod, clap, polars, httpx, express-rate-limit, envalid, and the top packages by downloads on npm, PyPI and crates. The honest "not in the index" is good, but it now shows up for a third of real questions. *Medium.*
5. **Tighten ranking for problem queries.** Treat the language named in the query as a filter: pydantic and redisson should not rank for TypeScript or Express queries. Don't let a bare framework name ("react") win "state management for react". Make sure the relevance floor also catches name lookups like `express-rate-limit` → bull. And switch the embedder off `local`: health still reports it. *Medium.*
6. ~~**Run the signal enrichment so most entries get a number.**~~ Done: 101 of 107 rows have one, though see item 3 on what the number is worth.
7. ~~**Archived or deprecated override "not enough data".**~~ Done: localstack shows 25, capped, with the reason. Small follow-up: an archived package still shows `pip install localstack` with no warning on the command itself.
8. ~~**Never tell anyone to `git clone` a library.**~~ Mostly done: libraries now get registry commands. Repos without a package still show `git clone`, which is acceptable for apps like anything-llm, but an MCP client should get "no package; see repo" instead of a clone command.
9. ~~**Make every claim on the site true.**~~ Done for the lines I flagged. The /agent transcript now shows real scores and real install commands. Leftover: `/?kind=mcp` still renders an empty page when reached directly.
10. ~~**Mobile nav.**~~ Done.
11. ~~**Data errors** (date-fns "NO LICENCE", skills inheriting 296k parent stars).~~ Done: date-fns now shows MIT, the superpowers skill page no longer shows a star count, and superpowers skills no longer show up in the redis-jobs or local-LLM results.

---

## First pass, 2026-10-11

Written 2026-10-11 against the local production build at http://localhost:3100 (755 entries, 12 with any votes). I used it as an outsider: a TypeScript and Python developer whose agent picks dependencies several times a week. I drove it in Chrome through Playwright, at desktop width and at 400px. I could not sign in on this machine, so everything I say about signed-in flows comes from what the pages show. I read the source only afterwards, to check three suspicions; those checks are marked.

## Verdict in three sentences

No, I would not come back next week. Every result I saw (over 150 rows across 18 searches and the directory) said "not enough data" for trust, so the product never gave me the one thing it promises, and search missed the obvious answer for half of my real queries while labelling unrelated repos "Good match". The writing and the scoring model are better than anything else in this space, but right now the site is a well-argued pitch sitting on top of an empty index and a placeholder search engine.

## First ten seconds

"Stars say it was popular. reppit says it still works." I got it immediately: a dependency picker that checks maintenance instead of stars, aimed at people whose agent installs things. That part works. The headline is the best thing on the site.

What came next, in order: "720 repos? That's tiny." Then I typed my first query and every row said **not enough data** where the score should be. The homepage's own proof point, "localstack has 65k stars and is archived. Its trust score knows", links to a page where the trust score says "not enough data", the same thing it says for drizzle and ws. Within about a minute the pitch had been contradicted by the product, and that is the moment I would close the tab.

## Search, query by query

"Hit" means something I would actually choose appears in the top three. The match label is the site's own ("Strong/Good/Partial match").

| Query (as I'd type it) | Top result | Would I pick #1? | Hit in top 3? | Note |
|---|---|---|---|---|
| parse pdf tables in python | opendataloader-project/opendataloader-pdf (Java) | No | Yes (docling, #2) | #1 is a Java project for a Python query; #3 is pdfcpu (Go). pdfplumber and camelot are not indexed. Stirling-PDF and pdfsam are apps, not libraries. |
| typescript orm for postgres | drizzle-team/drizzle-orm | Yes | Yes | Good answer. But #2 is gorm (Go) and swc and mybatis-plus show up in the top 8. |
| rate limit an express api | scalar/scalar | No | No | Scalar, Insomnia, Hasura, then a TikTok downloader and ShadowsocksX. Nothing about rate limiting. |
| run an llm locally | pathwaycom/llm-app | No | No | ollama/ollama and ggml-org/llama.cpp are both indexed and neither is in the top 9. This is the easiest question in the set. |
| validate env vars in node | nilbuild/developer-roadmap | No | No | A roadmap repo labelled "Good match". validator.js at #2 is the wrong tool. Nothing like envalid or t3-env. |
| websocket server for node | websockets/ws | Yes | Yes | Correct, labelled "Strong match". three.js is #2. |
| background jobs with redis in node | riverqueue/river (Go) | No | Yes (bullmq, #3) | Go and Ruby queues ranked above BullMQ for a Node query. |
| cli argument parsing in rust | tree-sitter/tree-sitter | No | No | tree-sitter, then a Claude skill-authoring skill. clap is not indexed. |
| http client for python async | aio-libs/aiohttp | Yes | Yes | Fine. axios (JS) at #2, reqwest (Rust) at #3. No httpx. |
| date library javascript | electron/electron | No | Yes (date-fns, #2) | Electron as the top date library. dayjs is #4. |
| react form validation | react-hook-form/react-hook-form | Yes | Yes | Best result of the session. llama.cpp shows up at #6. |
| markdown parser | erusev/parsedown (PHP) | No | Yes (marked, #3) | mybatis-plus (a Java ORM) at #2, labelled "Good match". |

Name lookups, which is how I'd check a library my agent just picked:

| Query | Result |
|---|---|
| `ollama` | ollama/ollama is #5, behind anthropics/skills and freeCodeCamp. |
| `llama.cpp` | Not in the top 3 (VS Code, a canvas-design skill, drizzle-orm), although it is indexed. |
| `zod`, `clap`, `envalid`, `pdfplumber`, `express-rate-limit` | Not indexed. Each still returned 30 "matches" (jgm/pandoc for express-rate-limit, sharkdp/bat for pdfplumber). |
| `asdkjh qwpoeiru` (keyboard mash) | 30 results, the first one TanStack/query labelled "Good match". |

**Hit rate: 8 of 12 problem queries had something I'd choose in the top three. Only 4 of 12 had it at #1. Of the 8 queries in the brief, 4 of 8 hit. Name lookups: 0 of 7 put the named package first.** It never once said "we don't have this".

Source check (afterwards): the server runs `EMBEDDING_PROVIDER=local`, which `packages/core/src/embeddings.ts` describes as a "deterministic hashed bag-of-words embedder for dev and tests". The match labels are fixed thresholds on that similarity (`search.ts:114`). That explains the keyboard-mash "Good match" and the Go/Java/PHP results: the production build is running the test embedder.

**The one-line reasons.** Nearly all of them read "Good match: actively maintained, NNk stars." The site says stars are not an input to trust, yet the reason line leads with stars on every row, and "actively maintained" is the only signal that varies. The match label can't be trusted (see above), so the line adds nothing. The one useful version I saw was "Strong match: low maintenance activity, 12k stars" on redux-form, and even that still ranked #4 for "react form validation".

**Would I trust the score?** There is no score to trust. Sorting by "Trust" gives the same order as sorting by relevance, because every row is null.

## What genuinely works

- **The headline and the framing.** "A star is a bookmark. Nobody goes back and unstars the dead ones" is true and it lands. The 30-second-decision framing for agent-picked dependencies is the right pitch to me.
- **The six-signal table on item pages.** Showing the signal, what was observed and the points, with "unknown, counts 7.5/15" spelled out, is clearer than any health badge I've used. "Unknown means we could not measure it, not that it passed" is the right rule.
- **Refusing to make up a number** is the right instinct. It only reads as useless because it happens 100% of the time (see below).
- **The trust explainer (/trust)** is short, concrete and complete: the thresholds per signal, the archived cap, how unknowns are counted, the ±12 cap on votes, and that stars and licence are not inputs. I read all of it, which I almost never do.
- **Downvotes need a reason.** The Submit button stays disabled until you pick one of the five reasons, and then it reads "Submit downvote: unmaintained". That's good design, and the five reasons are the right five.
- **Signed-out voting is handled cleanly.** Clicking "It works as described" while signed out shows "Sign in to vote" inline, with no redirect and no lost page.
- **Badges for the decisive facts.** ARCHIVED, INACTIVE, LICENCE UNCLEAR and NO LICENCE appear as tags next to the name, where I'd look.
- **It's fast.** Searches came back in well under 100ms.
- **The mobile layout holds** at 400px with no horizontal scroll on home, search or item pages.
- **The agent compatibility table is honest.** "Unknown is an honest answer. It is not the same as 'works'" is correct. Nobody else is collecting per-agent reports, and that is a real differentiator once it has data.

## What would make me leave

Ranked by how likely each one is to lose someone like me, most likely first.

1. **Every trust score is "not enough data".** Out of more than 150 rows across search, directory views and seven item pages, I saw zero numeric scores. That includes the archived repo the homepage holds up as the example. The product's only claim is that it tells you whether something still works, and for every entry it says it doesn't know. Once I see that, there's no reason to come back.
2. **Search returns confident nonsense.** A Java repo for a Python question, Electron as a date library, a roadmap repo for env validation, "Good match" on keyboard mash. One "Good match" that is obviously wrong teaches me to ignore every label. Search also never says "not indexed", so I can't tell a miss from a gap.
3. **The install line tells my agent to `git clone` libraries that are on npm and PyPI.** drizzle-orm, ws, react, docling and localstack all say "No published package was found that points back at this repo, so this clones the source." That's false for every one of them. If my agent follows this via MCP, it vendors source into my project instead of running `npm i drizzle-orm`. That's worse than not having the tool.
4. **The MCP server can't be installed.** `npm view reppit-mcp` and `npm view reppit` both return 404. The command on the homepage, the item pages and /agent fails. An unregistered name behind `npx -y` is also a squatting risk: anyone who registers `reppit-mcp` first gets code execution on every machine that copies that line.
5. **The index is small and the obvious answers are missing.** No zod, clap, envalid, pdfplumber, express-rate-limit or httpx. With 755 entries, most of my real queries are misses before ranking even starts. "MCP servers" has its own tab and footer link and contains zero entries.
6. **Data errors on projects I know.** date-fns shows "NO LICENCE" (it's MIT). Skills inherit the parent repo's stars, so every obra/superpowers skill shows "296k stars" and floods unrelated results ("finishing-a-development-branch" in "run an llm locally" and "background jobs with redis"). Once I've caught two wrong facts on projects I know, I stop believing the ones I can't check.
7. **The /agent demo shows the product failing.** The showcase terminal transcript returns three results, all "trust n/a", all `git clone`, and one of them (pdfsam) is a desktop app, not a library. It's the page that's meant to sell the MCP server.
8. **Copy that the product contradicts.** "A score that works on day one". "It gets a trust score as soon as it is indexed" (on /submit). "When one is submitted it shows up here with a trust score straight away". "Its trust score knows" (about localstack). Each one is false on this build, and a skeptic will find that within a minute.

Smaller things: mobile has no nav to Trust score or In your agent (only the footer links). The /agent terminal block is cut off at 400px. Signed-out users can fill in the whole downvote form before being told to sign in. The MCP tool list includes `vote` and `install_skill`, which makes me want to know exactly what an agent can do under my account before I add it. The page doesn't say.

## Does it serve the need?

The promise is "stars say a repo was popular once; reppit says whether it still works." Today it does not deliver on that for me.

- **It doesn't say whether things still work.** It says "not enough data" for all of them. Of the six signals, only last push and archived are ever measured. Releases, deprecated, advisories and issue load are unknown everywhere, so every entry has 4 unknowns and the 2-unknown limit hides the number. In practice the real output is "last push N days ago", which GitHub shows on the repo page.
- **It doesn't call out the dead ones, which is the whole point.** localstack (archived) and redux-form (last push 2 years ago, 0/25 on push) get the same headline as drizzle. The explainer says "An archived or deprecated project is capped at 25, whatever else it measures", but the code checks for not-enough-data before it applies the cap (`packages/core/src/trust.ts:164-166`), so the archived cap never shows. A known fatal signal should beat unknowns. "Archived: do not use" doesn't need four more measurements. The INACTIVE and ARCHIVED tags are the only place the product delivers on its claim today, and they aren't in the score.
- **Does the trust panel tell me anything GitHub doesn't?** Not yet. Last push and the archived flag are on GitHub already. Deprecation, open advisories against the latest published version, and per-agent compatibility would be new information, and all three are empty. Source check: `apps/web/scripts/signals.ts` exists to fill package, deprecation and advisory data from npm, PyPI, crates.io and OSV, with no GitHub token required, and it looks like it has never been run against this database. Even when it runs, it only matches a package if the registry links back to the repo and the manifest sits at the repo root. That misses monorepos like drizzle-orm (whose package lives in a subfolder) unless aliases are added.
- **Is "not enough data" honest or useless?** Honest per item, useless overall. On one page it's admirable. On every page it means the product has nothing to say. The honesty only means something if most entries do get a number.
- **"Reppit says whether it still works", via the agent.** The agent path is the main channel according to /agent, and right now it would hand my agent a `git clone` command and "trust n/a", if the package even installed, which it doesn't.

The model is right and the copy is right, but the data pipeline and the search are not running, so the claim has nothing behind it.

## Fix before launch

### Must fix before anyone sees it

1. **Run the signal enrichment and fix package resolution so most entries get a number.** Run `scripts/signals.ts` and the GitHub-backed release and issue ingest across the whole index. Resolve packages in monorepos (search `packages/*/package.json` and well-known subpaths, and use the registry's `repository.directory`) so drizzle, ws, react and localstack get their npm and PyPI names. Target: at least 80% of entries showing a numeric score. *Why:* this is the product. Without it every page says "not enough data" and the core promise is false. *Size:* medium (the code exists; it needs running, a monorepo fix and a GitHub token budget).
2. **Switch the production embedder to a real one, and add exact-name matching and a relevance floor.** Use OpenAI or Voyage, which are already implemented. Put an exact or prefix match on owner/name or package name at #1 (`ollama`, `llama.cpp`). Drop results below a similarity floor and show "Not indexed. Submit it?" instead of 30 fake matches. Make the "Strong/Good/Partial" labels mean something or remove them. *Why:* search is the front door, and confident nonsense destroys trust faster than an empty result. *Size:* small for the embedder switch and re-embed; medium for name matching and calibrating the floor.
3. **Let archived or deprecated override "not enough data".** If a fatal signal is known, show the capped score (or a hard "Archived" verdict) whatever the unknowns, as /trust already promises. *Why:* the homepage's flagship example is broken, and "tell me if it's dead" is the most valuable answer the product can give. *Size:* small (reorder two lines in `trust.ts` and update tests and copy).
4. **Never tell anyone to `git clone` a library.** Once packages resolve, show `npm i` / `pip install` / `cargo add`. If a package can't be verified, show the GitHub link and "package not verified" rather than a clone command, in the MCP output especially. *Why:* through MCP this is an instruction to an agent, and the wrong instruction does real damage. *Size:* small once #1 is done.
5. **Publish `reppit-mcp` and `reppit` to npm (or reserve the names) before the commands appear anywhere public.** Say plainly on /agent what each tool can do, especially `vote` and `install_skill`: whether they need my approval and what scopes they use. *Why:* the main channel currently 404s, and an unclaimed `npx -y` name is a supply-chain hole for a product about dependency trust. *Size:* small to medium.
6. **Make every claim on the site true on the day it ships.** Remove or correct "works on day one", "gets a trust score as soon as it is indexed", the localstack line (until #3 lands), and the empty MCP servers tab (hide it until it has entries). Re-record the /agent transcript once 1-4 are done. *Why:* the audience is skeptical, and every false line costs credibility the scoring model then has to earn back. *Size:* small.

### Fix in the first two weeks

7. **Seed the index with the obvious answers.** Take the top few hundred npm, PyPI and crates.io packages by downloads, plus the usual "how do I X" picks (zod, clap, httpx, pdfplumber, express-rate-limit, envalid). *Why:* 755 hand-picked repos miss half of everyday queries. *Size:* medium.
8. **Fix the data errors that undermine trust.** Map GitHub's NOASSERTION licence to "unclear" rather than "NO LICENCE" (date-fns). Don't give skills their parent repo's star count, or label it "in a 296k-star repo", and stop skills crowding out libraries in repo-shaped queries. *Size:* small.
9. **Rewrite the one-line reason to carry the decision, not the stars.** For example "release 3 weeks ago, no open advisories, npm: drizzle-orm" or "archived 7 months ago". Language mismatches should be penalised or filtered: a Python query shouldn't return Java and Go at #1. *Size:* small for the copy; medium for the language filter.
10. **Seed agent-compatibility reports and votes from the team's own real use, attributed.** Add mobile nav to /trust and /agent, and put sign-in before the downvote form for signed-out users. *Why:* the agent-compat column is the one thing nobody else has, and it's empty everywhere. A few dozen honest reports on the 50 most-searched entries would make it real. *Size:* medium (mostly time, not code).
