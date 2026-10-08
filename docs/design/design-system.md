# reppit — design system

Every token has a reason. If a reason cannot be written in one line, the token is decoration
and it is cut.

The product's claim is **stars say a repo was popular once; reppit says whether it still
works.** The design has one job: make a page of measurements legible in three seconds, and
look like nobody else's.

---

## 1. The strategy, stated before the tokens

**Familiar in structure.** Vote rail on the left, dense rows, mono identifiers, breadcrumbs,
tabs, a sort row. A developer coming from GitHub or Reddit knows how to use this without
being taught. An acquirer can picture it inside their own product.

**Distinct in material.** Warm paper, not cool grey. Rust, not blue or purple. Zero radius
everywhere. No shadows, anywhere, ever. Hairline rules instead of card edges. Monospace
promoted from "code font" to the voice of the whole chrome — headings, nav, numbers, tags,
buttons — with a sans reserved strictly for running prose.

### Explicitly avoided

| Banned | What was done instead |
|---|---|
| shadcn default | Radius 0, no shadow, no `muted-foreground` grey-on-grey. Borders are hairlines of a warm neutral. |
| Purple | Not in the palette at any value. |
| Gradients, glassmorphism | Every fill is a flat solid. There is no `rgba()` fill in the system. |
| Centred hero + two buttons | Landing fold is a 1.32:1 asymmetric grid; claim left, reason taxonomy right, one input, one button. |
| Stock illustration, mascot | Nothing illustrative. The only graphic is a bar chart of vote reasons, which is data. |
| Emoji as iconography | Two SVG triangles, `✓ ✗ ?` glyphs, and a 9×14px rust block for the logo. That is the whole icon set. |
| Rounded cards on grey | Rows sit directly on a sheet bounded by two hairlines, like a table, not like cards. |
| Green as "pass" | Green is absent. The ramp runs steel → amber → rust, because this product is not pass/fail. |

---

## 2. Type

**JetBrains Mono** (variable, latin subset, embedded as base64) for everything structural:
headings, `owner/name`, numbers, tags, nav, buttons, micro-labels, the landing claim.
**IBM Plex Sans** for running prose only: descriptions, explanations, report bodies.

This is the researched pairing, kept, with one change: mono is pushed much further than the
usual "code snippets only". It carries the display type too. Reasons:

- The nouns in this product are identifiers (`camelot-dev/camelot`) and measurements (`58/100`).
  Both are monospace objects. Setting them in a sans would be lying about what they are.
- Mono at 56px with −0.048em tracking reads editorial and slightly industrial, not
  hacker-terminal. The all-mono option was rejected because mono prose at 13px over 68
  characters is measurably slower to read, and the reason lines are prose that must be read.
- Tabular figures are free, which matters on a page where columns of scores must align.

| Role | Size / weight / family | Reason |
|---|---|---|
| Landing claim | mono 700, `clamp(30px, 4.6vw, 56px)`, lh 1.04, ls −0.048em | The claim is the product. It is the only element allowed to be large. |
| Page title `h1` | mono 700, 27px, ls −0.035em | An identifier, not a headline. |
| Big trust score | mono 700, 56px (item) / 96px (cold start) | At cold start the score is the entire page, so it is sized like a headline. |
| Section head | mono 700, 13px, + hairline under | Small and hard. Sections are labels, not announcements. |
| Row title | mono 500, 15px, ls −0.015em | Scannable without shouting; owner is 400 and muted so the repo name reads first. |
| Prose / description | sans 400, 13.5px, lh 1.45, max 68ch | The only place a sans appears. 68ch keeps lines readable at 1440. |
| Lead prose (landing) | sans 400, 16.5px, lh 1.52, max 48ch | One size up because it is the only paragraph on the screen. |
| Tag / chip | mono 400, 11.5px | Reason tags must read as discrete objects, not as sentence fragments. |
| Meta | mono 400, 12px | Mono because meta is almost always numbers or dates. |
| Micro-label `.lbl` | mono 500, 10.5px, ls 0.13em, uppercase | The **only** tracked, uppercase type in the system. Rationing it keeps it meaning "this is a label". |
| Terminal | mono 400, 13px, lh 1.62, ligatures off | 1.62 because real terminals are loose; ligatures off because real terminals mostly are. |

