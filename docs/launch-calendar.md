# reppit launch calendar

Written 2026-10-12. Runs from Tuesday 13 October to Tuesday 17 November 2026.

## Editor's pass, 2026-10-12

**Average post score: 7.21 before (62 posts), 8.87 after (58 posts).** Lowest post after: 8.0.
45 of the 62 posts scored under 8. Every one was rewritten, merged or replaced. Posts already at
8 or more were left alone. Each post is scored on hook, makes sense to a stranger, makes them
follow or click, and sounds like a person. The full scorecard is at the end of this file.

| The plan as a whole | Before | After |
|---|---|---|
| Pacing | 6 | 8.5 |
| Arc: problem, then intrigue, then launch | 6.5 | 8.5 |
| Launch-day pull | 5.5 | 8.5 |

**Act today.** Slots 1 to 8 changed. The desk posts only what is in `docs/tweets.md` and
`bip/queue.json`, and day 1 goes out tomorrow, 13 October. Copy the new text for slots 1 to 8
into `tweets.md` and re-queue before you approve anything. Until you do, `tweets.md` wins and the
old text goes out.

**The five biggest changes**

1. **Days 2 and 3 now open on a hook, not a recap.** "Yesterday I showed..." and "So far: ..."
   lose every stranger in the first line. Day 2 now opens on 230 new repos a minute. Day 3 opens on
   "Blaming AI would be easy. It would also be wrong." Day 1 now opens on the moment itself: your
   agent picked a library, and neither of you knows if it still works.
2. **No more reruns in week 2.** All five standalones repeated a thread from the same week. Two are
   replaced with new ideas. "A GitHub star can only go up" sets up the downvote rule without naming
   it. "Fake stars are not the problem" takes on a popular view using our own numbers (4.53M is
   0.74% of 610M), which is good for replies. Day 1 also had three posts on one study. They are now
   two.
3. **The intrigue phase gets a win.** Slots 10, 11, 12 and 13 were four "my search is bad" posts in
   a row. That builds trust, but it also tells people not to bother coming on launch day. The new
   slot 11 shows the product doing what the problem phase promised. The library you'd pick from
   memory comes third with a 35 and "no push in over a year". The library is never named.
4. **Launch day is rebuilt for clicks.** Post 1 opened "reppit is up" and gave away the rule that
   post 2 was meant to reveal. It now leads with the claim, says "Link in the reply", and saves the
   rule as the payoff for the day 3 promise. The link is now in two places: the reply to post 1 and
   the last post of the thread. A new quote post at 17:00 ET shares live numbers, so launch day has
   a second touch. The thread's ask is now "Reply with a search it gets wrong," which brings in
   replies.
5. **Every post a stranger might see first now stands alone.** Slot 14 started with "Three weeks ago I said..." and
   slot 17 started with a number that might be small. Both now open with a claim. Bare-number hooks
   ("9 of 25.", "45 of 170") are gone. Threads end on an open loop ("Tomorrow: ...") instead of
   just stopping.

**Cut or moved**

- Day 1, old post 5 (rho 0.10 on its own): merged into the 50,034-star post and the ranking post.
  `f10-the-cloud.png` is now spare, for a reply.
- Day 2, old post 1 (the recap): cut. Old post 2 (the 2017 caveat) is rewritten as post 5. Old
  post 7 (the 7% figure) is merged into the 93% post.
- Day 3, old post 1 (the recap): replaced by a hook.
- Slot 5, "On the weakest signal": cut. It repeated day 1 post 7 four days later. Replaced.
- Slot 8, "On the number that got better": cut. It repeated day 3 post 4 a week later. Replaced.
- Slot 11, "45 of 170 had no score": moved out. That point is now in launch post 4. Its figure,
  `unknown-is-not-a-pass.png`, is spare for the first reply that asks "why no score?".
- Slots 13, 18 and 20 each lose one post through merges. Thread count: 5, 5, 5 became 4, 4, 4.

**Before posting, check:** `quickxml-parse` (shown in f1) is not a real package on npm or PyPI.
If it is, redraw f1 with a name that isn't. The post text no longer names it.

---

**Launch day: Tuesday 10 November 2026.** That gives four weeks to clear the three blockers in
`docs/product/launch-critique.md` (fifth pass), and it puts launch on a Tuesday, which suits X and
Show HN alike. There is a go/no-go check on Thursday 5 November, before any post names the date.

## How to read this

- **Nothing has been posted or approved.** `bip/queue.json` has 8 slots from 13 to 22 October, all
  `"approved": false`, and `posted` is empty. Those 8 slots are the problem phase below. **The
  editor's pass changed their text**, so this file and `docs/tweets.md` now differ. Copy slots 1
  to 8 from here into `tweets.md`, re-queue, then approve. If the two still differ at post time,
  `tweets.md` wins.
- **Everything after 22 October is new text.** The desk only posts what is in `docs/tweets.md`, so
  each new post has to be copied there and queued by the user before it can go out. This file is
  the plan, not the queue.
- **Posts and tweets.** "The first 20 posts" counts tweets, threads included. The problem phase
  threads are now 6 + 7 + 8 = 21 tweets, and the first one to name reppit is tweet 21. Nothing
  before it mentions the product.
- **Pace.** 21 slots in 5 weeks, 3 to 4 a week. Launch week is the busiest: 4 slots in 4 days,
  plus the launch-evening quote post.
- **Numbers.** Every number is from `docs/product/the-case.md`, `docs/product/launch-critique.md`,
  `docs/product/feature-list.md`, `docs/brand/positioning.md` or a figure already in
  `docs/figures/`. A number we do not have yet is written `[MEASURE: what]`. Fill it on the day
  from the real source, or cut the line. Never round up, never guess.
- **Names.** No real package is named as bad, stale or doubtful (`bip/CLAUDE.md` rule 5). Setback
  posts describe our search being wrong, not someone's library. Slot 11 describes a stale result
  without naming it. Do not name it in replies either.
