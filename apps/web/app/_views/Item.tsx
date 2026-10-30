import Link from "next/link";
import { UpTriangle, DownTriangle } from "@/components/icons";
import { notFound } from "next/navigation";
import { and, desc, eq, ne, isNotNull, sql } from "drizzle-orm";
import { items, votes, users, agentCompatReports, comments, commentVotes } from "@gitit/db";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { ReppitInstall } from "@/components/ReppitInstall";
import { Install } from "@/components/Install";
import { VoteComposer } from "@/components/VoteComposer";
import { CompatForm } from "@/components/CompatForm";
import { CommentForm } from "@/components/CommentForm";
import { CommentThread } from "@/components/CommentThread";
import { AgentChip, agentState } from "@/components/marks";
import { flags, ago, compact, band } from "@/components/trust";
import { trustScore, VOTE_ADJUST_MAX, MIN_MEASURED, type SignalCell } from "@/components/score";
import { ScoreNum, nullReason, capNote } from "@/components/marks";
import { REASONS, REASON_LABEL, CORE_AGENTS, KIND_LABEL, MCP_INSTALL, AGENT_REPORTS_NOTE, splitSlug, itemHref, parentRepo } from "@/components/labels";
import { rowColumns } from "../_data/items";

const HALF_LIFE_DAYS = 180;
const STATE_CLASS = { good: "", slipping: " mid", failing: " bad", unknown: "", not_applicable: "" } as const;

