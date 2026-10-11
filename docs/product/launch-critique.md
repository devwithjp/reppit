# reppit launch critique

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