- **Links.** Never in post 1 of anything. The link goes in a reply to post 1, and on launch day
  also in the last post of the thread, where it costs no reach and catches people who read to the
  end.
- **Images.** Paths are in `docs/screenshots/` (the PNGs the desk uploads). New hand-drawn figures
  are specified in `docs/figures/TODO-<name>.md` and should be drawn in the f-series style and
  rendered to `docs/screenshots/<name>.png`. Two images are real screenshots of the site, also
  specified as TODO files. "No image" is a choice: short text lines read faster without one.

## Times

Slots aim at 08:00 US Eastern with an irregular jitter of up to about 15 minutes. The desk sets the
exact minute with its randomised `post_at_utc`; the minutes below are suggestions for new slots.

US clocks go back on **Sunday 1 November**. Sydney does not change.

| Period | 08:00 ET is | In Sydney |
|---|---|---|
| Until 31 Oct (EDT, UTC-4) | 12:00 UTC | 23:00 the same day |
| From 1 Nov (EST, UTC-5) | 13:00 UTC | 00:00 the next day |

From 1 November every slot is around midnight in Sydney. The first hour of replies matters most
(`bip/learnings.md`), so plan to be up until about 01:00 Sydney on post days, and later on launch
night. The launch-evening quote post (17:00 ET) is 09:00 Wednesday in Sydney.

## Go/no-go, Thursday 5 November

Launch on 10 November only if all of these hold. If any fails, move everything from 6 November on by
exactly one week (launch Tuesday 17 November) and change the date in the 6 November post.

1. Fresh-query test on 10 new problems: most uncovered problems say "Not in the index yet" instead
   of guessing (fifth pass: 3 of 7 did).
2. The index is seeded from each registry's most downloaded packages (fifth pass blocker 1).
3. The four leftover skill compatibility reports are cleared or labelled as the team's own test runs.
4. `reppit-mcp` and `reppit` are published on npm, and the /agent page commands match them.
5. Sign-in, voting and the token page work end to end on the production site. No critique pass has
   been able to test these yet.

## At a glance

| # | Date | ET | Sydney | Phase | Format | Goal |
|---|---|---|---|---|---|---|
| 1 | Tue 13 Oct | 08:00 | 23:00 Tue | Problem | Thread, 6 | Follows |
| 2 | Wed 14 Oct | 08:00 | 23:00 Wed | Problem | Thread, 7 | Follows |
| 3 | Thu 15 Oct | 08:00 | 23:00 Thu | Problem | Thread, 8 | Follows |
| 4 | Fri 16 Oct | 08:00 | 23:00 Fri | Problem | Single | Follows |
| 5 | Mon 19 Oct | 08:00 | 23:00 Mon | Problem | Single (new) | Replies |
| 6 | Tue 20 Oct | 08:00 | 23:00 Tue | Problem | Single | Replies |
| 7 | Wed 21 Oct | 08:00 | 23:00 Wed | Problem | Single | Follows |
| 8 | Thu 22 Oct | 08:00 | 23:00 Thu | Problem | Single (new) | Replies |
| 9 | Mon 26 Oct | 07:52 | 22:52 Mon | Intrigue | Single | Follows |
| 10 | Wed 28 Oct | 08:09 | 23:09 Wed | Intrigue | Thread, 5 | Replies |
| 11 | Fri 30 Oct | 07:56 | 22:56 Fri | Intrigue | Single (new) | Follows |
| 12 | Mon 2 Nov | 08:04 | 00:04 Tue | Intrigue | Single | Replies |
| 13 | Wed 4 Nov | 07:49 | 23:49 Wed | Intrigue | Thread, 4 | Replies |
| 14 | Fri 6 Nov | 08:13 | 00:13 Sat | Intrigue | Single | Follows |
| 15 | Mon 9 Nov | 07:58 | 23:58 Mon | Launch week | Single | Follows |
| 16 | **Tue 10 Nov** | 08:02 | 00:02 Wed | **Launch** | Thread, 6 + link reply, pinned | Launch clicks |
| 16b | **Tue 10 Nov** | 17:00 | 09:00 Wed | **Launch** | Quote post of 16 | Clicks, replies |
| 17 | Thu 12 Nov | 08:07 | 00:07 Fri | Launch week | Single + link reply | Launch clicks |
| 18 | Fri 13 Nov | 07:51 | 23:51 Fri | Post-launch | Thread, 4 | Follows |
| 19 | Mon 16 Nov | 08:11 | 00:11 Tue | Post-launch | Single | Replies |
| 20 | Tue 17 Nov | 07:54 | 23:54 Tue | Post-launch | Thread, 4 | Follows |

Slots 1 to 8 keep the times already in `bip/queue.json`; the desk adds its own jitter on approval.

---

# Phase 1: the problem (13 to 22 October)

Queued slots, new text. This phase covers the problem and why it matters, nothing else: stars lie,
the pile is too big for any person, agents pick using the weak number, and nobody curates. No
product until the last tweet of day 3, and even that only names it. These are the first 21 tweets.

## 1. Tuesday 13 October: day 1 thread

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `day-1`.
- **Format:** thread of 6. A scene, then the evidence, one post per idea. Ends on a loop to day 2.
- **Goal:** follows. **CTA:** none in the text. The follow comes from "Tomorrow: ...".

> Your coding agent just picked a library for you.
>
> You said sure.
>
> Neither of you knows if it still works. It saw the name a lot in training, so it said the name.

Image: `docs/screenshots/f1-the-moment.png`

> So you check the one number everyone checks.
>
> 12,000 stars. Fine. Good enough.
>
> That is the whole quality bar for code you are about to ship to other people.

Image: `docs/screenshots/f2-the-only-check.png`

> Here is what a star actually is.
>
> 2019: someone sees a link on a lunch break and clicks a button.
> 2021: the project stops getting commits.
> 2026: the star is still there.
>
> Nobody goes back and un-stars a dead repo.

Image: `docs/screenshots/f3-what-a-star-is.png`

