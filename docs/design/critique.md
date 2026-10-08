# critique

Two rounds. Each round is written in role, then says what actually changed. A round that
changed nothing would mean the critique was too polite.

---

# Round one

## As CEO

**Does this make the one claim in under three seconds?**

On the landing page, yes. "Stars say it was popular. reppit says it still works" is the
first thing the eye lands on, the strikethrough-grey first half does the comparison without
a word of explanation, and the reason taxonomy sits to its right with real counts. Three
seconds is enough.

On the feed, no, and the feed is the screenshot people will actually post. What I see is a
ranked list that could belong to any package directory. The row's loudest element is
`1,284` in a left rail, which reads as a star count — I have rebuilt the enemy and put it
in my own product. The second loudest is `92/100` with no word attached to it. A cropped
screenshot of my own feed does not say what reppit is.

**Would I put money behind this screenshot?**

Behind the landing fold, yes. Behind the feed, not yet. The strip of six coloured cells is
the most distinctive thing on the page and a stranger has no idea what it means. Right now
it is decoration that happens to be data.

**What does an acquirer see?**

They see something that would drop into a developer platform with no redesign — same
information architecture as a repo list, same vote grammar, same breadcrumbs. Good. What
they do not see anywhere on the list page is the asset: that the score is computed with no
human input and therefore works at zero users. That sentence is the whole cold-start story
and it is not on the screen that sells it.

## As CPO

**What is the one job this screen does?**

Feed and search: let somebody pick one of six candidates in about thirty seconds, with
enough of a reason that they do not regret it.

**What is on it that does not serve that job?**

- `½ / 6mo` printed under every single vote count. It is true of every row, so repeating it
  six times buys nothing and costs a line of rail height per row.
- The masthead carried `Repos / Skills / MCP servers` and the page carried the same three
  as tabs directly beneath. Two navigations for one axis.
- On the item page, the header has a vote control and the sidebar has a vote composer. Two
  places to do the same thing is two places to hesitate.
- The item page's "Why people voted it down" section contains an upvote. The heading lies.

**Where does a first-time user hesitate?**

1. At the six-cell strip. No key, no tooltip, no legend. It teaches nothing on first sight.
2. At `58`. Is 58 bad? There is nothing anchoring the scale on the list page.
3. At the vote number, deciding whether it is a star count or something else.

## What changed in round one

Design changes:

- **Statement bar rewritten.** From a generic "trust is computed from the repo" to the
  thing that actually matters: *"No human sets the score: it is six measurements of the
  repo itself. Votes adjust it by at most ±12, lose half their weight every six months,
  and every downvote names a reason."* The cold-start asset is now on the list page.
- **Signal strip key added** above the list on feed and search: a sample strip, the six
  inputs in order, and "Blue holds, amber slipping, rust failing." Taught once, not
  repeated per row.
- **`½ / 6mo` removed from every row**, replaced with a 9px `VOTES` label under the rail
  number so it cannot be misread as stars. The fact about decay now lives once, in the
  statement bar.
- **Descriptions clamped to two lines**, so the reason tags sit higher in every row and
  cannot be pushed below the fold by a verbose README summary.
- **Masthead nav de-duplicated**: `Browse / Trust score / In your agent`, with
  Repos/Skills/MCP servers left as in-page tabs.
- Item page: `Why people voted it down` → `Reports — 219 votes · 31 downvotes, every one
  with a reason`, which is what the section actually contains.
- Landing claim re-typeset: fixed line break after "popular.", size reduced from 66px to
  56px max, and the underline changed from an 8px block (which read as a loose rule under
  the text) to a 0.075em rust underline.
- Item page header rebalanced — the install command moved from the right column to the
  left, killing a 120px hole under the chips.

Bugs found by rendering and looking, which is the point of rendering and looking:

- **`.bar` was defined twice** — once as the page toolbar (`display:flex`) and once as the
  score bar (`display:inline-block; width:46px`). The second won. The toolbar silently
  collapsed to a 46×7px box and its children overflowed on top of the list on mobile. It
  happened to look correct at 1440px, which is how it survived the first pass. Renamed to
  `.toolbar` and `.pbar`.
- **The side gutter was being eaten.** `.fold-in`, `.query-in` and `.statement-in` are
  modifiers on `.wrap`, and each used a `padding` shorthand, which zeroed `.wrap`'s
  `padding: 0 20px`. The landing fold had no gutter at 400px. All three now use
  `padding-block`.
- `--t-faint` in the terminal measured 2.59:1. Raised to `#847D6D`, 4.75:1.

---

# Round two

## As CEO

**Does this make the claim in under three seconds now?**

The feed does, now that the statement bar says no human sets the score and the strip has a
key. But I can still crop a single row out of that page and it says nothing. `92` with a
small `/100` next to it is a number without a noun.

**Would I put money behind this screenshot?**

The landing page, yes, except for one section. The three-up argument block — `01 / 02 / 03`
with a mono heading and a paragraph under each — is the single most generic thing on the
site. Put a different logo on it and nobody would notice, which is exactly the failure
condition in the brief. Everything else on that page is unmistakably ours; this part is a
marketing template with good copy in it.

**What does an acquirer see?**

