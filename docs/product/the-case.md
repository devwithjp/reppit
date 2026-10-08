# The case: does the data actually support it?

**Argument under test:** *AI coding tools caused an explosion in both the volume of code written and the number of packages and repositories published. Discovery and quality signals did not keep up. The GitHub star measures past popularity rather than current health. Therefore a curation and recommendation layer is now needed in a way it was not five years ago.*

**Verdict in one line:** the *volume* half of the argument is well supported, the *signal failure* half is well supported, and the *causal* half — that AI specifically caused the explosion — is **not** supported by the growth-rate data. The honest version of this argument is "the absolute volume is now past what human curation can cover, and the signals were already broken before AI," not "AI broke everything."

Compiled 8 October 2026. Registry counts marked **(API)** were pulled directly from the registries on that date.

---

## What the data supports

- **The absolute volume of new repositories is at a level no human can triage.** GitHub added **121 million new repositories** in the year to 31 Aug 2025 — about **230 per minute** — reaching 630M total and 395M public. ([GitHub Octoverse 2025](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/))
- **Package registries are now in the millions and are mostly not fresh.** npm holds **4,464,731** registry documents, PyPI **907,001** projects, crates.io **347,256** crates (all API, 8 Oct 2026). In commercial codebases, **93% contain at least one "zombie" component** with no development activity in two years, and **only 7% of components in use are the latest version**. ([Black Duck OSSRA 2026](https://www.blackduck.com/blog/open-source-trends-ossra-report.html), 947 codebases, 25 Feb 2026)
- **Stars do not measure maintenance, and this is measured, not asserted.** Spearman correlation between a project's **Level of Maintenance Activity (LMA) and its star count is ρ = 0.10** — "very weak", p < 0.01. For comparison the same study finds LMA correlates with core contributors at ρ = 0.15, with size at ρ = 0.38 and with total contributors at ρ = 0.44. It names a project with **50,034 stars and LMA = 8**. Verbatim: *"it is common to have highly popular projects, by number of stars, presenting both low and high LMA values."* Caveat: the dataset is GitHub as of November 2017, so it establishes that stars never tracked maintenance, not that this got worse recently. ([Coelho et al., *Is this GitHub Project Maintained?*](https://arxiv.org/pdf/2003.04755)) Separately, **4.53M suspected fake stars** (3.1M after false-positive filtering) were found across 15,835 repos, with fake-star activity surging in 2024. ([He et al., arXiv:2412.13459](https://arxiv.org/abs/2412.13459))
- **Adoption of AI coding tools is effectively universal, and trust in their output is not.** **83%** of developers use AI tools and **73% of coding-assistant users use them daily**, but only **6.6%** would trust AI for important decisions and **48%** trust it only when they can validate the answer themselves. ([Stack Overflow Developer Survey 2026](https://survey.stackoverflow.co/2026/ai)) That gap between use and trust is the demand for a verification layer, stated by developers themselves.

---

## What the data does not support

This section is the important one. Four things the argument wants are not in the data.

**1. AI did not accelerate the rate of repository creation.** This is the biggest problem for the argument. GitHub's own year-over-year public-repository growth:

| Octoverse year | Public repos | YoY |
|---|---|---|
| 2023 | 284M | +22% |
| 2024 | ~332M (derived from the 2025 report's +19%) | ~+17% |
| 2025 | 395M | +19% |

The growth *rate* is flat to slightly down across exactly the window in which AI coding tools went from niche to universal. Absolute additions rose (108M new repos in 2024 → 121M in 2025) because the base is bigger, but there is no inflection. **"AI caused an explosion in repositories published" is not visible in GitHub's own numbers.** What is defensible: the volume is enormous and compounding, and it was already enormous before AI.

**2. Duplication on GitHub massively pre-dates AI.** The DéjàVu study found **70% of files on GitHub were clones of previously created files**, and only **6% of JavaScript files were distinct** — published in **2017**. ([Lopes et al., OOPSLA 2017](https://janvitek.org/pubs/oopsla17b.pdf)) Any claim that AI created the duplicate-repo problem is wrong. GitClear's within-repo finding (duplicated blocks up 81%, refactoring down 70%, 2023–2026) is real but it is a vendor's own dataset and it measures code inside repos, not duplicate repos.

**3. Package hallucination is getting better, not worse.** The headline slopsquatting number — **19.7% of recommended packages did not exist**, 5.2% commercial / 21.7% open-source ([Spracklen et al., USENIX Security 2025](https://www.usenix.org/publications/loginonline/we-have-package-you-comprehensive-analysis-package-hallucinations-code), 576,000 samples) — has been superseded. A 2026 replication on frontier models found **4.62%–6.10%** across Claude Haiku 4.5, Claude Sonnet 4.6, GPT-5.4-mini, Gemini 2.5 Pro and DeepSeek V3.2. ([arXiv:2605.17062](https://arxiv.org/abs/2605.17062)) Quoting the 19.7% figure in 2026 would be a stretched number and a fact-checker will catch it. The residual risk is real but narrow: **127 package names hallucinated identically by all five models, 53 still registrable.**

**4. Fake stars are a rounding error at ecosystem scale.** 4.53M suspected fake stars against **610M stars** total in the same dataset is **~0.74%**, concentrated in 15,835 repos out of 310M. Star *fraud* is not why stars fail. Star *staleness* is. Lead with the ρ=0.10 correlation, not the fake-star number.

**Also unsupported, by absence:** I could not find any independent, methodologically transparent measurement of vibe-coded app abandonment. Widely circulated figures ("63% of vibe coders abandoned their projects at month three", "46% of all new code is AI-generated", "92% of US developers use AI daily", "$4.7B vibe coding market") trace back to SEO marketing blogs with no stated methodology. **Treat all of them as unverified.** The absence of measurement here is itself weak evidence that the vibe-coding quality crisis is currently a narrative rather than a finding.

**Counter-evidence that discovery is improving:** deps.dev aggregates OpenSSF Scorecard across npm, PyPI, Maven, Go and Cargo; PyPI reports **20% of all file uploads now via trusted publishing** and **52% of active users on non-phishable 2FA** ([PyPI 2025 in review](https://blog.pypi.org/posts/2025-12-31-pypi-2025-in-review/)); the Linux Foundation announced **$12.5M** in open-source security grants (March 2026) and GitHub Sponsors passed **$100M** (July 2026). A curation layer is entering a field that is getting more crowded, not an empty one.

---

## Every statistic

| Number | What it measures | Source | Date | Confidence |
|---|---|---|---|---|
| 630M | Total GitHub repositories | GitHub Octoverse 2025 | Oct 2025 (period to 31 Aug 2025) | High (platform's own data, but unaudited) |
| 395M, +19% YoY | Public / open source repos | GitHub Octoverse 2025 | Oct 2025 | High |
| 121M | New repos created in the year | GitHub Octoverse 2025 | Oct 2025 | High |
| ~230/min | New repos per minute (derived from 121M) | GitHub Octoverse 2025 | Oct 2025 | High |
| 284M, +22% YoY | Public repos, prior cycle | GitHub Octoverse 2023 | Nov 2023 | High |
| 518M total, 108M new | Repos, prior cycle | GitHub Octoverse 2024 | Oct 2024 | High |
| ~332M, ~+17% | Public repos Aug 2024 | **Derived** from Octoverse 2025's +19% | — | Medium (derived, not published) |
| 180M+ developers, 36.2M new | GitHub accounts | GitHub Octoverse 2025 | Oct 2025 | Medium (accounts ≠ people) |
| 4.3M AI repos; 1.1M+ repos using LLM SDKs (+178% YoY) | AI-related repos | GitHub Octoverse 2025 | Oct 2025 | Medium (classification method not published) |
| 4,464,731 | npm registry documents | npm replication endpoint **(API)** | 8 Oct 2026 | High |
| 907,001 | PyPI projects | PyPI simple index **(API)** | 8 Oct 2026 | High |
| 347,256 | crates.io crates | crates.io `/api/v1/summary` **(API)** | 8 Oct 2026 | High |
| 130,000+ | New PyPI projects in 2025 | PyPI 2025 in review | 31 Dec 2025 | High (registry's own) |
| 10,518,566 published / 1,241,583 unpublished | npm package *versions* in 2023 | Socket npm retrospective | Dec 2023 | Medium (vendor, but reproducible) |
| 15,000+ spam packages in 2 days | npm spam campaign, Feb 2023 | Socket npm retrospective | Dec 2023 | Medium |
| 83% use AI; 65.9% use coding assistants/agents; 73% of those daily; 31% of daily users 4+ hrs/day | Developer AI adoption | Stack Overflow Dev Survey 2026 | Oct 2026 | High (n≈13.8k on sub-questions; self-selected sample) |
| 6.6% trust AI for important decisions; 48% trust only when validatable | Developer trust | Stack Overflow Dev Survey 2026 | Oct 2026 | High |
| 84% use AI; 51% of pros daily; 29% trust accuracy (down from 40%) | Prior-year comparison | Stack Overflow Dev Survey 2025 | Jul 2025 | High |
| 90% use AI at work; ~30% little/no trust in AI code | AI adoption | Google DORA, *State of AI-assisted Software Development 2025* (n≈5,000) | Sep 2025 | Medium-High |
| 85% of orgs use AI coding assistants; 76% of orgs that prohibit them see use anyway | AI adoption | Black Duck OSSRA 2026 | Feb 2026 | Medium |
| "As much as 30%" of Microsoft code written by AI | AI share of code | Nadella, LlamaCon, via [CNBC](https://www.cnbc.com/2025/04/29/satya-nadella-says-as-much-as-30percent-of-microsoft-code-is-written-by-ai.html) | Apr 2025 | **Low** (CEO claim, no methodology) |
| "Well over 30%" → "75%" of new code at Google | AI share of code | Pichai, earnings calls, secondhand press | 2025 | **Low** (the 75% figure is secondhand; unverified) |
| 46% of all new code is AI-generated | AI share of code | Marketing blogs, no primary source | 2026 | **Unverified — do not use** |
| 19.7% of recommended packages did not exist (5.2% commercial / 21.7% OSS), 205,474 unique hallucinated names, 576k samples, 16 models | Package hallucination | Spracklen et al., USENIX Security 2025 | Aug 2025 | High (peer-reviewed) — **but superseded** |
| 4.62%–6.10% hallucination rate; 199,845 prompts; 127 names hallucinated by all 5 models, 53 still registrable | Package hallucination, 2026 models | arXiv:2605.17062 | 2026 | Medium-High (preprint, not peer-reviewed) |
| 36.70%–55.70% of LLM-specified library versions carry a known CVE | LLM dependency version choice | arXiv:2605.06279, 10 LLMs, 1,000 tasks | 2026 | Medium (preprint) |
| 27.8% of 36,780 AI dependency-upgrade suggestions were nonexistent, deprecated or unsafe | AI dependency suggestions | Codacy blog | 2026 | **Low** (vendor marketing) |
| 4.53M suspected fake stars (3.1M after filtering), 1.32M accounts, 22,915 repos (15,835 filtered), out of 610M stars / 310M repos, 2019–2024 | Star fraud | He et al., arXiv:2412.13459 (Socket + CMU + NCSU) | Dec 2024 | High |
| ρ = 0.10 maintenance-activity vs stars (0.15 vs core contributors, 0.38 vs size, 0.44 vs contributors); 50,034-star project with LMA of 8; unmaintained projects avg 1,714 stars vs 4,078 active | Stars vs maintenance | Coelho et al., arXiv:2003.04755 | 2020 | High (peer-reviewed; pre-dates AI era) |
| Top 1% of repos hold 33.0% of all stars; top 10% hold 67.6% | Star concentration | *Understanding the Factors that Impact the Popularity of GitHub Repositories* (arXiv:1606.04984) | 2016 | Medium (old) |
| 70% of GitHub files are clones; 94% of JS files non-distinct; 4.5M projects, 428M files | Repo/file duplication | Lopes et al., DéjàVu, OOPSLA 2017 | 2017 | High (peer-reviewed; **pre-AI**) |
| Duplicated code blocks +81%, moved/refactored code −70%, 623M changes 2023–2026 | Within-repo duplication | GitClear + GitKraken, *Maintainability Gap* | 2026 | **Low-Medium** (vendor's own dataset; directionally consistent across years) |
| Copy/pasted lines 8.3% → 12.3%; refactored lines 25% → <10% (2021→2024); 211M lines | Within-repo duplication | GitClear 2025 research | Feb 2025 | **Low-Medium** (vendor) |
| 93% of codebases contain zombie components (no activity 2 yrs); 92% contain components 4+ yrs out of date; only 7% of components are latest | Dependency staleness | Black Duck OSSRA 2026, 947 codebases | 25 Feb 2026 | Medium (vendor, but audit-based with stated n) |
| Mean 581 vulnerabilities per codebase, +107% YoY; files per codebase +74%; components +30% | Codebase risk and size | Black Duck OSSRA 2026 | Feb 2026 | Medium (vendor) |
| 8.2% of top-50k npm packages officially deprecated; 21.2% under the broadest definition; 2.1B weekly downloads of deprecated packages | npm deprecation | Aqua Nautilus | 2023 | Medium (vendor, methodology published) |
| 454,600+ new malicious packages in 2025 (+75% YoY); 1.233M cumulative; 89% logged in Q4 2025 | Supply chain malware | Sonatype, *State of the Software Supply Chain* 2026 | 2026 | **Low-Medium** (vendor; the Q4 spike suggests a detection-method change, not a 476% real-world surge) |
| 36% relative increase in high-severity + high-exploitability flaws (8.3% → 11.3%) | Vulnerability severity mix | Veracode *State of Software Security 2026* | 2026 | Medium (vendor) |
| Ruby 95.3% / Scala 92.8% / Zig 49.4% of repos with no push in 12 months; JS 77.7% overall vs 38.9% of top-starred | Repo abandonment by language | hostkey.com blog, GitHub Search API, 20 languages | 14 May 2026 | **Low** (blog; Search API sampling is not a census; archived repos not excluded) |
| 20% of PyPI uploads via trusted publishing; 52% of active users on non-phishable 2FA; 2,000+ malware reports, 66% handled <4 hrs | Registry security posture | PyPI 2025 in review | Dec 2025 | High |
| $12.5M Linux Foundation OSS security grants; GitHub Sponsors past $100M | Ecosystem investment | PRNewswire Mar 2026; Help Net Security Jul 2026 | 2026 | Medium |
| Lovable: 60M projects, 1M/week, 8M users; Replit: 450M projects, 5M AI-generated apps | Vibe-coding volume | Company statements via press | 2026 | **Low** (vendor marketing; "project" is undefined and almost certainly not comparable to a repo) |
| GitHub Copilot 26M+ users / 4.7M paid; Cursor 3M WAU, $4B ARR; Claude Code $2.5B run-rate | Tool adoption | Company statements via press aggregators | 2026 | **Low** (vendor claims, inconsistent across aggregators) |
| 63% of vibe coders abandon projects at month three; 45% of AI code fails security testing; $4.7B market | Vibe-coding quality | SEO marketing blogs, no primary source | 2026 | **Unverified — do not use** |

---

## Five numbers worth drawing

1. **230 new repositories per minute** (Octoverse 2025, 121M/year). Concrete and absurd on a human scale. Draw it as a ticking counter against "repositories one person could review per minute: ~1" — the ratio is the point, not the 121M.
2. **93% of commercial codebases contain a zombie dependency / only 7% of components in use are the latest version** (OSSRA 2026). The strongest single number in the whole file: it is independent of the AI argument, it is audit-based, and it is already a before-and-after shape. Draw as two stacked bars, 93 vs 7, same chart.
3. **ρ = 0.10 — the correlation between a project's maintenance activity and its star count** (Coelho et al.). Draw as a scatter plot that is visibly a cloud, with the 50,034-star / maintenance-level-8 project circled. This is the money shot for "stars measure the past": a near-zero correlation drawn as a shapeless blob beats any big number.
4. **19.7% → 4.6%** package hallucination, 2025 models vs 2026 frontier models (Spracklen et al. → arXiv:2605.17062). Draw it as the honest before-and-after it is, and say out loud that this one cuts *against* the argument. Posting the number that weakens your own case is the single highest-credibility move available in this thread.
5. **70% of GitHub files were already clones — in 2017** (DéjàVu). Draw it as a timeline with the AI-tool launch dates marked well to the right of the measurement. It reframes the pitch from "AI broke discovery" to "discovery was broken before AI and AI removed the last excuse for not fixing it," which is both more defensible and a better story.

**Numbers to avoid drawing:** the 4.5M fake stars (0.74% of all stars — a fact-checker will divide), any CEO claim about the share of AI-written code (no methodology), and every vibe-coding abandonment statistic (no primary source exists).