> So you get pairs like this.
>
> 40,000 stars, archived, last commit 2023.
> 300 stars, updated Tuesday, maintainer replies in a day.
>
> The first one wins every search box you own, and every suggestion your agent makes.

Image: `docs/screenshots/f4-the-mismatch.png`

> This part is measured, not a hunch.
>
> A 2020 study scored GitHub projects on how actively they were maintained. One had 50,034 stars and a maintenance score of 8 out of 100.
>
> Fifty thousand people said nice. Almost nobody was fixing anything.

Image: `docs/screenshots/f11-fifty-thousand-stars.png`

> The same study checked how closely each signal tracks maintenance.
>
> Contributors: 0.44.
> Size: 0.38.
> Stars: 0.10. Their word: "very weak."
>
> The number we all look at came last.
>
> Tomorrow: how big the pile has gotten.

Image: `docs/screenshots/f12-weakest-signal.png`


## 2. Wednesday 14 October: day 2 thread

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `day-2`.
- **Format:** thread of 7. Scale, decay, then what changed. Ends on a loop to day 3.
- **Goal:** follows. **CTA:** the reply under post 1, "Day 1 is here:" and the link.

> GitHub gets about 230 new repos a minute.
>
> Review one a minute, no sleep, no weekends, and you fall 229 further behind. Every minute.
>
> That is the pile your next dependency comes out of.

Image: `docs/screenshots/f14-repos-per-minute.png`

> The package registries, counted this month:
>
> npm: 4,464,731.
> PyPI: 907,001.
> crates.io: 347,256.
>
> There is no version of "I'll have a quick look around" that covers that.

Image: `docs/screenshots/f15-three-registries.png`

> And nobody is curating it.
>
> No editor. No shelf. No buyer deciding what gets stocked.
>
> The awesome-list in your bookmarks was kept by one person who got busy. Hand curation lost. Nothing replaced it.

no image

> It is already inside your code.
>
> An audit of 947 commercial codebases: 93% had a component nobody had worked on in two years. Only 7% of components in use were the latest version.
>
> You did not abandon it. It was abandoned under you.

Image: `docs/screenshots/f16-zombie-bar.png`

> None of this is new.
>
> The study that found stars don't track upkeep used GitHub data from November 2017.
>
> Stars never measured this. We kept using them because the number was already on the screen.

Image: `docs/screenshots/f13-never-worked.png`

> Here is the thing that actually changed, and it is not the amount of code.
>
> Picking a dependency used to cost a human five minutes of looking around.
>
> Your agent picks in two seconds, off the same weak number, and cannot tell that it is weak.

Image: `docs/screenshots/f17-five-minutes-two-seconds.png`

> Tomorrow I argue against my own case.
>
> AI is the easy villain here. The numbers don't back that up, and I'll show you which ones.

no image


## 3. Thursday 15 October: day 3 thread

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `day-3`.
- **Format:** thread of 8. Three concessions in a row only work together.
- **Goal:** follows (the last post is the hook). **CTA:** "Follow if you want to see it first."
  The reply under post 1 is "Day 2 is here:" and the link.

> Blaming AI for the state of open source would be easy.
>
> It would also be wrong.
>
> Three numbers against my own case. Then the part I can't stop thinking about.

no image

> GitHub's public repo growth, year on year: +22%, then about +17%, then +19%.
>
> AI coding tools went from niche to everywhere in that window.
>
> The line did not bend.

Image: `docs/screenshots/f18-the-flat-line.png`

> Copies are not new either.
>
> A 2017 study of 428 million files found 70% of the files on GitHub were copies of files that already existed.
>
> The pile was mostly copies before any of this started.

Image: `docs/screenshots/f19-clones-before-ai.png`

> One more against my own case.
>
> A 2025 study found 19.7% of packages suggested by models did not exist. That is the number everyone still quotes.
>
> A 2026 rerun on current models: 4.6% to 6.1%. It got better. Use the new one.

Image: `docs/screenshots/f20-the-number-that-got-better.png`

> So this is the spot developers are standing in.
>
> 83% use AI tools. 73% of assistant users use them every day.
>
> 6.6% would trust the output for an important decision.
>
> We use it constantly. We believe it almost never.

Image: `docs/screenshots/f21-use-vs-trust.png`

> That gap is not people being irrational. It is people being right.
>
> The tool is fast, often correct, and cannot tell you which time this is. So you check.
>
> And for a library, the check is a star count.

no image

> Which leaves three questions, and no quick way to answer any of them.
>
> Does it still work?
> Did it break for anyone?
> Does it work in my setup?
>
> They are not hard questions. There is just nowhere to look them up.

Image: `docs/screenshots/f5-what-you-want.png`

> I'm building the place where those three have answers.
>
> It has one rule. The rule is one sentence long, and it fixes most of what this thread is about.
>
> I'll show it the day reppit launches. Follow if you want to see it first.

no image


## 4. Friday 16 October: "On stars"

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `standalone-1`.
- **Format:** single. One idea, quotable without the thread.
- **Goal:** follows from people who missed the threads. **CTA:** none; the line is the share.

> A GitHub star is a bookmark someone made once, maybe in 2019, possibly on a phone, about a project that has since died.
>
> We rank the software supply chain on that.

Image: `docs/screenshots/f3-what-a-star-is.png`


## 5. Monday 19 October: "On stars only going up" (new)

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `standalone-2`, new text.
- **Format:** single, no image. A new idea, not a rerun. It sets up the downvote rule without
  naming it, so launch post 2 pays it off.
- **Goal:** replies ("there should be a button for that"). **CTA:** none.

> A GitHub star can only go up.
>
> There is no button for "this broke my build." No button for "the maintainer left."
>
> So every repo shows the best thing anyone ever thought about it.

no image


## 6. Tuesday 20 October: "On the cost"

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `standalone-3`.
- **Format:** single. No number, so it should travel as a feeling.
- **Goal:** replies ("this happened to me"). **CTA:** none.

