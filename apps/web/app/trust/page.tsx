import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { AGENT_REPORTS_NOTE } from "@/components/labels";
import { VOTE_ADJUST_MAX, FLAGGED_CAP, MIN_MEASURED, STALE_CAPS, TRUST_POINTS } from "@/components/score";

export const metadata: Metadata = { title: "How the trust score works" };
export const dynamic = "force-dynamic";

const ROWS: { cell: string; pts: number; holds: string; slips: string; fails: string; unknown: string }[] = [
  { cell: "Last push", pts: TRUST_POINTS.push, holds: "within 90 days", slips: "within a year", fails: "over a year", unknown: "no push date" },
  { cell: "Releases", pts: TRUST_POINTS.release, holds: "within 6 months", slips: "within a year", fails: "over a year", unknown: "no release data" },
  { cell: "Archived", pts: TRUST_POINTS.archived, holds: "not archived", slips: "\u2014", fails: "archived by owner", unknown: "\u2014" },
  { cell: "Deprecated", pts: TRUST_POINTS.deprecated, holds: "package not deprecated", slips: "\u2014", fails: "deprecated or yanked", unknown: "no verified package" },
  { cell: "Advisories", pts: TRUST_POINTS.advisories, holds: "none open", slips: "one open", fails: "two or more", unknown: "not checked" },
  { cell: "Issue load", pts: TRUST_POINTS.issues, holds: "15% or less still open", slips: "up to 35%", fails: "over 35%", unknown: "counts not measured" },
];

export default async function TrustPage() {
  const viewer = await getViewer();
  return (
    <>
      <Masthead viewer={viewer} current="trust" next="/trust" />
      <main className="wrap" id="main">
        <div className="head">
          <h1>How the trust score works</h1>
          <p className="sub">The score comes from six things we check on every repo. No person sets it. If we can&rsquo;t
            check enough of them, we don&rsquo;t show a score.</p>
        </div>
        <div className="cols">
          <div>
            <section className="sec">
              <h2>The six signals <em>in strip order, left to right</em></h2>
              <div className="table-scroll">
                <table className="sig boxed">
                  <thead><tr><th scope="col">Signal</th><th scope="col">Points</th><th scope="col">Holds</th><th scope="col">Slipping</th><th scope="col">Failing</th><th scope="col">Unknown when</th></tr></thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.cell}><th scope="row">{r.cell}</th><td className="val">{r.pts}</td>
                        <td className="val" style={{ color: "var(--steel)" }}>{r.holds}</td>
                        <td className="val" style={{ color: "var(--amber)" }}>{r.slips}</td>
                        <td className="val" style={{ color: "var(--rust-ink)" }}>{r.fails}</td>
                        <td className="val">{r.unknown}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="sec prose">
              <h2>How they add up</h2>
              <p>Each signal earns up to its points, and all six add up to 100. If we can&rsquo;t measure a signal, it gets half
                its points. If a repo publishes no package, the deprecated and advisories signals don&rsquo;t apply. They also get
                half points, so having no package never raises a score. With fewer than {MIN_MEASURED} signals measured, we show
                &ldquo;too little measured&rdquo; instead of a score. Every score says how many signals it rests on.</p>
              <p>An archived or deprecated project is capped at {FLAGGED_CAP}, whatever else it measures.
                A project with no push in a year is capped at {STALE_CAPS.find(([d]) => d === 365)?.[1]}, and after two years at {STALE_CAPS.find(([d]) => d === 730)?.[1]}.</p>
              <p>Votes can move the score up to {VOTE_ADJUST_MAX} points either way. Each vote is weighted by the voter&rsquo;s
                account and loses half its weight every six months. Every downvote must name one of five reasons: unmaintained,
                insecure, broken on an agent, misleading, low quality.</p>
              <p>Stars and licence don&rsquo;t affect the score. We flag a missing or unclear licence on the row so you can
                check it.</p>
              <p>Agent compatibility (for example, works in Claude Code, breaks in Codex) is shown next to the score, not
                counted in it.{" "}{AGENT_REPORTS_NOTE} Until someone reports on an agent, it shows &ldquo;unknown&rdquo;.</p>
              <p>Nothing here is sponsored. If we ever sell placement, it will be a separate slot that does not change the score.</p>
            </section>
          </div>
          <aside>
            <div className="panel">
              <div className="panel-h"><span className="lbl">Reading the strip</span></div>
              <div className="panel-b">
                <div className="strip" style={{ width: 118, marginBottom: 10 }} aria-hidden="true"><i className="ok" /><i className="unk" /><i className="ok" /><i className="ok" /><i className="mid" /><i className="bad" /></div>
                <p className="meta" style={{ margin: 0 }}>Green: fine. Amber: slipping. Red: failing. Grey: not measured.
                  Each cell is one signal, in the same order as the table.</p>
              </div>
            </div>
            <p className="meta" style={{ marginTop: 14 }}><Link className="inline-link" href="/?sort=top">Browse the directory</Link></p>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
