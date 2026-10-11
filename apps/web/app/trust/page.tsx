import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { VOTE_ADJUST_MAX, FLAGGED_CAP, MAX_UNKNOWN, TRUST_POINTS } from "@/components/score";

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
          <p className="sub">Six measurements of the repo itself, taken from its own record. No human sets the score, and it
            is there before anybody has voted.</p>
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
              <p>Each signal earns points up to its maximum, and the points add up to 100. A signal we could not measure
                counts as half its points: neither a pass nor a zero. When more than {MAX_UNKNOWN} of the six are unknown, there is no
                number at all. The page says &ldquo;not enough data&rdquo; rather than guess.</p>
              <p>An archived or deprecated project is capped at {FLAGGED_CAP}, whatever else it measures. Nobody is maintaining it.</p>
              <p>Votes then move the score by at most &plusmn;{VOTE_ADJUST_MAX}. Each vote is weighted by the voter&rsquo;s account
                and loses half its weight every six months, so old praise stops counting. Every downvote has to name one of
                five reasons: unmaintained, insecure, broken on an agent, misleading, low quality.</p>
              <p>Stars are not an input. Neither is the licence: it decides whether you may use a project, not whether it is
                maintained, so it is shown as a flag on the row instead.</p>
              <p>Nothing here is sponsored. Paid placement, if it ever exists, is a separate slot that never touches this number.</p>
            </section>
          </div>
          <aside>
            <div className="panel">
              <div className="panel-h"><span className="lbl" style={{ letterSpacing: ".1em" }}>Reading the strip</span></div>
              <div className="panel-b">
                <div className="strip" style={{ width: 118, marginBottom: 10 }} aria-hidden="true"><i className="ok" /><i className="unk" /><i className="ok" /><i className="ok" /><i className="mid" /><i className="bad" /></div>
                <p className="meta" style={{ margin: 0 }}>Blue holds, amber slipping, rust failing, grey unknown. Green is absent on
                  purpose: a score of 58 is a measurement, not a pass or a fail.</p>
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
