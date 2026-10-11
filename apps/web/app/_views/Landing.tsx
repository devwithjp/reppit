import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { LandingSearch } from "@/components/SearchForms";
import { ReppitInstall } from "@/components/ReppitInstall";
import { Strip, ScoreNum, Measured } from "@/components/marks";
import { compact } from "@/components/trust";
import { trustScore, signalCells } from "@/components/score";
import { REASONS, REASON_LABEL, REASON_GLOSS, MCP_INSTALL, AGENT_REPORTS_NOTE, itemHref } from "@/components/labels";
import { rowColumns, recentReasons, indexCounts } from "../_data/items";

/** Below this many downvotes in 30 days, the proof panel shows the taxonomy, not near-empty counts. */
const MIN_REASONS_FOR_COUNTS = 25;

export async function Landing() {
  const d = await db();
  const [counts, reasons, candidates, [archivedStar]] = await Promise.all([
    indexCounts(d),
    recentReasons(d, 30),
    // Real repos with a verified package, so the evidence strip has enough known signals to score.
    d.select(rowColumns).from(items)
      .where(and(eq(items.kind, "repo"), eq(items.archived, false), isNotNull(items.advisoriesOpen)))
      .orderBy(desc(items.stars)).limit(200),
    d.select({ slug: items.slug, stars: items.stars }).from(items).where(and(eq(items.archived, true), eq(items.kind, "repo"))).orderBy(desc(items.stars)).limit(1),
  ]);

  const reasonTotal = reasons.reduce((a, r) => a + r.n, 0);
  const showCounts = reasonTotal >= MIN_REASONS_FOR_COUNTS;
  const max = Math.max(1, ...reasons.map((r) => r.n));
  // Prefer one that scores and is slipping somewhere, so the strip shows more than one colour.
  const scored = candidates.map((r) => ({ r, t: trustScore(r) })).filter((x) => x.t.score !== null);
  const pick = scored.find((x) => x.t.cells.some((c) => c.state === "slipping" || c.state === "failing")) ?? scored[0];
  const example = pick?.r;
  const exampleScore = pick?.t.score ?? null;
  const exampleTs = pick?.t;

  return (
    <>
      <Masthead viewer={null} variant="landing" />
      <main id="main">
        <section className="fold"><div className="wrap fold-in">
          <div>
            <div className="kicker"><b>reppit.dev</b><hr /></div>
            <h1 className="claim"><s>Stars say it was popular.</s><br />reppit says it <u>still works</u>.</h1>
            <p className="sell">Your coding agent adds a dependency and you have about thirty seconds to decide whether that
              was a good idea. Today that means looking at a star count, which tells you something was popular at some point,
              possibly in 2019. <b>A star is a bookmark. Nobody goes back and unstars the dead ones.</b></p>
            <LandingSearch />
            <p className="undercta">Describe the problem, not the package. {counts.repo.toLocaleString("en-US")} repos
              and {counts.skill.toLocaleString("en-US")} agent skills indexed.</p>
          </div>

          <div className="proof">
            <div className="proof-h"><span className="lbl">Every downvote names a reason</span></div>
            <div className="proof-b">
              {showCounts
                ? REASONS.map((r) => {
                    const n = reasons.find((x) => x.reason === r)?.n ?? 0;
                    return (
                      <div className="rrow" key={r}>
                        <span className="n">{n > 0 ? n : "–"}</span><span className="t">{REASON_LABEL[r]}</span>
                        <span className="g" aria-hidden="true"><i style={{ width: `${Math.round((100 * n) / max)}%` }} /></span>
                      </div>
                    );
                  })
                : REASONS.map((r) => (
                    <div className="rrow" key={r}>
                      <span className="n" aria-hidden="true">&#9660;</span><span className="t">{REASON_LABEL[r]}</span>
                      <span className="gl">{REASON_GLOSS[r]}</span>
                    </div>
                  ))}
            </div>
            <div className="proof-f">
              {showCounts ? "Reasons given in the last 30 days. " : "The five reasons a downvote can carry. "}
              There is no sixth option and no free-text-only downvote.{" "}
              <b>&ldquo;347 people disliked this&rdquo; is noise. &ldquo;9 people say it is unmaintained&rdquo; is a decision.</b>
            </div>
          </div>
        </div></section>

        <div className="wrap">
          <div className="args">
            <div className="arg"><span className="no">01</span>
              <h2 className="h3">Measured, not voted</h2>
              <p>Last push, release cadence, the archived and deprecated flags, open advisories and issue load.
                Six measurements of the repo itself, no human input. When too few of them can be measured, the page
                says &ldquo;too little measured&rdquo; instead of guessing a number.</p>
              {example && (
                <div className="evidence">
                  <Strip cells={signalCells(example)} />
                  <Link href={itemHref(example.slug)} className="ev-link">{example.slug}</Link> &middot;{" "}
                  <b className="ev-n"><ScoreNum score={exampleScore} reason={exampleTs?.reason} /></b>{exampleScore !== null && "/100"}
                  {exampleTs && <> &middot; <Measured measured={exampleTs.measured} applicable={exampleTs.applicable} className="" /></>}
                </div>
              )}
            </div>
            <div className="arg"><span className="no">02</span>
              <h2 className="h3">Works in Claude Code, breaks in Codex</h2>
              <p>People will report which agents a library actually runs in. It is the difference between a thing
                that works and a thing that works where you are. {AGENT_REPORTS_NOTE}</p>
              <div className="evidence">
                <span className="lbl ex-lbl">Example: what a report looks like, not data</span>
                <div className="agents" style={{ marginBottom: 6 }} aria-label="Example chips: works, breaks, unknown">
                  <span className="ag y"><span className="m">&#10003;</span><b>works</b></span>
                  <span className="ag n"><span className="m">&#10007;</span><b>breaks</b></span>
                  <span className="ag q"><span className="m">?</span><b>unknown</b></span>
                </div>
                Three states per agent. Unknown is not the same as works.
              </div>
            </div>
            <div className="arg"><span className="no">03</span>
              <h2 className="h3">Old praise stops counting</h2>
              <p>Every vote loses half its weight every six months. A rave from two years ago counts for about a
                sixteenth of a vote from today. Ranking follows the code, not the launch week.</p>
              <div className="evidence">
                <div className="decayrow"><i style={{ width: 84 }} /><span>today &nbsp;1.00</span></div>
                <div className="decayrow"><i style={{ width: 42 }} /><span>6mo &nbsp;&nbsp;&nbsp;0.50</span></div>
                <div className="decayrow"><i style={{ width: 21 }} /><span>1yr &nbsp;&nbsp;&nbsp;0.25</span></div>
                <div className="decayrow"><i style={{ width: 5 }} /><span>2yr &nbsp;&nbsp;&nbsp;0.06</span></div>
              </div>
            </div>
          </div>
        </div>

        <section className="pull"><div className="wrap">
          <p>Stars are easy to count. <u>Easy to count is not the same as true.</u></p>
          <div className="attr">
            {archivedStar
              ? <>In this index right now: <Link className="inline-link" href={itemHref(archivedStar.slug)}>{archivedStar.slug}</Link> has {compact(archivedStar.stars)} stars. It is also archived, and reppit flags that next to its name. The star count does not.</>
              : <>An archived repo with 40,000 stars outranks a maintained one with 300, almost everywhere, today.</>}
          </div>
        </div></section>

        <div className="wrap tail-wrap">
          <div className="tail">
            <div>
              <h2 className="h3">Ask from the site</h2>
              <p>Type the problem. Get ranked answers with the reasons attached, not a wall of README summaries.</p>
              <Link className="btn" href="/?sort=hot">Open the directory</Link>
            </div>
            <div>
              <h2 className="h3">Or from inside your agent</h2>
              <p>Your agent checks before it installs, instead of after you find out.</p>
              <ReppitInstall command={MCP_INSTALL} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
