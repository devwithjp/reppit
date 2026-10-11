# reppit — v1 wireframes

Low fidelity, greyscale, structural. These pin down layout and flow, not visual design. The visual
design is in `docs/design/*.html` and `docs/design/design-system.md`.

Each HTML file is self-contained (inline CSS, no external requests) and responsive. Screens are rendered
twice: `-desktop.png` at 1440 wide and `-phone.png` at 400 wide. Flows are desktop only.
Numbered black circles are callouts. The legend at the bottom of each sheet maps them to feature IDs in
`docs/product/feature-list.md`.

Conventions: solid box = element, dashed box = alternate state, empty state or note (not UI), mid-grey
fill = primary action or emphasis. Signal strip cells: black holds, grey slipping, outline failing,
dotted unknown.

## Screens

| File | PNGs | What it shows |
|---|---|---|
| `landing.html` | `landing-desktop.png`, `landing-phone.png` | Signed-out landing: claim, search, reason taxonomy, three pieces of evidence, MCP install line. |
| `feed.html` | `feed-desktop.png`, `feed-phone.png` | Feed with Hot/Top/New, kind tabs, signal key, rows, an open downvote reason picker, a zero-vote row. |
| `search.html` | `search-desktop.png`, `search-phone.png` | Search results with read-as chips, why lines, facts line, flags, plus zero-result, weak, 429 and short-query states. |
| `item.html` | `item-desktop.png`, `item-phone.png` | Item page: install, read-only vote summary, trust panel, reports, agent table, vote and compat composers. |
| `item-cold-start.html` | `item-cold-start-desktop.png`, `item-cold-start-phone.png` | Item page with no votes: hero score, one unknown signal, empty reports, all agents unknown. |
| `submit.html` | `submit-desktop.png`, `submit-phone.png` | Submit a repo, with already-indexed, malformed, not-found, limit, signed-out and working states. |
| `signin.html` | `signin-desktop.png`, `signin-phone.png` | Password sign-in and "email me a link", with error, sent, throttled and expired states. |
| `signup.html` | `signup-desktop.png`, `signup-phone.png` | Sign up with handle, email, password and consent, plus check-your-email and error states. |
| `account.html` | `account-desktop.png`, `account-phone.png` | Account: vote weight, your votes with Withdraw, reports, submissions, password, data export, delete, sign out. |
| `404.html` | `404-desktop.png`, `404-phone.png` | 404 with not-indexed submit prompt and search, plus the 500 variant. |

## Flows

| File | PNG | What it shows |
|---|---|---|
| `flow-first-vote.html` | `flow-first-vote.png` | (a) First visit to first vote, including sign-in on demand and the forced reason on a downvote. |
| `flow-mcp-install.html` | `flow-mcp-install.png` | (b) Agent asks reppit via MCP, the user installs the result, then reports compatibility. |
| `flow-signup-magic-link.html` | `flow-signup-magic-link.png` | (c) Sign up with email confirmation, the magic-link path, and password sign-in. |

## Re-rendering

```
google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --screenshot=OUT.png --window-size=1440,5000 --virtual-time-budget=2000 file:///ABS/PATH.html
```

Use `--window-size=400,9000` for phone, then trim the white space below the content. The PNGs here were
trimmed to content height plus 24px.