/** One plain sentence on what the cells say. Words only; the number comes from core. */
function verdict(cells: SignalCell[], scored: boolean): string {
  const failing = cells.filter((c) => c.state === "failing").map((c) => c.short);
  const slipping = cells.filter((c) => c.state === "slipping").map((c) => c.short);
  const list = (a: string[]) => (a.length <= 1 ? a[0] ?? "" : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
  if (cells.find((c) => c.key === "archived")?.state === "failing") return "Archived. Nobody is maintaining it.";
  if (cells.find((c) => c.key === "deprecated")?.state === "failing") return "Deprecated by its maintainers.";
  const unknown = cells.filter((c) => c.state === "unknown").length;
  if (failing.length === 0 && slipping.length === 0) {
    return !scored ? "Not enough is measured yet to give a score." : unknown > 0 ? "What we could measure looks fine." : "Everything we measured looks fine.";
  }
  if (failing.length === 0) return `Mostly fine. Slipping: ${list(slipping)}.`;
  const f = list(failing);
  return `${f.charAt(0).toUpperCase()}${f.slice(1)} ${failing.length === 1 ? "is" : "are"} failing${slipping.length ? `, and ${list(slipping)} ${slipping.length === 1 ? "is" : "are"} slipping` : ""}.`;
}
const REASON_COLOR: Record<string, string> = {
  unmaintained: "var(--rust)", insecure: "var(--rust-ink)", "broken-on-agent": "var(--amber)",
  misleading: "var(--steel)", "low-quality": "var(--ink-3)",
};

/** Strip markdown and HTML down to readable prose for the excerpt. Not a renderer; just enough to read. */
function readmeExcerpt(md: string, max = 1400): string {
  const text = md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^---\n[\s\S]*?\n---\n/, "") // front matter
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". ") + 1, max * 0.6))}…`;
}

export async function ItemView({ slug }: { slug: string }) {
  const viewer = await getViewer();
  const d = await db();
  const [item] = await d.select({ ...rowColumns, readme: items.readme, forks: items.forks }).from(items).where(eq(items.slug, slug)).limit(1);
  if (!item) notFound();

  // A skill's stars are its parent repo's. Link the parent instead of showing them as the skill's own.
  const parent = parentRepo(item.kind, item.slug);
  const [voteRows, compatRows, mineRows, neighbours, parentRows, commentRows] = await Promise.all([
    d.select({ login: users.login, direction: votes.direction, reason: votes.reason, weight: votes.weight, createdAt: votes.createdAt })
      .from(votes).innerJoin(users, eq(users.id, votes.userId)).where(eq(votes.itemId, item.id)).orderBy(desc(votes.createdAt)).limit(50),
    d.select({ id: agentCompatReports.id, agent: agentCompatReports.agent, status: agentCompatReports.status, note: agentCompatReports.note, login: users.login, createdAt: agentCompatReports.createdAt })
      .from(agentCompatReports).innerJoin(users, eq(users.id, agentCompatReports.userId)).where(eq(agentCompatReports.itemId, item.id)).orderBy(desc(agentCompatReports.createdAt)).limit(100),
    viewer ? d.select({ direction: votes.direction, reason: votes.reason }).from(votes).where(and(eq(votes.itemId, item.id), eq(votes.userId, viewer.id))) : Promise.resolve([]),
    // Nearest neighbours by embedding: what someone with the same problem would also look at.
    d.select(rowColumns).from(items)
      .where(and(ne(items.id, item.id), isNotNull(items.embedding), eq(items.kind, item.kind)))
      .orderBy(sql`${items.embedding} <=> (select embedding from items where id = ${item.id})`)
      .limit(4)
      .catch(() => []),
    parent ? d.select({ slug: items.slug }).from(items).where(and(eq(items.slug, parent), eq(items.kind, "repo"))).limit(1) : Promise.resolve([]),
    d.select({
      id: comments.id, parentId: comments.parentId, body: comments.body, userId: comments.userId,
      login: users.login, createdAt: comments.createdAt, upvotes: comments.upvotes,
      downvotes: comments.downvotes, deleted: comments.deleted, mine: commentVotes.direction,
      authorSuspendedAt: users.suspendedAt,
    }).from(comments)
      .innerJoin(users, eq(users.id, comments.userId))
      .leftJoin(commentVotes, and(eq(commentVotes.commentId, comments.id), viewer ? eq(commentVotes.userId, viewer.id) : sql`false`))
      .where(eq(comments.itemId, item.id)).orderBy(desc(comments.createdAt)),
  ]);
  const parentHref = parent ? (parentRows.length ? itemHref(parent) : `https://github.com/${parent}`) : null;

  const t = trustScore(item);
  const fl = flags(item);
  const { owner, name } = splitSlug(item.slug);
  const href = itemHref(item.slug);
  const cold = item.upvotes + item.downvotes === 0;
  const net = item.upvotes - item.downvotes;
  const mine = mineRows[0] ?? null;
  const now = Date.now();

  const downReasons: Record<string, number> = {};
  for (const v of voteRows) if (v.direction === "down" && v.reason) downReasons[v.reason] = (downReasons[v.reason] ?? 0) + 1;
  const downTotal = Object.values(downReasons).reduce((a, b) => a + b, 0);

  const byAgent: Record<string, { works: number; broken: number; last: Date }> = {};
  for (const c of compatRows) {
    const a = (byAgent[c.agent] ??= { works: 0, broken: 0, last: c.createdAt });
    a[c.status]++;
    if (c.createdAt > a.last) a.last = c.createdAt;
  }
  const agentList = [...CORE_AGENTS, ...Object.keys(byAgent).filter((a) => !CORE_AGENTS.includes(a))];
  const agentsReporting = Object.keys(byAgent).length;
  const unknownWords = t.cells.filter((c) => c.state === "unknown").map((c) => c.short);
  const unknownNote = unknownWords.length === 0 ? null : t.score === null
    ? `Not measured: ${unknownWords.join(", ")}. We need at least ${MIN_MEASURED} to give a score.`
    : `Not measured: ${unknownWords.join(" and ")}. ${unknownWords.length === 1 ? "It gets" : "Each gets"} half its points.`;
  const discussion = commentRows.map((comment) => ({
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    mine: comment.mine ?? null,
    canDelete: viewer?.id === comment.userId || viewer?.isDev === true,
    canModerate: viewer?.isDev === true && viewer.id !== comment.userId,
    authorSuspended: comment.authorSuspendedAt !== null,
  }));

  return (
    <>
      <Masthead viewer={viewer} current="browse" next={href} />
      <main className="wrap" id="main">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={`/?kind=${item.kind}`}>{KIND_LABEL[item.kind] ?? item.kind}</Link>
          {item.language && <> / <span>{item.language.toLowerCase()}</span></>} / <b>{item.slug}</b>
        </nav>

        <div className="head"><div className="head-row">
          <div className="l">
            <h1><span className="ow">{owner}</span>{name}</h1>
            <p className="sub">{item.description ?? "No description on the repo."}</p>
            <div className="chips">
              {item.kind !== "repo" && <span className="tag plain">{item.kind === "skill" ? "agent skill" : "MCP server"}</span>}
              {item.language && <span className="tag plain">{item.language}</span>}
              {item.license && item.license !== "NOASSERTION" && <span className="tag plain">{item.license}</span>}
              {parent && parentHref ? (
                parentHref.startsWith("/")
                  ? <Link className="tag plain src" href={parentHref}>in {parent}</Link>
                  : <a className="tag plain src" href={parentHref} target="_blank" rel="noreferrer">in {parent} &#8599;</a>
              ) : item.stars > 0 && <span className="tag plain">{compact(item.stars)} stars</span>}
              {fl.map((f) => <span key={f.label} className={`flag${f.warn ? " warn" : ""}`}>{f.label}</span>)}
              <span className="tag plain">{item.lastReleaseAt ? `last release ${ago(item.lastReleaseAt)}` : "no release data"}</span>
              {cold && <span className="tag plain">added to reppit {ago(item.createdAt)}</span>}
              <a className="tag plain src" href={item.url} target="_blank" rel="noreferrer">source<span className="sr-only"> (opens GitHub)</span> &#8599;</a>
            </div>
            <div style={{ marginTop: 12, maxWidth: 460 }}>
              <Install item={item} withNote />
            </div>
          </div>
          <div className="r">
            {cold ? (
              <>
                <div className="votepill">
                  <a className="v-up" href="#vote" aria-label="Upvote: works as described"><UpTriangle /></a>
                  <span className="tot" data-testid="vote-count" aria-label="no votes yet">0</span>
                  <a className="v-dn" href="#vote" aria-label="Downvote, reason required"><DownTriangle /></a>
                </div>
                <p className="meta" style={{ margin: "7px 0 0" }}>No votes yet.</p>
              </>
            ) : (
              <>
                <div className="votebar">
                  <span className="sum"><b className="num">+{item.upvotes}</b> works<br /><span className="meta">as described</span></span>
                  <span className="sum"><b className="num" style={{ color: "var(--rust)" }}>{item.downvotes > 0 ? `\u2212${item.downvotes}` : "0"}</b> reported<br /><span className="meta">every one with a reason</span></span>
                  <span className="tot num" data-testid="vote-count" aria-label={`net ${net}`}>{net < 0 ? `−${-net}` : net}</span>
                </div>
                <p className="meta" style={{ margin: "7px 0 0" }}>After weighting, these votes count as{" "}
                  {item.weightedScore >= 0 ? "+" : "−"}{Math.abs(item.weightedScore).toFixed(1)}. Older votes count less.</p>
              </>
            )}
          </div>
        </div></div>

        <div className="cols">
          <div>
            {cold ? (
              <section className="sec" style={{ marginBottom: 22 }} aria-label="Trust score">
                <div className="cold">
                  <div className={`big${t.score === null ? " is-nd" : ""}`}><ScoreNum score={t.score} reason={t.reason} /><s>Trust{t.score === null ? "" : ", of 100"} &middot; {t.measured} of {t.applicable} measured{capNote(t.score, t.reason) ? ` \u00b7 ${capNote(t.score, t.reason)}` : ""}</s></div>
                  <div className="txt">
                    <h2>No votes yet. Here&rsquo;s what we measured.</h2>
                    <p>{t.score === null
                      ? <>We could only measure {t.measured} of {t.applicable} signals, so we&rsquo;re not showing a score yet. See what we found below.</>
                      : <>This score comes from the repo&rsquo;s own activity, not from stars or votes.</>}</p>
                    {unknownNote && <p>{unknownNote}</p>}
                    <p className="fine">Votes can move a score up to {VOTE_ADJUST_MAX} points. Older votes count less.</p>
                  </div>
                </div>
              </section>
            ) : (
              <section className="sec">
                <h2>Trust score <em>from the repo, adjusted by votes</em></h2>
                <div className="score-hero">
                  <div className={`big${t.score === null ? " is-nd" : ""}`}><ScoreNum score={t.score} reason={t.reason} /><s>{t.score === null ? "trust" : "of 100"} &middot; {t.measured} of {t.applicable} measured{capNote(t.score, t.reason) ? ` \u00b7 ${capNote(t.score, t.reason)}` : ""}</s></div>
                  <div className="txt"><b>{verdict(t.cells, t.score !== null)}</b>{" "}
                    {unknownNote && <>{unknownNote} </>}
                    {t.base !== null && <>Measured: {t.base}. Votes: {t.voteAdjust >= 0 ? "+" : "\u2212"}{Math.abs(t.voteAdjust)}.</>}</div>
                </div>
              </section>
            )}

            <section className="sec">
              {cold && <h2>The six measurements <em>from the repo itself</em></h2>}
              <table className="sig boxed" data-testid="signal-table" style={cold ? undefined : { marginTop: -12 }}>
                <thead><tr><th scope="col">Signal</th><th scope="col">Observed</th><th scope="col" style={{ textAlign: "right" }}>Points</th></tr></thead>
                <tbody>
                  {t.cells.map((c) => (
                    <tr key={c.key}>
                      <th scope="row">{c.short.charAt(0).toUpperCase() + c.short.slice(1)}</th>
                      <td className={`val${c.state === "unknown" || c.state === "not_applicable" ? " unk-t" : ""}`}>{c.label}</td>
                      <td className="pts">
                        {c.state === "not_applicable" ? <span className="unk-t">not applicable</span>
                        : c.state === "unknown" ? <span className="unk-t">unknown, counts {c.points}/{c.max}</span> : (
                          <>
                            <span className={`pbar${STATE_CLASS[c.state]}`} aria-hidden="true"><i style={{ width: `${Math.round((100 * c.points) / c.max)}%` }} /></span>
                            <b>{c.points}</b>/{c.max}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <th scope="row">Trust score</th>
                  <td className="val">{t.score === null ? `${t.measured} of ${t.applicable} measured`
                    : `${t.base} from ${t.measured} of ${t.applicable} measured signals${t.voteAdjust !== 0 ? `, votes ${t.voteAdjust > 0 ? "+" : "\u2212"}${Math.abs(t.voteAdjust)}` : ""}${item.archived || item.deprecated ? ", capped at 25" : ""}`}</td>
                  <td className="pts">{t.score === null ? nullReason(t.reason) : `${t.score}/100`}</td>
                </tr></tfoot>
              </table>
              {item.deprecationMessage && <p className="meta" style={{ marginTop: 9 }}>Registry says: &ldquo;{item.deprecationMessage}&rdquo;</p>}
              <p className="meta" style={{ marginTop: 9 }}>Unknown means we could not measure it, not that it passed.{" "}
                <Link className="inline-link" href="/trust">How each signal is scored</Link></p>
            </section>

            <section className="sec" aria-labelledby="reports-h">
              <h2 id="reports-h">Reports <em>{cold ? "none yet" : `${item.upvotes + item.downvotes} vote${item.upvotes + item.downvotes === 1 ? "" : "s"} · ${item.downvotes} downvote${item.downvotes === 1 ? "" : "s"}, every one with a reason`}</em></h2>
              {cold ? (
                <div className="nothing">
                  <h3>No reports yet.</h3>
                  <p>Used it with a coding agent? Tell us how it went in the agent section below.</p>
                </div>
              ) : (
                <>
                  {downTotal > 0 && (
                    <>
                      <div className="dist" role="img" aria-label={`Downvote reasons: ${Object.entries(downReasons).map(([r, n]) => `${n} ${REASON_LABEL[r]}`).join(", ")}`}>
                        {REASONS.filter((r) => downReasons[r]).map((r) => (
                          <i key={r} style={{ width: `${(100 * downReasons[r]) / downTotal}%`, background: REASON_COLOR[r] }} />
                        ))}
                      </div>
                      <div className="dist-key meta">
                        {REASONS.filter((r) => downReasons[r]).map((r, i) => (
                          <span key={r}>{i > 0 && <span className="dot">&middot;</span>}<i className="swatch" style={{ background: REASON_COLOR[r] }} />{downReasons[r]} {REASON_LABEL[r]}</span>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: downTotal > 0 ? 14 : 0 }}>
                    {voteRows.map((v, i) => {
                      const ageDays = (now - v.createdAt.getTime()) / 86_400_000;
                      const w = v.weight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
                      return (
                        <div className="report" key={`${v.login}-${i}`}>
                          <div className="who">@{v.login}<br />{ago(v.createdAt)}<br />
                            <span style={{ color: ageDays < 60 ? "var(--rust)" : "var(--ink-3)" }}>weight {w.toFixed(2)}</span></div>
                          <div className="what"><div className="top">
                            {v.direction === "up"
                              ? <span className="tag pos"><span className="n">&#9650;</span> works as described</span>
                              : <span className="tag"><span className="n">&#9660;</span> {REASON_LABEL[v.reason ?? ""] ?? "no reason recorded"}</span>}
                          </div></div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="meta" style={{ marginTop: 10 }}>Each vote is shown at its current weight: the voter&rsquo;s weight at the time, halved for every six months since.</p>
                </>
              )}
            </section>

            <section className="sec discussion" id="comments" aria-labelledby="comments-h">
              <h2 id="comments-h">Discussion <em>{item.commentCount === 0 ? "no comments yet" : `${item.commentCount} ${item.commentCount === 1 ? "comment" : "comments"}`}</em></h2>
              <CommentForm slug={item.slug} href={href} signedIn={!!viewer} />
              <CommentThread initial={discussion} slug={item.slug} href={href} signedIn={!!viewer} />
            </section>

            <section className="sec" id="compat" aria-labelledby="compat-h">
              <h2 id="compat-h">Agent compatibility <em>{compatRows.length === 0 ? "no reports yet" : `${compatRows.length} report${compatRows.length === 1 ? "" : "s"} from ${agentsReporting} agent${agentsReporting === 1 ? "" : "s"}`}</em></h2>
              <p className="compat-none" data-testid="compat-none">
                {compatRows.length === 0 ? "No agent reports yet. " : ""}{AGENT_REPORTS_NOTE} Tried it in Claude Code, Codex or Cursor? Sign in and
                add a report below. Once the MCP server is out, your agent can also call <code>report_compat</code>.</p>
              <table className="sig boxed">
                <thead><tr><th scope="col">Agent</th><th scope="col">Reports</th><th scope="col" style={{ textAlign: "right" }}>Status</th></tr></thead>
                <tbody>
                  {agentList.map((a) => {
                    const c = byAgent[a];
                    const s = c ? agentState(c) : "q";
                    const word = !c ? "unknown" : s === "y" ? "works" : s === "n" ? "breaks" : "mixed";
                    const color = !c ? "var(--ink-3)" : s === "y" ? "var(--steel)" : s === "n" ? "var(--rust-ink)" : "var(--amber)";
                    return (
                      <tr key={a}>
                        <th scope="row"><AgentChip agent={a} c={c ?? { works: 0, broken: 0 }} count={false} /></th>
                        <td className="val">{c ? `${c.works + c.broken} ran it, ${c.broken} failed · last ${ago(c.last)}` : "—"}</td>
                        <td className="pts" style={{ color }}>{word}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="meta" style={{ marginTop: 9 }}>Unknown means no one has reported yet.</p>

              {compatRows.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {compatRows.slice(0, 20).map((c) => (
                    <div className="report" key={c.id} data-testid="compat-report">
                      <div className="who">@{c.login}<br />{ago(c.createdAt)}</div>
                      <div className="what"><div className="top">
                        <AgentChip agent={c.agent} c={c.status === "works" ? { works: 1, broken: 0 } : { works: 0, broken: 1 }} count={false} />
                        <span className="meta">{c.status === "works" ? "ran it" : "failed"}</span>
                      </div>
                        {c.note ? c.note : <span className="quiet-inline">No note left.</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <CompatForm slug={item.slug} href={href} signedIn={!!viewer} />
            </section>

            <section className="sec" aria-labelledby="readme-h">
              <h2 id="readme-h">README <em>excerpt</em></h2>
              {item.readme ? (
                <>
                  <div className="readme">{readmeExcerpt(item.readme)}</div>
                  <p className="meta" style={{ marginTop: 9 }}><a className="inline-link" href={item.url} target="_blank" rel="noreferrer">Read more on GitHub</a></p>
                </>
              ) : (
                <p className="meta">We haven&rsquo;t fetched the README yet. <a className="inline-link" href={item.url} target="_blank" rel="noreferrer">Read it on GitHub</a>.</p>
              )}
            </section>
          </div>

          <aside aria-label="Vote and related">
            <VoteComposer slug={item.slug} href={href} mine={mine?.direction ?? null} mineReason={mine?.reason ?? null} signedIn={!!viewer} cold={cold} />

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="panel-h"><span className="lbl">Ask from your agent</span></div>
              <div className="panel-b">
                <ReppitInstall command={MCP_INSTALL} compact />
                <p className="meta" style={{ margin: "10px 0 0" }}>Once the MCP server is out, your agent can look up these measurements.{" "}
                  <Link className="inline-link" href="/agent">See what it returns</Link></p>
              </div>
            </div>

            {neighbours.length > 0 && (
              <div className="panel" style={{ marginTop: 18 }}>
                <div className="panel-h"><span className="lbl">{`Similar ${KIND_LABEL[item.kind] ?? "repos"}`}</span></div>
                <table className="kv kv-rel"><tbody>
                  {neighbours.map((n) => {
                    const nt = trustScore(n);
                    const s = nt.score;
                    return (
                      <tr key={n.id}>
                        <th><Link className="mono kv-link" href={itemHref(n.slug)}>{n.slug}</Link></th>
                        <td className={s === null ? "v-nd" : `v-${band(s)}`}><ScoreNum score={s} reason={nt.reason} short /></td>
                      </tr>
                    );
                  })}
                </tbody></table>
                {cold && (
                  <div className="panel-b" style={{ borderTop: "1px solid var(--rule)" }}>
                    <p className="meta" style={{ margin: 0 }}>Picked by how close they are to this one.</p>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
