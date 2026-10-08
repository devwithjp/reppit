# Phase 1 — Name and brand foundation

Checked 8 October 2026. Every result below is reproducible with the commands in
the last section. Nothing here is guessed.

## Recommendation

**reppit** — ship as `reppit.dev`, npm package `reppit`, GitHub org `reppit-dev`.

It beats the runner-up because npm is the namespace that actually matters for this
product and reppit owns it outright, while repit's npm name is held by a dormant package.

---

## The finding that shaped everything

Twelve single-word English candidates were checked on npm first: vouch, cosign, tally,
quorum, verdict, attest, reckon, sift, vetted, warrant, shortlist, dependably.

**Eleven of twelve were taken.** Only "dependably" was free, and it is three syllables
and awkward to say. npm is saturated; bare dictionary words are gone. Coined names are
the only realistic path, which is what moved the search to reppit and its family.

This matters more than it sounds. The CLI and the MCP server both ship as npm packages.
`npx reppit find "parse pdf tables"` has to work on day one. A name whose npm package is
held by someone else is not a name, it is a future dispute.

---

## Evidence table

FREE means verified unregistered. For domains this is RDAP registry data, not a DNS
lookup, because an unused domain still resolves to nothing while being firmly owned.

| Name | npm | GitHub | .com | .dev | .io | .sh | .app |
|---|---|---|---|---|---|---|---|
| **reppit** | **FREE** | taken (dormant) | taken | **FREE** | **FREE** | **FREE** | taken |
| repit | taken | taken (empty org) | taken | FREE | FREE | FREE | taken |
| repvote | FREE | **FREE** | taken | FREE | FREE | FREE | — |
| vouchit | FREE | taken | taken | FREE | FREE | FREE | — |
| cosignal | taken | taken | taken | FREE | FREE | FREE | — |
| vouch, cosign, tally, quorum, verdict, attest, reckon, sift, vetted, warrant, shortlist | all taken | — | — | — | — | — | — |
| dependably | FREE | — | — | — | — | — | — |

### Who holds the blocked namespaces

- **npm `repit`** — `bredele/repit` v0.1.2, "Repeat a DOM element once per item into a
  datastore", last published 26 June 2022. Dormant but owned. npm's dispute process for
  an unmaintained-but-published package is slow and the outcome is not in our control.
- **GitHub `repit`** — an Organization created April 2020 with 0 public repos. Squatted.
- **GitHub `reppit`** — a User account created October 2015, 2 public repos, 0 followers,
  no name or bio set. Dormant. GitHub's inactive-username policy may release it on
  request, but the plan does not depend on that.

### GitHub org fallbacks, all verified free

`reppit-dev`, `reppitapp`, `getreppit` are free. `reppithq` is taken.
For repit: `repit-dev`, `getrepit`, `repitdev`, `repitapp` are all free.

### Not verified

The X handle. X returns HTTP 200 for its app shell whether or not a handle exists, so it
cannot be checked reliably without authenticating. **Check `@reppit` manually before
announcing anything.** If it is gone, `@reppitdev` is the fallback and does not weaken
the brand.

No trademark search was run against a registry database. For a pre-revenue dev tool the
risk is low, but run one before taking money.

---

## Why reppit, specifically

**It owns the namespace that counts.** npm free. The package name, the CLI binary and the
MCP server all line up with no asterisk.

**"Rep" is the product.** Reputation, earned from people who actually used the thing. The
name says what the thing does without needing a tagline to rescue it.

**The reddit echo is deliberate.** Positioning is "Reddit, but for repos". A name that
rhymes with reddit does that work before a single word of copy is read. It also serves
the stated goal of looking acquirable: a name and interface that read as a natural
extension of an existing community product are easier for an acquirer to picture owning.

**.dev is right for this audience.** .com is taken, and for a developer tool .dev costs
nothing in credibility. Several well-known dev products ship on .dev by choice.

## The one real weakness, and the fix

Double "p" invites a spelling mistake. Someone hears it and types `repit.dev`.

`repit.dev` is free. **Register both and redirect repit.dev to reppit.dev.** That turns
the weakness into a caught typo for the price of one extra domain. Do this at the same
time, not later, because repit.dev is attractive to the same kind of project.

## Why not the runners-up

**repvote** is the only candidate with a completely clean namespace including GitHub, and
that is genuinely tempting. It loses because it is a description rather than a name. It
nails the mechanic to "voting", which is one feature, and leaves no room for the reason
tags, the compatibility reports or anything added later. Names that describe the v1
feature set age badly.

**repit** is the better-looking word and the user's own instinct, which is worth something.
It loses on npm, and on this product that is close to disqualifying. It also reads two
ways: "rep it" or "re-pit". Reppit only reads one way.

---

## To do before Phase 2 closes

1. Register `reppit.dev` and `repit.dev` together.
2. Claim npm `reppit` immediately, even with an empty placeholder package. It is free
   right now and it is the one thing that cannot be worked around.
3. Create GitHub org `reppit-dev`.
4. Check `@reppit` on X by hand and claim it or `@reppitdev`.
5. Open a GitHub inactive-username request for `reppit`. Treat it as upside, not a plan.

## Reproducing these checks

```bash
# npm
npm view <name> name

# GitHub (404 means free)
curl -s -o /dev/null -w '%{http_code}' https://api.github.com/users/<name>

# Domain registration, authoritative (404 means unregistered)
curl -sL -o /dev/null -w '%{http_code}' https://rdap.org/domain/<name>.dev
```

rdap.org rate-limits and redirects. Follow redirects with `-L` and pace the calls about
two seconds apart or you will read a 429 as a result.
