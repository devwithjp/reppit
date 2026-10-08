# Build in public — posts

Product: **reppit** (reppit.dev)

Voice rules I'm holding to: short lines, plain words, one idea per post. No emoji, no
hashtags, no "excited to announce", no thread numbering, no em dashes. Every post carries
a number I actually measured or an image. State the thing and stop.

Images live in `docs/screenshots/`. The filename each post needs is listed under it.

---

## Phase 1 — Naming

### Thread: the name search

**1**
> I needed a name.
>
> I had 12 good ones. Short, real English words. Vouch. Tally. Verdict. Quorum.
>
> I checked all 12 on npm.
>
> 11 were taken.

`p1-npm-check.png` — terminal showing the 12 results

**2**
> The one that was free was "dependably".
>
> Three syllables. Nobody is typing that.
>
> So the whole dictionary is gone. If you're naming a dev tool in 2026, you're making a
> word up. That's not a style choice anymore.

no image

**3**
> Landed on reppit.
>
> Rep is the whole product. Reputation, from people who actually used the thing.
>
> And it rhymes with reddit, which saves me a sentence of explaining.

`p1-reppit.png` — the name in the logotype

**4**
> Nearly took repit instead. Cleaner word.
>
> Then I looked up who owns it on npm. Some guy's DOM helper from 2022. Two downloads a
> week. Dormant, but his.
>
> My CLI ships as an npm package. A name I can't publish under isn't a name.

`p1-repit-npm.png` — the npm view output

**5**
> Checked domains with RDAP, not DNS.
>
> A domain someone owns and parks doesn't resolve. DNS makes it look free. It isn't.
>
> Cost me ten minutes to learn. Would have cost me a name.

no image

**6**
> reppit.dev. npm name claimed.
>
> Also bought repit.dev and pointed it at reppit.dev, because the double p is the one
> thing people will get wrong.
>
> Fix the typo before anyone makes it.

`p1-reppit.png`

### Standalone

**On naming**
> Pick the name after you check npm, not before.
>
> You will fall in love with a word that is already somebody's abandoned package, and
> then you will spend a week trying to talk yourself into it.

no image

**On the .com**
> reppit.com is taken. I'm shipping on .dev anyway.
>
> For a developer tool nobody has cared about the .com in years. They care whether
> `npx reppit` works.
>
> That one I own.

no image

---

## Phase 0 — The prototype that came first
Posts from the build that proved the mechanics. Hold these until the product is named
and designed, then post the strongest two.

**On the idea**
> Stars tell you a repo was popular once.
>
> They don't tell you if it still works.
>
> So I started building a different signal.

`01-search.png`

**On the reason tag**
> I made downvotes require a reason.
>
> Unmaintained. Insecure. Broken. Misleading. Low quality.
>
> Took ten minutes to build. It's the whole product.
>
> "347 people disliked this" is noise. "9 people say it's unmaintained" is a decision.

`02-downvote-reasons.png`

**On the bad number**
> First real test of search: 19 out of 30.
>
> Then I looked closer. 5 of those questions had no right answer in my index at all. The
> best I could have scored was 25.
>
> So the number is bad and the test was broken too. Both get fixed.

`05-eval.png`

**On stars**
> Every directory ranks by stars because stars are easy to count.
>
> Easy to count and true are not the same thing.

`01-search.png`

**On ads**
> Sponsored slots will pay for this one day.
>
> They sit in their own box and the ranking code cannot read them. Not a policy. A wall
> in the code.
>
> The day money moves the rankings is the day the votes are worth nothing.

`07-sponsored.png`

**On the math**
> Being wrong about a library costs you a week.
>
> Asking ten people who already used it costs you a minute.
>
> That's the whole idea. Nothing clever underneath.

`03-item.png`

---

## Posting notes

- Phase 1 thread is ready now. The "11 of 12 were taken" opener is the strongest hook
  I have, because it is a specific number and it is useful to anyone naming anything.
- Space standalones one a day between threads.
- "On the bad number" is the one that builds trust. Post it before the fixed number, not
  after, or it reads as a victory lap.
- When search goes from 19 to 25, reply to that post with the new number. The correction
  is worth more than either number on its own.

## Images still to capture

| File | What it shows |
|---|---|
| `p1-npm-check.png` | Terminal: 12 names checked, 11 taken |
| `p1-repit-npm.png` | `npm view repit` output with the 2022 date |
| `p1-reppit.png` | reppit logotype, once Phase 4 designs it |
| `01-search.png` | Search results with reasons |
| `02-downvote-reasons.png` | The downvote reason picker open |
| `03-item.png` | Item page, comments and agent compatibility |
| `05-eval.png` | Terminal: the 19/30 eval run |
| `07-sponsored.png` | Feed with a labelled sponsored row |