> Being wrong about a library costs you a week. Sometimes a rewrite.
>
> The check we run before taking that risk is reading a number that someone clicked in 2019 and never thought about again.
>
> That is the entire system.

no image


## 7. Wednesday 21 October: "On zombies"

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `standalone-4`.
- **Format:** single. The strongest audited number, alone. It reruns day 2 on purpose, because it
  is the post most likely to travel.
- **Goal:** follows. **CTA:** none.

> 93% of commercial codebases contain a component with nobody developing it for two years.
>
> Nobody picked a dead dependency. They picked a live one, and then nothing told them.

Image: `docs/screenshots/f16-zombie-bar.png`


## 8. Thursday 22 October: "On fake stars" (new)

- **Slot:** 08:00 ET / 23:00 Sydney. Queue slot `standalone-5`, new text.
- **Format:** single, no image. It argues against a popular take and does the division
  out loud before a fact-checker can. Source: He et al., in `the-case.md`. It closes the phase on
  "never expire", which sets up launch post 3 (old praise expires).
- **Goal:** replies. **CTA:** none.

> Everyone worries about fake GitHub stars.
>
> One study found 4.53 million suspected fakes. Sounds huge. It is 0.74% of the 610 million stars in the same data.
>
> Fake stars are not the problem.
> Real ones that never expire are.

no image


Of the three "Later: product posts" at the bottom of `tweets.md`, none is scheduled as written.
"On day one" says issue load is a signal, and issue load is not measured yet, so it is rewritten as
slot 9. "On the reason tag" reveals the one rule that day 3 promised for launch day, so it moves into
the launch thread (slot 16, post 2). "On old praise" becomes launch thread post 3.

---

# Phase 2: intrigue (26 October to 6 November)

Show the work, not the product. Real test numbers, real misses, one real win, and the rule kept
back for launch. Each post should make someone want to see the thing, and trust that it will not
oversell itself. The order goes win, loss, win, loss, so readers get reasons to come back and
reasons to believe it.

## 9. Monday 26 October: a repo tells on itself

- **Slot:** 07:52 ET / 22:52 Monday Sydney.
- **Format:** single. A list of six reads as one picture. First post to name reppit as a single,
  so it says what reppit is.
- **Goal:** follows. **CTA:** none; "Issue load is next" is the open loop.

> A repo tells on itself.
>
> Last push. Release pace. Archived or not. Open security advisories. Issue load. License.
>
> None of that needs anyone's opinion. The directory I'm building, reppit, reads five of the six before a single vote. Issue load is next.

Image: `docs/screenshots/six-signals.png` (spec: `docs/figures/TODO-six-signals.md`)

## 10. Wednesday 28 October: weekly progress, week 1

- **Slot:** 08:09 ET / 23:09 Wednesday Sydney.
- **Format:** thread of 5. A progress log needs a before, an after, and the catch.
- **Goal:** replies. **CTA:** "Reply with a problem you searched for last week. I'll run it."

> A test you write yourself will pass eventually.
>
> I built a search for picking libraries and tested it on 12 real problems. First run: the library I'd pick came first 4 times. Now: 12 of 12.
>
> So I gave it 15 problems it had never seen.

Image: `docs/screenshots/twelve-queries.png` (spec: `docs/figures/TODO-twelve-queries.md`)

> 6 of 15 had something I'd pick in the top three.
>
> Most of the jump from 4 to 12 came from adding the exact libraries the test asked for.
>
> That is teaching to the test.

no image

> The misses were not close calls.
>
> When the right library wasn't in the index, the search answered anyway. Sure of itself. With a score next to it.
>
> A wrong answer with a number on it is worse than no answer.

no image

> The fix is boring.
>
> More libraries: the index went from 755 entries to 2,226.
>
> And a page that says "Not in the index yet" instead of guessing. "I don't know" is a real answer.

no image

> I'll post the next test whether the number goes up or down.
>
> Reply with a problem you searched for last week. I'll run it and show you what came back, good or bad.

no image

## 11. Friday 30 October: from memory (new)

- **Slot:** 07:56 ET / 22:56 Friday Sydney.
- **Format:** single, no image. A real win, told as a story. A screenshot would name the stale
  library, so there is none.
- **Goal:** follows. **CTA:** none.
- **Before posting:** rerun "oauth login for express" on production that morning. Post only if the
  stale result still shows 35 and "no push in over a year" in third place. If not, use another real
  case from the critique with the same shape, such as a library with "last release 5 years ago"
  ranked below a maintained one, still unnamed. Never name the stale library, in the post or in
  replies.

> I typed "oauth login for express" into my own search.
>
> The library I'd have picked from memory came third. Score 35. The note next to it: "no push in over a year."
>
> My memory runs on star counts. The search runs on what the repo is doing now.

no image

## 12. Monday 2 November: the comic book reader

- **Slot:** 08:04 ET / 00:04 Tuesday Sydney (first slot after the clocks change).
- **Format:** single. A setback is one story; a thread would dilute it.
- **Goal:** replies. **CTA:** none; people will offer their own worst search result.

> I asked my own search for self-hosted feature flags. Its second answer was a comic book reader.
>
> The index had no feature flag tool, so it grabbed the nearest thing and sounded sure.
>
> Of 7 problems it can't answer yet, 3 now say so. 4 still guess. Those 4 are this week.

Image: `docs/screenshots/comic-reader.png` (spec: `docs/figures/TODO-comic-reader.md`)

## 13. Wednesday 4 November: weekly progress, week 2

- **Slot:** 07:49 ET / 23:49 Wednesday Sydney.
- **Format:** thread of 4. The diagnosis, what was missing, the fix, and one more admission.
- **Goal:** replies. **CTA:** "Reply with the first library you'd look up. If it's missing, it goes
  in." It sits on the fix post, where it belongs.
- **If the registry seed hasn't landed by 4 November:** post 3 says it is running and when it will
  finish. Leave out both MEASURE lines. Do not fill them with estimates.