Sizes used: 9, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16.5, 17, 26, 27, 56, 96. The
cluster between 11 and 15 is deliberate: this is a dense product and the information
hierarchy is carried by colour and weight, not by size jumps.

---

## 3. Colour

The accent is earned from the product's logic, not picked from a palette.

The product exists to tell you a thing has rotted. **Rust is what happens to things nobody
maintains.** So rust is the brand accent, the downvote, the reason tag and the failing end
of the trust ramp — all one colour, because they are all one idea. Blue-steel is the
opposite end, and amber is the middle. Blue/orange is also the safest pair for colour
vision deficiency, which matters because the six-cell signal strip encodes state in colour.

Green is absent on purpose: green means "pass", and a trust score of 58 is not a pass or a
fail, it is a measurement.

### Light

| Token | Hex | Role and reason |
|---|---|---|
| `--paper` | `#FBFAF6` | Page ground. Warm, not `#FFF` and not cool grey — the single cheapest way to not look like every other dev tool. |
| `--surface` | `#FFFFFF` | Row and panel ground. Rows are brighter than the page so the list reads as a sheet. |
| `--sunk` | `#F2EFE7` | Table headers, recessed strips, hover. Recessed, never raised — there are no shadows. |
| `--rule` | `#E2DCD0` | Hairline between rows. Warm, so it disappears into the paper. |
| `--rule-hard` | `#C8BFAD` | Outer edges and column rules. The structural line. |
| `--ink` | `#16150F` | Body text. Warm near-black, 17.5:1. Not `#000`, which vibrates on warm paper. |
| `--ink-2` | `#4A463C` | Prose and descriptions, 9.0:1. One step back so identifiers win. |
| `--ink-3` | `#6B6557` | Meta, labels, owner names, 5.6:1. The floor — nothing is lighter than this. |
| `--rust` | `#B4441C` | Accent: logo, downvote, flags, active underline, the strip's failing cell. 5.3:1. |
| `--rust-ink` | `#8E3514` | Rust text on rust tint, 6.6:1. The accent alone is not legible on its own tint. |
| `--rust-tint` | `#F7E8E1` | Reason tag ground. |
| `--rust-rule` | `#E8C7B7` | Reason tag border. |
| `--steel` | `#1D5B85` | The holding end of the trust ramp; upvote. 7.0:1. A data colour, used as UI only for the upvote. |
| `--steel-tint` / `--steel-rule` | `#E3EDF4` / `#BBD2E1` | "Works as described" tag. |
| `--amber` | `#87620F` | The middle of the ramp: slowing, not dead. 5.3:1. Deliberately an olive-ochre, not a warning yellow — this is a slope, not an alarm. |

### Dark

Not an inversion. The paper goes to a warm near-black and every accent is re-chosen for the
new ground; nothing is a filter or an `opacity`.

| Token | Hex | Contrast on `--paper` |
|---|---|---|
| `--paper` | `#131210` | — |
| `--surface` / `--sunk` | `#191714` / `#201D19` | — |
| `--rule` / `--rule-hard` | `#2F2B25` / `#4A443A` | — |
| `--ink` / `--ink-2` / `--ink-3` | `#EFE9DC` / `#B5AD9D` / `#8E8777` | 15.5 / 8.4 / 5.2 |
| `--rust` / `--rust-ink` / `--rust-tint` | `#E67A4F` / `#F09166` / `#2C1C14` | 6.5 / 7.0 on tint |
| `--steel` / `--steel-tint` | `#6FB3DC` / `#121E27` | 8.2 / 7.4 on tint |
| `--amber` | `#D8A93F` | 8.6 |

Terminal has its own closed set (`--t-*` on `.term-page`), because a terminal is not the
site: `#0E0D0B` ground, `#D6D0C4` foreground, with rust/steel/amber re-tuned for a pure
black-ish field. Lowest ratio in it is 4.75:1.

