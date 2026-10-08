# Thread one — the case

Problem only. No product, no name, no pitch. The reader should finish post 20 wanting an
answer and not have been handed one.

Every number here comes from `docs/product/the-case.md` and is sourced there. Nothing is
invented and nothing from the unverified list is used. Caveats stay attached to their
numbers.

Voice: short words, short lines, one idea per post. No emoji, no hashtags, no em dashes,
no thread numbering. Numbers get stated flatly. The number is the drama.

Figures live in `docs/figures/`. The filename each post needs is on the line under it.

---

## Thread: the case

**1**
> You are building something. Your agent says "I'll use quickxml-parse for this."
>
> You say sure.
>
> You have no idea if that library is any good. Neither does your agent. It saw the name a lot in training, so it said the name.
`f1-the-moment.png`

**2**
> So you do the one check everyone does.
>
> Open the repo. Look at the number in the corner. 12,000 stars. Fine. Good enough.
>
> That is the whole quality bar for code you are about to ship to other people.
`f2-the-only-check.png`

**3**
> Here is what a star actually is.
>
> 2019: someone sees a link on a lunch break and clicks a button.
> 2021: the project stops getting commits.
> 2026: the star is still there.
>
> Nobody goes back and un-stars a dead repo.
`f3-what-a-star-is.png`

**4**
> So you get pairs like this.
>
> 40,000 stars, archived, last commit 2023.
> 300 stars, updated Tuesday, maintainer replies in a day.
>
> The first one wins every search box you own, and every suggestion your agent makes.
`f4-the-mismatch.png`

**5**
> This part is measured, not a hunch.
>
> Researchers correlated star counts against how actively projects were maintained. Spearman rho of 0.10. Their own word for it is "very weak."
>
> Stars and maintenance are close to unrelated.
`f10-the-cloud.png`

**6**
> From the same study, one project: 50,034 stars, maintenance activity level of 8.
>
> Fifty thousand people said nice. Almost nobody was fixing anything.
>
> Both things were true at the same time, and only one of them was on the page.
`f11-fifty-thousand-stars.png`

**7**
> The same paper scored other signals against maintenance.
>
> Total contributors: 0.44.
> Project size: 0.38.
> Stars: 0.10.
>
> Of everything they tested, the number we all actually look at came last.
`f12-weakest-signal.png`

**8**
> Worth saying plainly: that dataset is GitHub as of November 2017.
>
> So this is not something AI broke. Stars never tracked maintenance. They were never built to.
>
> We kept using them because the number was already on the screen.
`f13-never-worked.png`

**9**
> Now the size of the pile.
>
> GitHub added 121 million repositories in the year to August 2025. About 230 a minute.
>
> Review one a minute, no sleep, no weekends, and you fall 229 further behind every minute.
`f14-repos-per-minute.png`

**10**
> Pulled from the registries this week.
>
> npm: 4,464,731 packages.
> PyPI: 907,001.
> crates.io: 347,256.
>
> There is no version of "I'll have a quick look around" that covers that.
`f15-three-registries.png`

**11**
> And nothing is curating it. There is no editor, no shelf, no buyer deciding what gets stocked.
>
> The awesome-whatever list in your bookmarks was maintained by one person who got busy.
>
> Hand curation lost years ago. Nothing replaced it.
no image

**12**
> This is already inside your own codebase.
>
> An audit of 947 commercial codebases found 93% contained at least one component with no development activity in two years.
>
> You did not abandon it. It was abandoned under you.
`f16-zombie-bar.png`

**13**
> Same audit: 7% of the components in use were the latest version.
>
> Seven. Everything else is running behind, and some of it is behind because there is nothing ahead of it. The project stopped.
no image

**14**
> Here is the thing that actually changed, and it is not the amount of code.
>
> Picking a dependency used to cost a human five minutes of looking around.
>
> Your agent picks in two seconds, off the same weak number, and cannot tell that it is weak.
`f17-five-minutes-two-seconds.png`

**15**
> I want to be careful, because blaming AI would be easy and it would be wrong.
>
> GitHub's public repo growth, year on year: plus 22%, then about plus 17%, then plus 19%.
>
> AI went from niche to everywhere across that window. The line did not bend.
`f18-the-flat-line.png`

**16**
> Duplication is not new either.
>
> A 2017 study of 428 million files found 70% of files on GitHub were copies of files that already existed.
>
> 2017. The pile was mostly copies before any of this started.
`f19-clones-before-ai.png`

**17**
> One more against my own case.
>
> A 2025 study found 19.7% of packages suggested by models did not exist. That is the number everyone still quotes.
>
> A 2026 rerun on current models: 4.6% to 6.1%. It got better. Use the new one.
`f20-the-number-that-got-better.png`

**18**
> So this is the spot developers are standing in.
>
> 83% use AI tools. 73% of assistant users use them every day.
>
> 6.6% would trust the output for an important decision.
>
> We use it constantly. We believe it almost never.
`f21-use-vs-trust.png`

**19**
> That gap is not developers being irrational. It is developers being right.
>
> The tool is fast, often correct, and has no way to tell you which time this is. So you check it.
>
> Checking a dependency means looking at a star count. See above.
no image

**20**
> Which leaves three questions, and no quick way to answer any of them.
>
> Does it still work?
> Did it break for anyone?
> Does it work in my setup?
>
> They are not hard questions. There is just nowhere to look them up.
`f5-what-you-want.png`

---

## Standalone

**On stars**
> A GitHub star is a bookmark someone made once, maybe in 2019, possibly on a phone, about a project that has since died.
>
> We rank the software supply chain on that.
`f3-what-a-star-is.png`

