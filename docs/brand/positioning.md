# Phase 3 — Positioning

## The statement

**For developers whose coding agent picks their dependencies, reppit is the place to find
out whether a repo still works. Star counts tell you something was popular once. reppit
tells you what it is doing now, and the people who voted had to say why.**

That is the gate: read it once, say it back. If someone cannot repeat it, it is too long.

---

## The four parts

**For whom.** Developers who use a coding agent daily and answer to nobody on dependency
choices. Solo builders, founding engineers, small product teams.

**Against what alternative.** Not a competitor. The star count, and the thirty seconds of
squinting at a GitHub page that follows it. That is what people actually do today, and it
is what we have to be better than.

**The one claim.** It tells you whether a repo still works, not whether it was once popular.

**The proof.**
- Every downvote carries a reason. Unmaintained, insecure, broken on an agent, misleading,
  low quality. A score is noise; a reason is a decision.
- Per-agent compatibility reports. Works in Claude Code, breaks in Codex. Nobody else
  collects this.
- A trust score computed from what the repo is doing: last push, release cadence,
  deprecation flags, open advisories, issue load, license.
- Votes lose half their weight every six months, so old praise stops counting.

---

## The enemy is star counts

Pick the enemy carefully. Naming a competitor makes you look small and makes them look
like the standard. Naming star counts does something better: it makes every directory
that ranks by stars look lazy, without mentioning one of them by name.

It is also simply true, which means the argument survives scrutiny:

- A star is a bookmark. Most people never unstar anything.
- Stars measure a moment years ago, not the state of the code today.
- An archived repo with 40,000 stars outranks a maintained one with 300 everywhere.
- Stars cannot be negative. There is no way to say "this broke my build."

The line that does the most work: **stars are easy to count, and easy to count is not the
same as true.**

---

## Voice

**Plain. Measured. Blunt.**

- **Plain** — short words, short sentences. If a developer would not say it out loud, cut it.
- **Measured** — numbers that were actually measured, including the bad ones. "19 of 30,
  and 5 of those were impossible" beats any adjective.
- **Blunt** — say the thing. No cushioning, no throat-clearing, no asking permission.

**Not hyped. Not clever. Not corporate.**

- **Not hyped** — no "revolutionary", no "game-changing", no exclamation marks. The claim is
  specific enough that it does not need help.
- **Not clever** — no puns, no winking. The name already rhymes with reddit; that is the
  entire joke budget, spent.
- **Not corporate** — no "we're excited to", no "empowering developers", no "solutions".

### In practice

| Don't | Do |
|---|---|
| "Discover the best open source packages" | "Find out if it still works" |
| "Powered by community intelligence" | "People who used it had to say why" |
| "We're excited to launch reppit!" | "reppit is up. Here is what it does." |
| "Revolutionising dependency discovery" | "Stars are a bookmark from 2019" |

---

## The three descriptions

**One-liner, for the tab and the bio**
> Stars say it was popular. reppit says it still works.

**Thirty words, for the repo and the directory listings**
> Community-ranked repos and agent skills. Every downvote carries a reason, every vote
> fades with age, and your coding agent can ask before it picks your next dependency.

**A hundred words, for the landing page and the launch post**
> Your coding agent adds a dependency and you have about thirty seconds to decide if that
> was a good idea. Today that means looking at a star count, which tells you the repo was
> popular at some point, possibly in 2019.
>
> reppit ranks repos and agent skills on whether they still work. Downvotes require a
> reason: unmaintained, insecure, broken on an agent, misleading, low quality. Votes lose
> half their weight every six months, so old praise stops counting. And people report which
> coding agents a thing actually runs in, which nobody else tracks.
>
> Ask from the site, or from inside your agent.

---

## Lines worth keeping

Tested against the voice rules. Use in posts, docs, and the landing page.

- Stars are easy to count. Easy to count is not the same as true.
- A star is a bookmark. Nobody goes back and unstars the dead ones.
- "347 people disliked this" is noise. "9 people say it is unmaintained" is a decision.
- Being wrong about a library costs a week. Asking people who used it costs a minute.
- Your agent already picked it. This is the part where you find out.

## What positioning decides for Phase 4

- The landing page leads with the claim, not with a product screenshot. The claim is the
  thing that is different; the screenshot looks like every other directory.
- The reason tag has to be visible in the first screen. It is the proof and the product.
- Do not show an empty comment section or a zero vote count on a marketing screen. At cold
  start the trust score is the hero, and votes are what compounds.
- No illustration, no mascot, no gradient. "Plain, measured, blunt" has to survive contact
  with the design or the voice is a document nobody reads.