> My search is good at ranking and bad at knowing things.
>
> On 25 problems it had never seen, it found a good answer 9 times.
>
> When the right library was in the index, it came first. 3 out of 3 in the last test. When it wasn't, nothing else mattered.

Image: `docs/screenshots/missing-shelf.png` (spec: `docs/figures/TODO-missing-shelf.md`)

> What was missing was the obvious stuff. The libraries people type first.
>
> Data frames. CLI frameworks. Cloud SDKs. Slack clients.
>
> I had filled the index from GitHub topics. Nobody searches by topic.

no image

> The fix: start from what people actually install. The most downloaded packages on npm, PyPI, crates.io and Go.
>
> Index now: [MEASURE: entry count after the registry seed].
> 10 new problems: [MEASURE: picks in the top three, out of 10].
>
> Reply with the first library you'd look up. If it's missing, it goes in.

no image

> One more thing the test turned up. 67 of 125 scores were exactly 93.
>
> 93 is the ceiling while issue load isn't measured.
>
> So today 93 means "everything I could check is fine." Not "great."

Image: `docs/screenshots/the-93-wall.png` (spec: `docs/figures/TODO-the-93-wall.md`)

## 14. Friday 6 November: the date

Post only after a "go" on 5 November. On a "no-go", change the date to Tuesday, November 17.

- **Slot:** 08:13 ET / 00:13 Saturday Sydney.
- **Format:** single. One date, one promise. It works for someone who never saw day 3: it says
  what reppit is and why the rule matters, then teases the rule.
- **Goal:** follows. **CTA:** none; the date is the call.

> For a month I've argued that GitHub stars can't tell you if a repo still works.
>
> On Tuesday, November 10, I open reppit, a directory that ranks repos on whether they still do.
>
> It has one rule, one sentence long. It goes up that day.
>
> A hint: a number can't tell you why.

Image: `docs/screenshots/sealed-rule.png` (spec: `docs/figures/TODO-sealed-rule.md`)

---

# Phase 3: launch week (9 to 12 November)

## 15. Monday 9 November: what it won't do

- **Slot:** 07:58 ET / 23:58 Monday Sydney.
- **Format:** single. Limits stated before launch take the first critical reply off the table.
  Leading with "I don't know" is the hook, because no launch ever says it.
- **Goal:** follows. **CTA:** none.

> Tomorrow I open a repo directory that will often say "I don't know."
>
> On purpose. What it won't do yet:
>
> Cover all of GitHub. It has [MEASURE: index entry count on 9 Nov] entries.
> Answer everything.
> Use all six signals. Most scores use 3 to 5.
> Show agent reports. Those start at zero.

Image: `docs/screenshots/what-it-wont-do.png` (spec: `docs/figures/TODO-what-it-wont-do.md`)

## 16. Tuesday 10 November: LAUNCH

- **Slot:** 08:02 ET / 00:02 Wednesday Sydney. Show HN at 08:20 ET. Reddit the next morning (see
  the kit). Stay up for the first two hours of HN comments.
- **Format:** thread of 6, plus one reply holding the links. Post 1 works alone with a screenshot.
  It says "Link in the reply" so the reply gets the clicks. Pin the thread as soon as it is up.
- **Goal:** launch clicks. **CTA:** "Link in the reply" (post 1), "Reply with a search it gets
  wrong" (post 6).
- **Second touch:** slot 16b, a quote post at 17:00 ET with live numbers. See the kit.

The full thread is in the Launch day kit at the end of this file.

## 17. Thursday 12 November: the column nobody fills

- **Slot:** 08:07 ET / 00:07 Friday Sydney.
- **Format:** single, plus a reply with the link. Leads with the claim, not the count, so a small
  count can't sink the hook. If the count is under 10, cut the "[MEASURE] reports since Tuesday"
  sentence and keep "It started at zero on Tuesday."
- **Goal:** launch clicks. **CTA:** "File one. Link below." (link in the reply)

> Nobody has ever written down which libraries work in which coding agent.
>
> Not the README. Not the registry. Not the maintainer.
>
> reppit has a column for it now. [MEASURE: agent compatibility reports filed since launch] reports since Tuesday. It started at zero.
>
> Works or breaks in yours? File one. Link below.

Image: `docs/screenshots/f8-the-agent-grid.png`

Reply: "File one here: [LINK: reppit /agent page]"

---

# Phase 4: post-launch (13 to 17 November)

Real numbers, including the bad ones. Every bracket below gets filled from the database, the server
log or npm, or the line is cut.

## 18. Friday 13 November: the first 72 hours

- **Slot:** 07:51 ET / 23:51 Friday Sydney.
- **Format:** thread of 4. Launch numbers need room, and the misses get equal space.
- **Goal:** follows. **CTA:** none; the last line promises the next readout.

> Three days live. Every number, including the bad ones.
>
> [MEASURE: unique visitors in the first 72 hours] people opened reppit. They ran [MEASURE: searches in the first 72 hours] searches.
>
> The most searched problem: [MEASURE: top query].

Image: `docs/screenshots/first-72-hours.png` (spec: `docs/figures/TODO-first-72-hours.md`)

> [MEASURE: share of searches that ended in "Not in the index yet"] of searches ended in "Not in the index yet."
>
> Most common miss: [MEASURE: top query with no answer].
>
> Every miss is a library to add. [MEASURE: libraries added from launch misses] added since Tuesday.

no image

> Votes cast: [MEASURE: total votes].
>
> Downvotes with a reason: all of them. There is no other kind.
>
> Most used reason: [MEASURE: top reason tag and its count].

no image

> What broke: [MEASURE: the biggest launch bug, one line].
> What I changed: [MEASURE: the fix and the day it shipped].
>
> Next readout Tuesday. Good numbers or bad.

no image

## 19. Monday 16 November: the wrong language

Use only if the fix has shipped by then. If it has not, swap in the biggest real setback from launch
week, same shape: what it did, why, what changed.

- **Slot:** 08:11 ET / 00:11 Tuesday Sydney.
- **Format:** single. One mistake and one fix.
- **Goal:** replies. **CTA:** none.

