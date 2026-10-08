# Phase 2 — Segment and scope

## Gate answers

**Segment:** developers who use a coding agent daily and ship their own code, with nobody
above them approving dependencies. Solo builders, founding engineers, small product teams.

**Why they switch, in one sentence:** their agent already picks the library, and right now
the only sanity check available is a star count that does not say whether the thing still
works.

**v1:** six items, listed below, buildable in two weeks because four of them already exist.

---

## Choosing the segment

The sizing document found the money is in platform teams buying dependency governance:
50 teams at $300/mo beats 1,800 individuals at $12/mo with a fraction of the support load.
That is true and it is not a reason to build for them first.

Platform teams buy after a procurement conversation, from a vendor with a reference
customer and an audit story. None of that exists yet. Building for them now means
building an allowlist nobody has asked for, for a buyer nobody has met.

| | Beachhead | Expansion |
|---|---|---|
| Who | Agent-first individual developers and small teams | Platform and staff engineers |
| Pain | Agent adds a package, no way to check it without leaving the terminal | Agents adding unvetted packages across a whole org |
| Buys | Nothing at first. Supplies the votes. | Governance: allowlists, policy, audit |
| Reachable | Yes, on X, where we are already building in public | Only through referral and reputation |
| Timeline | Now | Year two |

The beachhead does not pay. It produces the data that makes the expansion segment's
product possible. That is the whole strategy and it should be stated plainly rather than
dressed up: **the free tier is the data acquisition cost.**

### Sizing the beachhead specifically

Not the $530M SAM. The reachable beachhead is much smaller and worth being honest about:
developers who use agents daily (68% of professionals), who choose their own stack, and
who can be reached through developer social channels without a marketing budget. Realistically
a few hundred thousand people, of whom a first-year audience of 20,000 to 50,000 would be a
strong result. The sizing document's year-one revenue of $41K assumes roughly that.

---

## The real problem nobody has solved yet: cold start

A community-ranked site with no community ranks nothing. On day one every repo has zero
votes, zero comments and zero compatibility reports. The honest version of the product on
launch day is a search engine with an empty opinion layer.

Three competitors failed into this exact hole and shipped directories that are just
scraped GitHub metadata with a fresh coat of paint.

**The answer is that the ranking must be useful before a single human votes.** Everything
that can be computed, gets computed, and votes only adjust it:

| Signal | Source | Available at zero users |
|---|---|---|
| Maintenance recency | last push, release cadence | yes, already built |
| Archived or deprecated | GitHub flag, npm deprecation field | yes, needs adding |
| Open security advisories | GitHub Advisory Database | yes, needs adding |
| Issue load relative to size | open issues vs stars | yes, already built |
| License clarity | SPDX id | yes, already built |
| Popularity | stars, downloads, installs | yes, already built |
| **Human votes with reasons** | the community | **no, this accrues** |
| **Per-agent compatibility** | the community | **no, this accrues** |

So v1 ships a trust score that works immediately, and the community layer makes it better
over months. The pitch on day one is not "see what people voted", it is "see what the repo
is actually doing", with voting as the thing that compounds.

This reorders v1 substantially. Deprecation and advisory ingestion move **up**, above
comments, because they produce signal with no users at all.

---

## v1 — two weeks

Four of these already exist in the prototype and need carrying over, not rebuilding.

| # | Item | State | Why it is in v1 |
|---|---|---|---|
| 1 | Problem-first search with reasons | exists, needs better index | The reason anyone arrives |
| 2 | Trust score that works at zero users | partly exists; add deprecation and advisories | Without this, launch day is empty |
| 3 | Votes with mandatory reason tags | exists | The product's actual idea |
| 4 | Per-agent compatibility reports | exists | The one thing no competitor has |
| 5 | MCP server and cross-agent skill | exists | Distribution. This is how people find it. |
| 6 | Item page and feed | exists as scaffolding, **needs Phase 4 design** | The front door |

New build inside v1 is small: deprecation and advisory ingestion, a wider index, real
embeddings, and the designed interface. The rest is carry-over.

## v2 — after there are users

- Threaded comments. They are in the prototype and they will be cut from v1, because an
  empty comment section looks worse than no comment section.
- Submit flow beyond a basic form.
- Topic and language pages, for search traffic.
- API keys, metering, paid tiers.
- Sponsored placement.

## Explicitly not doing

- **A skills marketplace with payments.** ClawHub has it and the supply side is not our
  problem to solve.
- **Hosting MCP servers.** That is Smithery and Glama's business, it is capital intensive,
  and the creator resentment it generates is something to exploit rather than repeat.
- **A VS Code extension.** The agent is the surface. An editor plugin is a second surface
  with its own review cycle for a fraction of the reach.
- **Our own package registry or installer.** Delegate to `npx skills add` and the native
  package managers. Competing there is a fight with no prize.
- **Vote-to-earn, karma, badges, streaks.** Gamifying votes corrupts the only signal that
  matters.

---

## What this changes about the existing prototype

| Prototype asset | Call |
|---|---|
| Ranking, vote weighting, health score | Keep as is |
| Reason tags, compat reports | Keep as is |
| Comments | Keep the code, hide the UI until v2 |
| Topic and language pages | Hide until v2 |
| API keys and sponsored slot | Keep the schema, hide the UI |
| Seeder | Rebuild, it is the binding constraint on search quality |
| Interface | Rebuild in Phase 4 |

Nothing gets deleted. Things get hidden. The schema already separates sponsored placement
from ranking, so hiding the UI costs nothing and keeps the wall intact.

## Verification for this phase

- Every v1 item names the beachhead pain it serves. Six items, six pains, no exceptions.
- The two-week estimate assumes four carry-overs and one new ingestion path. If Phase 4
  design runs long, design is what slips, not the trust score.
- Before any public launch, run the search eval with the index rebuilt and publish the real
  number, including the ceiling implied by index coverage.