They see one thing that worries them on the item page: two vote controls, one in the header
and one in the sidebar. That reads as an unresolved product decision, and unresolved product
decisions are what due diligence finds.

## As CPO

**What is the one job this screen does?**

Item page: decide whether to use this library, right now, with the dependency already
half-installed.

**What is on it that does not serve that job?**

The header vote control. The job on this page is *decide*, not *contribute*. Voting is the
thing you do after you have decided, and the sidebar composer — which enforces the reason
before the submit button — is the right place for it. The header control was there because
GitHub puts a star button there, which is copying the grammar past the point where the
grammar helps.

**Where does a first-time user hesitate?**

1. Still at a bare `92`. Nothing on the row names the number.
2. On the cold-start page, at `be first` in the vote summary. It is a nudge, and the voice
   is supposed to be plain and measured, not encouraging.
3. On the landing page, at `01 / 02 / 03`, because the three claims are asserted and nothing
   on the screen demonstrates any of them.

## What changed in round two

- **`TRUST` micro-label added above the score** on every feed and search row. A cropped
  screenshot of one row now reads `TRUST 92/100`, a six-cell strip, and `pushed 2 days ago`.
  The row explains itself without the page around it.
- **The landing three-up now carries evidence, not just claims.** Each column ends with the
  actual interface object the claim is about, bottom-aligned across the three:
  - 01 shows a real signal strip and `camelot-dev/camelot · 58/100`.
  - 02 shows the real agent chips: `✓ Claude Code 18`, `✗ Codex 9`, `✗ Cursor 6`, and the
    line "9 of 15 failures were one missing binary".
  - 03 shows the decay curve as four bars: today 1.00, 6mo 0.50, 1yr 0.25, 2yr 0.06.
  This is the change that moved the section from "could be anyone's" to "could only be
  ours". The claims are now the caption and the artefact is the argument.
- **The item page's duplicate vote control is gone.** The header bar is now a read-only
  summary — `+219 works as described`, `−31 reported, every one with a reason`, net `188` —
  with the line "Net of decay. Votes halve in weight every six months, so this is lower than
  the raw count." The only place you can act is the sidebar composer, where the reason is
  mandatory before the submit button. One decision, one place, and the summary itself now
  teaches the decay rule.
- **`be first` → `no votes yet`** on the cold-start page. Plain, measured, blunt. "Be first"
  was the design asking for a favour.
- `.arg` columns given `display:flex; flex-direction:column` with `margin-top:auto` on the
  evidence block, so the three evidence blocks bottom-align regardless of paragraph length.

---

# Why this is not generic

Put side by side with a GitHub repo list and a Reddit subreddit page.

**Familiar, deliberately.** Vote triangles in a left rail with the net count between them.
Dense rows separated by hairlines, not cards with air. `owner/name` in monospace with the
owner muted. Breadcrumbs. Tabs for the content type, a sort row on the right. A two-column
item page with a narrow right sidebar. Nothing here needs to be learned.

**Unmistakable, specifically.** Naming what was done rather than asserting it:

1. **Warm paper, not grey.** `#FBFAF6` ground with `#16150F` warm near-black ink and
   `#E2DCD0` warm hairlines. GitHub and Reddit are both cool-neutral. This reads as paper
   next to either of them, before you have read a word.
2. **Rust as the brand colour, derived from the argument.** `#B4441C` is the logo, the
   downvote, the reason tag, the flag and the failing end of the trust ramp, because this
   is a product about things rotting. No competitor in this category uses an oxide orange;
   almost all of them use blue or purple, both of which are banned or avoided here.
3. **Green is absent.** The ramp is steel `#1D5B85` → amber `#87620F` → rust. The product
   refuses to be a pass/fail check and the palette refuses to offer one.
4. **Radius zero everywhere, zero drop shadows in the entire system.** The single
   `box-shadow` is an `inset` 2px tab underline. Elevation is expressed by ground value.
   This one rule does more than anything else to stop the page reading as a framework
   default.
5. **The reason tag as a repeated physical object.** Rust tint, rust rule, bold mono count,
   lowercase label. It is on the landing fold, every feed row, every search result, the item
   page, the vote composer, and inside the terminal. It is the thing you remember, which is
   correct, because the mandatory reason is the product.
6. **The six-cell signal strip.** A data mark invented for this product's own scoring model
   and used as ornament nowhere else. It is what a repo has to show when nobody has voted.
7. **Monospace promoted out of the code block.** Headings, nav, numbers, tags, buttons,
   labels and the 56px landing claim are all JetBrains Mono. Prose is IBM Plex Sans and
   nothing else is. The split is by *what the thing is*, not by where it sits.
8. **Only one tracked uppercase style exists** (`.lbl`, 10.5px, 0.13em). Rationing it means
   when you see it, it is a label, which is the opposite of the SaaS habit of tracking
   everything small.
9. **The terminal is a designed screen, not a screenshot.** Its own token set, 1.62 line
   height, ligatures off, box-drawing gutters, and the reason tags rendered in eighty
   columns with four colours. Most users will meet reppit there and never open the site.

**Where it would fail the test:** the generic risk left on the page is the masthead. A
46px bar with a wordmark, three mono links and a search field is a shape every developer
tool has. It survives only because the logo block is rust and the nav is monospace.