> I asked reppit for JWT auth in FastAPI. It put a Go library first and a Java one second.
>
> FastAPI is Python. The search knew "python" when you typed it, not that a framework implies one.
>
> Fixed: [MEASURE: frameworks now mapped to a language, and the date it shipped].

Image: `docs/screenshots/wrong-language.png` (spec: `docs/figures/TODO-wrong-language.md`)

## 20. Tuesday 17 November: weekly progress, week one live

- **Slot:** 07:54 ET / 23:54 Tuesday Sydney.
- **Format:** thread of 4. The weekly readout, now with users in it.
- **Goal:** follows. **CTA:** "Reply with what you want next."

> One week of reppit. [MEASURE: people who ran a search in week one] people used it. [MEASURE: people who came back on a second day] came back on a second day.
>
> The second number is the one I watch.

Image: `docs/screenshots/week-one.png` (spec: `docs/figures/TODO-week-one.md`)

> Same test as five weeks ago: 10 problems the search had never seen.
>
> Then: 3 of 10.
> Now: [MEASURE: picks in the top three, out of 10 new problems].
>
> Same rules both times, so you can hold me to it.

no image

> [MEASURE: npm downloads of reppit-mcp and reppit in week one] installs of the MCP server and CLI.
>
> [MEASURE: share of searches that came from the MCP server or CLI] of searches came from an agent, not a person on the site.
>
> That is the number the whole idea rests on.

no image

> Got wrong this week: [MEASURE: the biggest miss, one line].
> Asked for most: [MEASURE: the most repeated request].
> Building next: [MEASURE: the one thing being built this week].
>
> Same post next Tuesday. Reply with what you want next.

no image

---

# Launch day kit

Honest limits that must appear somewhere in every launch piece, from the fifth critique pass:
the index is early and covers a few thousand repos; "Not in the index yet" is a real, common answer;
scores rest on 3 to 5 of 6 signals and issue load is not measured yet; agent reports start at zero.

## The X thread (Tuesday 10 November, 08:02 ET)

Post 1 carries the claim and the screenshot. Post 2 reveals the rule promised on day 3. Do not
mention the rule in post 1. Pin the thread.

> GitHub stars tell you a repo was popular once.
>
> reppit tells you if it still works. It is live today.
>
> Type the problem in plain words. Get the maintained library, the reason, and the install line.
>
> Link in the reply.

Image: `docs/screenshots/shot-launch-search.png` (spec: `docs/figures/TODO-shot-launch-search.md`)

> Last month I said it has one rule. Here it is:
>
> You can't downvote without saying why.
>
> Unmaintained. Insecure. Broken on an agent. Misleading. Low quality.
>
> A count is a mood. A reason is a decision.

Image: `docs/screenshots/f6-the-reason-tag.png`

> Old praise expires.
>
> Votes lose half their weight every six months. A library people loved in 2021 has to be loved again to keep its place.
>
> Code goes stale. Praise should too.

Image: `docs/screenshots/half-life.png` (spec: `docs/figures/TODO-half-life.md`)

> It works before anyone votes.
>
> Every repo is scored on six things the repo itself shows: last push, releases, archived, advisories, issue load, license.
>
> If too few can be measured, it shows no number. It says "too little measured." Unknown is not a pass.

Image: `docs/screenshots/shot-item-signals.png` (spec: `docs/figures/TODO-shot-item-signals.md`)

> Your agent can ask it too.
>
> There is an MCP server and a CLI. Without a token they only read. reppit never installs anything. It hands back the command.
>
> Your agent picks a dependency in two seconds. Now it can check first.

Image: `docs/screenshots/f9-the-loop.png`

> What it isn't, yet.
>
> The index is early. "Not in the index yet" is a common answer.
> Issue load isn't measured yet. Most scores use 3 to 5 of 6 signals.
> Agent reports start at zero today.
>
> Reply with a search it gets wrong. I'll fix it and post the fix.
>
> [LINK: reppit home]

no image (the link card shows)

Reply to post 1, right after the thread is up:

> Here it is: [LINK: reppit home]
>
> Type a problem, not a package name.
>
> For your agent: [LINK: reppit /agent page]

Also, once the thread is up, reply under the day 1 thread (13 October) with one line, "It's live:"
and a link to launch post 1. People who saved day 1 come back through it.

## 16b. The launch-evening quote post (Tuesday 10 November, 17:00 ET)

- **Slot:** 17:00 ET / 22:00 UTC / 09:00 Wednesday Sydney. Quote-post launch post 1, so the
  quote carries people back to the thread and its link reply.
- **Format:** single, no image, no link (the quoted post has it).
- **Goal:** a second wave of clicks, and replies from people who were asleep at 08:00. It also
  shows the "I'll post the fixes" promise being kept on day one.
- **Fill from the server log only.** If there is no clear top miss, use the second line for the
  most searched problem instead.

> Nine hours in.
>
> [MEASURE: searches since launch] searches so far.
> The most common miss: [MEASURE: top query that ended in "Not in the index yet"].
>
> That one goes in the index next. Keep them coming.

no image

## Show HN

**Title** (HN allows 80 characters; this is 70):

> Show HN: Reppit, a repo directory that ranks on maintenance, not stars

**URL:** [LINK: reppit home]

**First comment**, posted by me as soon as the submission is up:

> I'm a solo developer. reppit is a directory of GitHub repos and agent skills, ranked on what each project is doing now rather than on stars.
>
> Why: a 2020 study (Coelho et al., data from GitHub in 2017) found star count correlates with maintenance activity at Spearman rho 0.10. Total contributors was 0.44. Stars came last of what they tested. So this is not a new problem, but agents now pick dependencies in seconds off that same number.
>
> How it scores: six signals (last push, release cadence, archived/deprecated flags, open advisories, issue load, license). If too few can be measured, it shows "too little measured" instead of a number. Unknown is never counted as a pass. Votes can move a score by at most 12 points, every downvote needs one of five reason tags, and votes lose half their weight every six months.
>
> There is an MCP server and a CLI. Without a token they only read. Nothing installs anything; you get the command back.
>
> What it doesn't do well yet, plainly:
> - The index is about [MEASURE: index entry count on launch morning] entries. Many searches will say "Not in the index yet", and that is the honest answer.
> - Some phrase searches still return a weak match when the right library isn't indexed. I'm tracking those.
> - Most scores rest on 3 to 5 of the 6 signals. Issue load isn't measured yet, so many healthy repos sit at the same ceiling score.
> - Agent compatibility reports start at zero today.
>
> What I'd most like: a problem you searched for recently, and whether reppit found the right thing. Misses are the most useful reply.

## Reddit (Wednesday 11 November, about 08:30 ET)

r/programming removes most self-promotion, so read each sub's rules first. This shape suits
r/SideProject, r/opensource and the language subs that allow tool posts. Post in one or two, not ten.

**Title:**

> I built a repo directory that ranks on maintenance signals instead of stars. Here is what it still gets wrong.

**Body:**

> Stars tell you something was popular once. A 2020 study found they correlate with maintenance at rho 0.10, the weakest of every signal it tested.
>
> reppit scores repos and agent skills on last push, releases, archived/deprecated flags, advisories and license. If it can't measure enough, it says so and shows no number. Downvotes need a reason (unmaintained, insecure, broken on an agent, misleading, low quality), and old votes fade by half every six months. Your coding agent can query it read-only through an MCP server or CLI.
>
> What it gets wrong today: the index is small ([MEASURE: index entry count]), so "Not in the index yet" is common. Some searches still return a weak match instead of admitting a gap. Issue load isn't measured. Agent reports started at zero yesterday.
>
> Link: [LINK: reppit home]. I'd like to hear the searches it fails on.

---

# New images

Hand-drawn, f-series style. Specs live in `docs/figures/`:

| Spec file | Used in |
|---|---|
| `TODO-six-signals.md` | Slot 9 |
| `TODO-twelve-queries.md` | Slot 10, post 1 |
| `TODO-comic-reader.md` | Slot 12 |
| `TODO-missing-shelf.md` | Slot 13, post 1 |
| `TODO-the-93-wall.md` | Slot 13, post 4 |
| `TODO-sealed-rule.md` | Slot 14 |
| `TODO-what-it-wont-do.md` | Slot 15 |
| `TODO-half-life.md` | Launch thread, post 3 |
| `TODO-first-72-hours.md` | Slot 18, post 1 (numbers filled on the day) |
| `TODO-wrong-language.md` | Slot 19 |
| `TODO-week-one.md` | Slot 20, post 1 (numbers filled on the day) |
| `TODO-unknown-is-not-a-pass.md` | Spare: a reply to "why does this one have no score?" |

Real screenshots of the production site, not drawings:

| Spec file | Used in |
|---|---|
| `TODO-shot-launch-search.md` | Launch thread, post 1 |
| `TODO-shot-item-signals.md` | Launch thread, post 4 |

Existing figures reused: f1 to f5 and f11 to f21 in phase 1; `f8-the-agent-grid.png` in slot 17;
`f6-the-reason-tag.png` and `f9-the-loop.png` in the launch thread. Spares for replies:
`f10-the-cloud.png` (if someone asks for the full scatter behind rho 0.10) and
`f7-number-vs-sentence.png` (if someone asks why reasons beat counts).

---

# Scorecard

Each post is scored on four things, in this order: hook / stranger / follow or click / sounds
human. The number after "=" is the average. Post numbers are slot.post in the new plan. "From" is
the old post it came from. L = launch thread, LR = launch link reply. The "after" scores are an
editor's estimates. The real test is follows per impression, replies, and link clicks.