**On the weakest signal**
> Someone measured which signals actually track whether a project is still maintained.
>
> Contributors: 0.44.
> Size: 0.38.
> Stars: 0.10.
>
> The one we print in big numbers at the top of the page finished last.
`f12-weakest-signal.png`

**On the cost**
> Being wrong about a library costs you a week. Sometimes a rewrite.
>
> The check we run before taking that risk is reading a number that someone clicked in 2019 and never thought about again.
>
> That is the entire system.
no image

**On zombies**
> 93% of commercial codebases contain a component with nobody developing it for two years.
>
> Nobody picked a dead dependency. They picked a live one, and then nothing told them.
`f16-zombie-bar.png`

**On the number that got better**
> The 19.7% package hallucination figure is out of date.
>
> Current frontier models sit at 4.6% to 6.1%. The thing people are scared of got roughly four times less common while they were sharing the old screenshot.
`f20-the-number-that-got-better.png`

---

## Later: product posts, do not post with thread one

**On the reason tag**
> "347 downvotes" tells you nothing.
>
> "9 people say it is unmaintained" tells you what to do next.
>
> Any voting system that does not ask why is a mood ring with a count on it.
`f7-number-vs-sentence.png`

**On old praise**
> Votes lose half their weight every six months.
>
> A library people loved in 2021 has to be loved again to keep ranking.
>
> Praise should expire. Code does.
no image

**On day one**
> A community site with no community ranks nothing. So there is also a score built from what needs no human: last commit, release pace, archived or deprecated, open security advisories, issue load, license clarity.
no image

## Posting notes

- Post 1 to 20 in order. The arc is: it happens to you, the check you run, what that
  check is, the proof the check is weak, the size of the pile, the decay already in your
  code, what actually changed, two concessions, the trust gap, the questions.
- Strongest hook is post 1, and it should stay first. It is the only post with no
  statistic in it, it is purely the reader's own Tuesday, and the last line is the part
  people quote without needing the thread.
- Strongest post in the thread is 18. It is other developers, in their own survey,
  describing the exact feeling the reader has been having privately. 83% use it, 6.6%
  trust it. Nothing needs adding to that.
- Posts 15, 16 and 17 are the credibility block. They concede three things the thread
  could have exaggerated. Do not move them to the end and do not cut them to two. Three
  concessions in a row is what makes post 18 land as reporting rather than pitching.
- Post 8 is load-bearing and easy to lose. The 2017 date has to be said by me before a
  reply guy says it for me.
- Standalones go out one at a time between threads, a few days apart. "On stars" first,
  then "On the cost", then "On the weakest signal".
- The three product posts at the bottom belong to a later thread. Nothing in thread one
  names a product, and that is the point: the case has to be agreed with before anything
  is sold.

## Figures already drawn and used here

| File | Post |
|---|---|
| `f1-the-moment.png` | 1 |
| `f2-the-only-check.png` | 2 |
| `f3-what-a-star-is.png` | 3, and the "On stars" standalone |
| `f4-the-mismatch.png` | 4 |
| `f5-what-you-want.png` | 20 |

`f6-the-reason-tag.png`, `f7-number-vs-sentence.png`, `f8-the-agent-grid.png` and
`f9-the-loop.png` are product figures. Not used in thread one.

## New figures needed

| File | Post | What it should show |
|---|---|---|
| `f10-the-cloud.png` | 5 | Scatter plot, stars on one axis, maintenance activity on the other. The point is that it has no shape: a shapeless cloud of dots with no line through it. A faint trend line that is almost flat is fine if it helps. Label it rho = 0.10. |
| `f11-fifty-thousand-stars.png` | 6 | One dot from that same cloud, pulled out and circled: 50,034 stars, maintenance activity 8. Far right on the star axis, near the floor on the other. The loneliness of the dot is the joke. |
| `f12-weakest-signal.png` | 7 | Three bars, longest to shortest: contributors 0.44, size 0.38, stars 0.10. The stars bar is a stub, and it is the only one with a star icon on it. |
| `f13-never-worked.png` | 8 | A horizontal timeline. A marker at November 2017 reading "measured here". The AI coding tools arriving much further right. The gap between them is the whole image. |
| `f14-repos-per-minute.png` | 9 | Two columns for one minute. Left: a dense block of 230 tiny repo squares. Right: one square, with a tired person next to it. No big number needed. |
| `f15-three-registries.png` | 10 | Three stacked counters, npm 4,464,731 / PyPI 907,001 / crates.io 347,256, drawn at true relative size so npm dwarfs the others. A person standing at the bottom for scale. |
| `f16-zombie-bar.png` | 12, and the "On zombies" standalone | Two bars in one chart: 93% of codebases contain a zombie component, 7% of components in use are the latest version. Same axis, so the two numbers sit in the same picture. |
| `f17-five-minutes-two-seconds.png` | 14 | Side by side. A person with a five minute timer, three browser tabs open, reading. An agent with a two second timer, already finished, one tab. Same decision, same weak number underneath both. |
| `f18-the-flat-line.png` | 15 | A line chart of GitHub public repo growth: plus 22%, plus 17%, plus 19%. Flat to slightly down. An arrow pointing at the window where AI tools went mainstream, with no bend in the line under it. |
| `f19-clones-before-ai.png` | 16 | Timeline again. The 2017 study marked at 70% of files were already clones, with the AI tool launches far to the right of it. Can share visual language with f13. |
| `f20-the-number-that-got-better.png` | 17, and the matching standalone | Before and after bars: 19.7% in 2025, 4.6% to 6.1% in 2026, arrow pointing down. Drawn as good news, because it is. |
| `f21-use-vs-trust.png` | 18 | Two circles or two bars, side by side and badly mismatched: 83% use AI tools, 6.6% trust the output for an important decision. The empty space between them is the image. |
