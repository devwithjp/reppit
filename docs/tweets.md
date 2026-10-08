# Launch thread — reppit

Product: **reppit** (reppit.dev). A community-ranked directory of GitHub repos and agent
skills.

Voice rules: short words, short lines, one idea per post. No emoji, no hashtags, no em
dashes, no thread numbering. Each post has to stand up alone.

Illustrations live in `docs/figures/`. The filename each post needs is listed under it.

---

## Thread: why stars stopped working

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
> That is the entire quality bar for code you are about to ship to users.
`f2-the-only-check.png`

**3**
> Here is what a star actually is.
>
> 2019: someone sees a link on their lunch break and clicks a button.
> 2021: the project stops getting commits.
> 2026: the star is still there.
>
> Nobody goes back and un-stars a dead repo.
`f3-what-a-star-is.png`

**4**
> So the ranking is wrong in both directions.
>
> 40,000 stars, archived, last commit 2023.
> 300 stars, updated Tuesday, maintainer replies in a day.
>
> Guess which one your search puts first. Guess which one your agent reaches for.
`f4-the-mismatch.png`

**5**
> Stars also only go up. There is no button for "this broke my build."
>
> The things you want to know:
>
> Does it still work?
> Did it break for anyone?
> Does it work in my setup?
>
> A star answers none of those.
`f5-what-you-want.png`

**6**
> Fix one: upvotes and downvotes, like Reddit.
>
> But a downvote makes you pick a reason. Unmaintained. Insecure. Breaks on an agent. Misleading. Low quality.
>
> The reason is the product. The vote is just how you get at it.
`f6-the-reason-tag.png`

**7**
> Watch the difference that makes.
>
> "347 people downvoted this" is a mood. You can't do anything with it.
>
> "9 people say it is unmaintained" is a claim you can check in ten seconds.
>
> One is a number. The other is a sentence.
`f7-number-vs-sentence.png`

**8**
> Fix two: people report which coding agent a thing actually works in.
>
> Works in Claude Code. Breaks in Codex. Fine in Cursor.
>
> Right now that gets said once in an issue thread and then lost. It should be a column, not folklore.
`f8-the-agent-grid.png`

**9**
> It is called reppit, I'm building it, and the point is that you never open it.
>
> You ask your agent for a library. Your agent asks reppit. reppit ranks. Your agent installs the one that isn't dead.
>
> reppit.dev
`f9-the-loop.png`

**10**
> Where it honestly is: the search quality test scores 19 out of 30.
>
> That is bad. The test was also broken: 5 of the 30 questions had no right answer in the index at all, so the real ceiling was 25.
>
> Both get fixed. Posting the number when it moves.
no image

---

## Standalone

**On stars**
> A GitHub star is a bookmark someone made once, maybe in 2019, possibly on a phone, about a project that has since died.
>
> We rank the entire software supply chain on that.
`f3-what-a-star-is.png`

**On the reason tag**
> "347 downvotes" tells you nothing.
>
> "9 people say it is unmaintained" tells you what to do next.
>
> Any voting system that doesn't ask why is just a mood ring with a count on it.
`f7-number-vs-sentence.png`

**On the cost**
> Being wrong about a library costs you a week. Sometimes a rewrite.
>
> Reading what ten people said after they used it costs you a minute.
>
> That gap is the whole reason reppit exists. There is nothing clever under it.
no image

**On old praise**
> Votes on reppit lose half their weight every six months.
>
> A library people loved in 2021 has to be loved again to keep ranking.
>
> Praise should expire. Code does.
no image

**On day one**
> A community site with no community ranks nothing. So reppit also scores what needs no human: last commit, release pace, archived or deprecated, open security advisories, issue load, license clarity.
>
> Votes make it sharper. They aren't the floor.
no image

---

## Posting notes

- Post the thread in order 1 to 10. Posts 1 through 9 carry the figures. Post 10 ships
  without one on purpose: after nine drawn posts, a plain post of bad numbers reads as
  the author dropping the pitch voice, which is the effect I want.
- Strongest hook is post 1. It is the only post that is purely the reader's own week,
  with no product in it, and the last line ("it saw the name a lot in training, so it
  said the name") is the part people will quote without needing the rest.
- Second strongest is post 3. It works alone, it is about something everyone already
  uses, and nobody has to agree with me about reppit to agree with it. That is why it is
  also a standalone.
- Space the standalones out, one a day, a few days apart. "On stars" first, then "On the
  cost", then "On the reason tag". Keep "On day one" for whenever someone asks how it
  ranks anything before it has users.
- When the search score moves off 19, reply to post 10 with the new number rather than
  posting it fresh. The correction is worth more attached to the admission.

## Figures needed

| File | What it shows |
|---|---|
| `f1-the-moment.png` | Laptop, robot says "I'll use quickxml-parse", person thinks "...is that good?" |
| `f2-the-only-check.png` | Squinting at "12,000 stars". "Fine. Good enough." |
| `f3-what-a-star-is.png` | Timeline: starred 2019, repo dies 2021, star still there 2026 |
| `f4-the-mismatch.png` | Two repo cards: 40,000 and archived vs 300 and updated Tuesday |
| `f5-what-you-want.png` | Thought bubble with the three questions |
| `f6-the-reason-tag.png` | Downvote opening the five-reason menu |
| `f7-number-vs-sentence.png` | "347 people downvoted this" next to "9 people say it is unmaintained" |
| `f8-the-agent-grid.png` | Agent grid, ticks and crosses for works and breaks |
| `f9-the-loop.png` | You, agent, reppit, ranked answer, agent installs it |