**Theme mechanics.** The complete light palette is defined on bare `:root`. Dark is defined
twice: once under `@media (prefers-color-scheme: dark)` guarded as
`:root:not([data-theme="light"])`, and once under `:root[data-theme="dark"]`, so an explicit
toggle wins in both directions. No colour exists only inside a media query. `body` always
carries an explicit background.

**Contrast.** Every body-copy pair is ≥ 4.5:1 in both themes. Lowest measured in the whole
system is 4.70:1 (`--ink-3` on `--sunk`, dark).

---

## 4. Spacing, density, borders

**Scale:** 2, 4, 6, 8, 10, 12, 14, 18, 22, 26, 40, 52. A 4-ish base with half-steps,
because at 12–13px type a 4px jump is a visible change and an 8px grid wastes a third of
the screen.

**Density rules**

- A feed row is 11px of vertical padding and carries four bands: identity, description,
  reasons, agents. Nothing gets a fifth.
- Descriptions are clamped to two lines. The reason line is the differentiator; it must not
  be pushed down by prose.
- The per-row `½ / 6mo` decay note was removed in round two. Facts true of every row belong
  in the statement bar, once.
- Tables use 7px row padding and hairline rules. No zebra striping — the rule is enough and
  striping would introduce a second ground colour.
- Gutters are 20px on `.wrap`, 14px below 520px. Any modifier on `.wrap` must use
  `padding-block`, never the `padding` shorthand, or it silently eats the gutter.

**Borders and radius**

- `border-radius: 0` everywhere. No exceptions, including buttons, tags, inputs and the
  vote control. This single rule does more than any other to stop the page reading as a
  framework default.
- `box-shadow` is used once, as `inset 0 -2px 0` for an active-tab underline. There is no
  drop shadow in the system. Elevation is expressed by ground value, not by blur.
- 1px borders only. Two weights: `--rule` inside a component, `--rule-hard` around it.
- The one dashed border in the system is the cold-start "no reports yet" box: dashed means
  "nothing is here yet", which is exactly what it says.

---

## 5. Iconography

No icon library, no emoji, no line-art set.

| Mark | Form | Reason |
|---|---|---|
| Vote | Two SVG triangles, 15×9, solid fill, `currentColor` | The universal vote grammar. Solid, not outlined, so they hold at 9px. |
| Agent status | `✓` `✗` `?` text glyphs | Three states need three characters, not three pictures. `?` is a first-class state: unknown is not the same as works. |
| Logo | A 9×14px rust rectangle before the wordmark | A block, not a glyph. Reproduces at any size, in a favicon, and in a terminal. |
| Trust signal | Six 7px cells, flat fill, 2px gaps | The score's six inputs, in order, as a data mark. Explained once by a key above the list, not repeated per row. |
| Reason distribution | A single stacked 10px bar | The only chart on the site. |

---

## 6. The two marks that carry the product

**The reason tag.** Rust tint, rust rule, rust text, count in bold mono, label in regular.
It appears on the landing fold, on every feed row, on every search result, on the item
page, in the vote composer and in the terminal. If you remember one object from the
interface, it is this one, and that is the intent: the mandatory reason *is* the product.

**The signal strip.** Six cells: last push, releases, archived/deprecated flags, advisories,
issue load, licence. Steel holds, amber slips, rust fails. It gives a cold-start repo with
no votes something to show, and it is the visual proof of "computed, no human input".

---

## 7. Interaction

- Focus: `2px solid var(--rust)` with 2px offset. Visible on every control, in both themes.
- Hover on a row: ground moves to `--sunk`. Nothing lifts, nothing scales, nothing fades.
- Hover on a repo link: a 2px rust underline at 3px offset. Links are ink; rust is what
  happens when you reach for them.
- The downvote button is labelled "Downvote, reason required". The composer shows the five
  reasons before the submit button and the submit button cannot be the first thing you
  reach. The constraint is in the interface, not in a validation message.

## 8. Build

Six self-contained HTML files. Inline CSS, no build step, no runtime CDN. Both variable
fonts are embedded as base64 latin subsets (~103KB total per file), so the typography
survives being opened from a file path, emailed, or screenshotted on a machine that has
neither font installed.