| Post | From | Before | After | Action |
|---|---|---|---|---|
| 1.1 | 1.1 | 6/7/7/8 = 7.00 | 10/9/9/9 = 9.25 | rewritten |
| 1.2 | 1.2 | 6/8/6/8 = 7.00 | 9/9/9/9 = 9.00 | rewritten |
| 1.3 | 1.3 | 8/9/8/9 = 8.50 | 8/9/8/9 = 8.50 | kept |
| 1.4 | 1.4 | 7/9/8/8 = 8.00 | 7/9/8/8 = 8.00 | kept |
| 1.5 | 1.5 + 1.6 | 6/6/7/7 = 6.50; 8/7/8/9 = 8.00 | 9/9/9/9 = 9.00 | merged |
| 1.6 | 1.7 | 7/7/7/8 = 7.25 | 9/8/10/9 = 9.00 | rewritten, adds a loop to day 2 |
| 2.1 | 2.3 | 8/9/8/8 = 8.25 | 10/9/9/9 = 9.25 | promoted to hook |
| 2.2 | 2.4 | 7/8/7/8 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 2.3 | 2.5 | 7/8/7/8 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 2.4 | 2.6 + 2.7 | 8/9/8/9 = 8.50; 6/7/6/8 = 6.75 | 9/10/9/9 = 9.25 | merged |
| 2.5 | 2.2 | 5/5/6/8 = 6.00 | 9/9/9/9 = 9.00 | rewritten for strangers |
| 2.6 | 2.8 | 8/8/9/8 = 8.25 | 8/8/9/8 = 8.25 | kept |
| 2.7 | new | n/a | 9/9/9/9 = 9.00 | loop to day 3 |
| 3.1 | 3.1 | 4/5/6/7 = 5.50 | 9/9/9/9 = 9.00 | recap replaced by a hook |
| 3.2 | 3.2 | 7/7/7/8 = 7.25 | 9/9/9/9 = 9.00 | tightened |
| 3.3 | 3.3 | 7/8/7/8 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 3.4 | 3.4 | 8/8/8/8 = 8.00 | 8/8/8/8 = 8.00 | kept |
| 3.5 | 3.5 | 8/9/8/9 = 8.50 | 8/9/8/9 = 8.50 | kept |
| 3.6 | 3.6 | 7/6/7/8 = 7.00 | 9/9/9/9 = 9.00 | "See above" removed |
| 3.7 | 3.7 | 7/9/8/8 = 8.00 | 7/9/8/8 = 8.00 | kept |
| 3.8 | 3.8 | 7/7/8/8 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 4 | 4 | 9/9/7/8 = 8.25 | 9/9/7/8 = 8.25 | kept |
| 5 | new | 6/7/6/7 = 6.50 (old 5, cut) | 10/9/9/9 = 9.25 | new idea replaces a rerun |
| 6 | 6 | 8/9/7/9 = 8.25 | 8/9/7/9 = 8.25 | kept |
| 7 | 7 | 9/9/8/9 = 8.75 | 9/9/8/9 = 8.75 | kept |
| 8 | new | 8/7/6/8 = 7.25 (old 8, cut) | 9/9/9/9 = 9.00 | new idea replaces a rerun |
| 9 | 9 | 6/7/6/6 = 6.25 | 9/9/9/9 = 9.00 | rewritten |
| 10.1 | 10.1 | 7/5/7/8 = 6.75 | 10/9/9/9 = 9.25 | rewritten |
| 10.2 | 10.2 | 7/7/7/9 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 10.3 | 10.3 | 8/8/7/9 = 8.00 | 8/8/7/9 = 8.00 | kept |
| 10.4 | 10.4 | 6/7/6/8 = 6.75 | 9/9/9/9 = 9.00 | rewritten |
| 10.5 | 10.5 | 6/8/8/8 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 11 | new | 6/5/6/7 = 6.00 (old 11, moved to spare) | 10/9/9/9 = 9.25 | a win, unnamed |
| 12 | 12 | 9/8/8/9 = 8.50 | 9/8/8/9 = 8.50 | kept |
| 13.1 | 13.1 + 13.2 | 5/5/6/7 = 5.75; 6/7/6/8 = 6.75 | 9/9/9/9 = 9.00 | merged |
| 13.2 | 13.3 | 7/7/7/9 = 7.50 | 9/9/9/9 = 9.00 | tightened |
| 13.3 | 13.4 | 6/7/6/7 = 6.50 | 9/9/9/9 = 9.00 | CTA moved here |
| 13.4 | 13.5 | 7/6/7/7 = 6.75 | 9/9/9/9 = 9.00 | CTA removed, one idea |
| 14 | 14 | 5/4/7/8 = 6.00 | 9/9/9/9 = 9.00 | rewritten for strangers |
| 15 | 15 | 6/6/7/8 = 6.75 | 9/9/9/9 = 9.00 | rewritten |
| L1 | L1 | 5/6/7/7 = 6.25 | 10/9/9/9 = 9.25 | claim first, rule held back |
| LR | LR | 5/7/7/7 = 6.50 | 9/9/9/9 = 9.00 | rewritten |
| L2 | L2 | 7/8/8/8 = 7.75 | 9/9/9/9 = 9.00 | now the payoff |
| L3 | L3 | 9/9/8/9 = 8.75 | 9/9/8/9 = 8.75 | kept |
| L4 | L4 | 6/7/7/7 = 6.75 | 9/9/9/9 = 9.00 | rewritten |
| L5 | L5 | 7/7/8/7 = 7.25 | 9/9/9/9 = 9.00 | rewritten |
| L6 | L6 | 6/8/7/9 = 7.50 | 9/9/9/9 = 9.00 | reply ask and link added |
| 16b | new | n/a | 9/9/9/9 = 9.00 | launch-evening quote post |
| 17 | 17 | 5/6/6/7 = 6.00 | 9/9/9/9 = 9.00 | claim first, count second |
| 18.1 | 18.1 | 7/7/7/8 = 7.25 | 9/9/9/9 = 9.00 | rewritten |
| 18.2 | 18.2 + 18.3 | 7/8/7/8 = 7.50; 6/7/6/7 = 6.50 | 9/9/9/9 = 9.00 | merged |
| 18.3 | 18.4 | 8/7/7/9 = 7.75 | 9/9/9/9 = 9.00 | light edit |
| 18.4 | 18.5 | 6/8/7/8 = 7.25 | 9/9/9/9 = 9.00 | tightened |
| 19 | 19 | 9/8/8/9 = 8.50 | 9/8/8/9 = 8.50 | kept |
| 20.1 | 20.1 | 8/8/8/9 = 8.25 | 8/8/8/9 = 8.25 | kept |
| 20.2 | 20.2 | 6/6/6/7 = 6.25 | 9/9/9/9 = 9.00 | rewritten |
| 20.3 | 20.3 | 6/6/6/6 = 6.00 | 9/9/9/9 = 9.00 | rewritten |
| 20.4 | 20.4 + 20.5 | 6/8/6/8 = 7.00; 5/7/7/7 = 6.50 | 9/9/9/9 = 9.00 | merged |

**Why the plan scores moved**

- **Pacing, 6 to 8.5.** Before, week 2 was five reruns with nothing new, and the day after launch
  had nothing on X. Now week 2 has two new ideas, and launch day has a second touch at 17:00 ET.
  The three threads in three days stay. A new account needs the momentum.
- **Arc, 6.5 to 8.5.** Before, days 2 and 3 opened on recaps. Intrigue was four losses in a row,
  and launch post 1 gave away the rule. Now each day opens on its own hook. Intrigue goes win,
  loss, win, loss. The rule is teased in slots 5, 14 and 3.8 and revealed in launch post 2.
- **Launch-day pull, 5.5 to 8.5.** Before, launch day had one post saying "reppit is up", a link
  with nothing pointing to it, and no reason to reply. Now it has the claim as the hook, "Link in
  the reply", the link at the end of the thread too, a pinned thread, a reply ask that brings in
  misses, a live-numbers quote post, and a reply under day 1. Why not higher: there is no
  existing audience number to plan around, and HN timing will matter more than any line here.
