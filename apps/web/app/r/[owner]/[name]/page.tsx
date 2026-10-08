import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import { items, comments, users, votes, agentCompatReports } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { VoteButtons } from "@/components/VoteButtons";
import { CommentForm } from "@/components/CommentForm";
import { CompatForm } from "@/components/CompatForm";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ owner: string; name: string }> }) {
  const { owner, name } = await params;
  const slug = `${decodeURIComponent(owner)}/${decodeURIComponent(name)}`;
  const session = await auth();
  const d = await db();
  const [item] = await d.select().from(items).where(eq(items.slug, slug));
  if (!item) notFound();
  const [cmts, compat, reasons, mine] = await Promise.all([
    d.select({ id: comments.id, body: comments.body, parentId: comments.parentId, createdAt: comments.createdAt, user: users.login })
      .from(comments).innerJoin(users, eq(users.id, comments.userId)).where(and(eq(comments.itemId, item.id), eq(comments.deleted, false))).orderBy(desc(comments.createdAt)).limit(200),
    d.select({ agent: agentCompatReports.agent, status: agentCompatReports.status, note: agentCompatReports.note, user: users.login })
      .from(agentCompatReports).innerJoin(users, eq(users.id, agentCompatReports.userId)).where(eq(agentCompatReports.itemId, item.id)).orderBy(desc(agentCompatReports.createdAt)).limit(50),
    d.select({ reason: votes.reason }).from(votes).where(and(eq(votes.itemId, item.id), eq(votes.direction, "down"))),
    session?.user?.id ? d.select({ direction: votes.direction }).from(votes).where(and(eq(votes.itemId, item.id), eq(votes.userId, session.user.id))) : Promise.resolve([]),
  ]);
  const reasonCounts = reasons.reduce<Record<string, number>>((m, r) => { if (r.reason) m[r.reason] = (m[r.reason] ?? 0) + 1; return m; }, {});
  const compatByAgent = compat.reduce<Record<string, { works: number; broken: number }>>((m, c) => { (m[c.agent] ??= { works: 0, broken: 0 })[c.status]++; return m; }, {});
  const roots = cmts.filter((c) => !c.parentId); const replies = (id: string) => cmts.filter((c) => c.parentId === id);
  const install = item.kind === "skill" ? `npx skills add ${item.slug}` : item.kind === "mcp" ? `see ${item.url}` : `git clone ${item.url}`;

  return (
    <>
      <div className="card row">
        <VoteButtons slug={item.slug} upvotes={item.upvotes} downvotes={item.downvotes} mine={mine[0]?.direction ?? null} signedIn={!!session?.user} />
        <div className="body">
          <h1 style={{ margin: 0 }}>{item.slug} <span className="badge kind">{item.kind}</span></h1>
          <p className="desc">{item.description}</p>
          <div className="meta">
            {item.language && <Link href={`/l/${item.language.toLowerCase()}`}>{item.language}</Link>}
            <span>★ {item.stars.toLocaleString()}</span><span>⑂ {item.forks.toLocaleString()}</span>
            <span>health {(item.healthScore * 100).toFixed(0)}%</span>
            {item.license && <span>{item.license}</span>}
            {item.pushedAt && <span>pushed {item.pushedAt.toISOString().slice(0, 10)}</span>}
            <a href={item.url} target="_blank" rel="noreferrer">GitHub ↗</a>
          </div>
          <div className="meta">{(item.topics ?? []).map((t) => <Link key={t} href={`/t/${t}`} className="badge">{t}</Link>)}</div>
          <div className="meta">
            {Object.entries(reasonCounts).map(([k, n]) => <span key={k} className="badge flag">{k} ×{n}</span>)}
            {Object.entries(compatByAgent).map(([a, c]) => <span key={a} className={`badge ${c.works >= c.broken ? "ok" : "flag"}`}>{a}: {c.works}✓ {c.broken}✗</span>)}
          </div>
          <pre style={{ marginTop: 10 }}>{install}</pre>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Agent compatibility</h2>
          {compat.length === 0 && <p className="muted">No reports yet. Tried it in Claude Code, Codex or Cursor? Say so.</p>}
          {compat.map((c, i) => <div key={i} className="comment"><span className={`badge ${c.status === "works" ? "ok" : "flag"}`}>{c.agent}: {c.status}</span> {c.note && <span> {c.note}</span>} <span className="who">— @{c.user}</span></div>)}
          <CompatForm slug={item.slug} signedIn={!!session?.user} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Score breakdown</h2>
          <table style={{ width: "100%", fontSize: 14 }}><tbody>
            <tr><td className="muted">Weighted community score</td><td className="score" style={{ textAlign: "right" }}>{item.weightedScore.toFixed(2)}</td></tr>
            <tr><td className="muted">Upvotes / downvotes</td><td className="score" style={{ textAlign: "right" }}>{item.upvotes} / {item.downvotes}</td></tr>
            <tr><td className="muted">Health</td><td className="score" style={{ textAlign: "right" }}>{(item.healthScore * 100).toFixed(0)}%</td></tr>
            <tr><td className="muted">Hot score</td><td className="score" style={{ textAlign: "right" }}>{item.hotScore.toFixed(2)}</td></tr>
          </tbody></table>
          <p className="muted" style={{ fontSize: 13 }}>Votes are weighted by voter account age and activity and decay with a 180-day half-life. Paid placement never touches these numbers.</p>
        </div>
      </div>

      <div className="card" id="comments">
        <h2 style={{ marginTop: 0 }}>{item.commentCount} comments</h2>
        <CommentForm slug={item.slug} signedIn={!!session?.user} />
        {roots.map((c) => (
          <div key={c.id}>
            <div className="comment"><div className="who">@{c.user} · {c.createdAt.toISOString().slice(0, 10)}</div>{c.body}</div>
            {replies(c.id).map((r) => <div key={r.id} className="comment reply"><div className="who">@{r.user} · {r.createdAt.toISOString().slice(0, 10)}</div>{r.body}</div>)}
            <div className="comment reply" style={{ borderColor: "transparent" }}><CommentForm slug={item.slug} parentId={c.id} signedIn={!!session?.user} /></div>
          </div>
        ))}
      </div>

      {item.readme && (
        <div className="card"><h2 style={{ marginTop: 0 }}>README</h2><pre className="readme">{item.readme.slice(0, 20_000)}</pre></div>
      )}
    </>
  );
}
