# reppit — market size (TAM / SAM / SOM)

Built 8 October 2026. Every input is sourced or labelled as a judgement call.
These are models, not forecasts. The honest use of this document is to argue with the
assumptions, not to quote the answer.

## Short version

| | Size | What it means |
|---|---|---|
| **TAM** | **$4.4B/yr** | Every professional developer paying a per-seat price for tool-selection intelligence |
| **SAM** | **$530M/yr** | Developers who use coding agents weekly, choose their own dependencies, and sit in markets that pay for dev SaaS |
| **SOM (3 yr)** | **$580K ARR** | What a solo builder with open-core distribution plausibly captures |

The honest range on SOM is wide: **$100K if this behaves like a directory, $580K if the
agent channel works, $1.5M+ if it compounds the way skills.sh did.** Which one happens is
decided almost entirely by distribution inside coding agents, not by the website.

---

## Inputs

| Input | Value | Source |
|---|---|---|
| Developers worldwide | 47.2M | SlashData global population tracker |
| Professional developers | 36.5M | SlashData, early 2025 |
| Use AI coding agents at work weekly | 90% | JetBrains / industry surveys 2026 |
| Use them daily | 68% | same |
| Use 2 to 4 AI tools at once | 70% | same |
| GitHub Copilot users | 20M+ | Reported, consumer and enterprise |
| Cursor active users | 5M+ | Reported |
| Claude Code work adoption, mid-2026 | 39% | JetBrains, up from 18% in January |
| npm packages | 2.5M+ | npm registry |
| DevTools freemium conversion | 1–4% typical, 7%+ top quartile | SaaS benchmark reports |
| GitHub pre-acquisition paid ratio | 2.7M paid / 28M free (~10%) | Reported, described as exceptional |

### Comparables that anchor the revenue model

| Company | What it earns | Why it is relevant |
|---|---|---|
| OpenAlternative | ~$6.5K/mo ($80K/yr) on 70K monthly visitors; 65% sponsorship, 35% listings at $197/mo | A solo-run OSS directory. The floor case. |
| Context7 (Upstash) | $10/seat/mo, free tier 1,000 calls/mo, 30+ clients | The open-core template. Proves per-seat pricing for in-agent context. |
| RepoHunt.dev | $19.99/mo for 500 searches | Proves people pay for natural-language repo search with no community layer at all. |
| ClawHub | Paid skills $10–200, ~80% creator share | Proves a creator marketplace clears. |
| skills.sh | ~670K skills, top skill at 2M installs | Proves the scale of the in-agent distribution channel. |

---

## TAM — $4.4B/yr

36.5M professional developers × $120/yr ($10/seat/mo, the Context7 price) = **$4.38B**.

This is the "everyone pays" ceiling. It is not reachable and no plan should assume it.
It is useful only to show the category is large enough that capturing a rounding error
of it is still a real business.

## SAM — $530M/yr

Narrowed from TAM in three steps. Steps 2 and 3 are judgement calls, flagged as such.

| Step | Multiplier | Remaining | Reasoning |
|---|---|---|---|
| Professional developers | — | 36.5M | SlashData |
| Use coding agents weekly | × 90% | 32.9M | Measured. This is the near-universal part. |
| In markets and roles that pay for dev SaaS | × 30% | 9.9M | **Judgement.** Global dev population is concentrated in regions where per-seat SaaS rarely sells. Weighted to US, EU, UK, Canada, Australia plus enterprise elsewhere. |
| Actually select dependencies and tools | × 45% | 4.4M | **Judgement.** Most developers inherit a stack. The buyer is the person who adds the dependency: seniors, leads, platform teams, solo builders. |

4.4M × $120/yr = **$530M/yr**.

If you think the 30% is pessimistic or the 45% is generous, move them. At 40% and 35% the
SAM is $550M, so the answer is not sensitive to these within reasonable ranges.

## SOM — $580K ARR by year three

Bottom-up, three revenue lines, built from the comparables rather than from a share of SAM.

### Year 1 — prove the channel

| Line | Assumption | Revenue |
|---|---|---|
| Paid API seats | 5K free API users, 2.5% convert = 125 seats at $10/mo | $15K |
| Sponsorship | 30K monthly visitors at OpenAlternative's rate of ~$0.06/visitor/mo | $21K |
| Teams | 2 early teams at $200/mo | $5K |
| **Total** | | **~$41K ARR** |

### Year 2 — the agent channel compounds

| Line | Assumption | Revenue |
|---|---|---|
| Paid API seats | 25K free users, 3% convert = 750 seats at $10/mo | $90K |
| Sponsorship | 150K monthly visitors | $60K |
| Teams | 12 teams at $250/mo | $36K |
| **Total** | | **~$186K ARR** |

### Year 3 — a real business

| Line | Assumption | Revenue |
|---|---|---|
| Paid API seats | 60K free users, 3% convert = 1,800 seats at $12 blended | $259K |
| Sponsorship | 400K monthly visitors, discounted off linear | $144K |
| Teams | 50 teams at $300/mo | $180K |
| **Total** | | **~$583K ARR** |

The 3% conversion sits inside the measured devtools freemium band of 1–4%. It is not an
aggressive number. The aggressive number is the traffic.

### Three scenarios, because one number is a lie

| Scenario | Year 3 ARR | What has to be true |
|---|---|---|
| **Floor** | $100–120K | The agent channel never works. This becomes a good OSS directory and lands near OpenAlternative's $80K, plus a little API revenue. |
| **Base** | $580K | The skill and MCP server get tens of thousands of installs and pull people back to the site. The table above. |
| **Upside** | $1.5–2M | Install counts compound the way skills.sh did, teams adopt the allowlist for dependency governance, and the creator marketplace opens. |

---

## Where the money actually is, ranked

1. **Teams, not individuals.** 50 teams at $300/mo outearns 1,800 individuals at $12/mo
   with a fraction of the support load. The pitch is not discovery, it is governance:
   an approved-dependency allowlist that agents actually consult before adding a package.
   Developers will not pay much for search. A platform lead will pay to stop an agent
   pulling in an unvetted package.
2. **Sponsorship.** Proven at this exact shape by OpenAlternative, 65% of their revenue.
   Needs traffic and nothing else. The constraint is editorial, not technical: it must
   never touch rank.
3. **Per-seat API.** Steady, low, and mostly a conversion path into teams.
4. **Creator marketplace.** Real but later. ClawHub proves it clears, and the documented
   resentment at MCP directories that pay creators nothing is a wedge worth holding.

## The number nobody puts in a model

The user's stated goal is acquisition. Dev tools trade at roughly 5–15x ARR, so the base
case is a **$3–9M outcome**. But the asset an acquirer wants is not the ARR, it is the
dataset: per-agent compatibility reports and reason-tagged quality signals on repos and
skills exist nowhere else. GitHub, Vercel and the agent vendors all have a ranking problem
and none of them has human judgement data to solve it with.

That dataset only becomes valuable if real people vote. Which is why the free tier should
stay generous for longer than is comfortable.

## Biggest risks to these numbers

- **skills.sh adds voting.** They have the installs and the distribution. Mitigation is
  covering repos and libraries too, and owning cross-agent compatibility, which their
  install-count model structurally cannot produce.
- **Traffic assumptions are the weak link.** Every revenue line keys off visitors and
  installs. The conversion rates are benchmarked; the traffic is hoped for.
- **Sponsorship needs an audience before it pays anything.** Year 1 sponsorship revenue
  is close to zero in practice, whatever the model says.
- **Teams need trust and a sales motion.** The highest-value line is the one a solo
  builder is least equipped to sell.
