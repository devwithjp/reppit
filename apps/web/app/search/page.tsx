import Link from "next/link";
import { search } from "@gitit/core";
import { eq } from "drizzle-orm";
import { votes } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { embedder } from "@/lib/services";
import { explainWithClaude } from "@/lib/explain";
import { SearchBox } from "@/components/SearchBox";
import { ItemCard } from "@/components/ItemCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; language?: string }> }) {
  const { q = "", kind, language } = await searchParams;
  const session = await auth();
  const d = await db();
  const k = kind === "repo" || kind === "skill" || kind === "mcp" ? kind : undefined;
  let results = q.length >= 3 ? await search(d, embedder(), q, { kind: k, language, limit: 8 }) : [];
  results = await explainWithClaude(q, results);
  const mine = new Map<string, "up" | "down">();
  if (session?.user?.id) for (const v of await d.select({ itemId: votes.itemId, direction: votes.direction }).from(votes).where(eq(votes.userId, session.user.id))) mine.set(v.itemId, v.direction);

  return (
    <>
      <SearchBox q={q} kind={kind} />
      {q.length < 3 ? <p className="muted">Type at least 3 characters.</p> : results.length === 0 ? (
        <div className="card">Nothing indexed matches that yet. <Link href="/submit">Submit the repo you end up using</Link> so the next person finds it.</div>
      ) : (
        <>
          <p className="muted">Top {results.length} for “{q}”. Ranked by relevance, community votes, maintenance health and popularity.</p>
          {results.map((r, i) => (
            <ItemCard key={r.item.id} item={{ ...r.item, commentCount: undefined }} mine={mine.get(r.item.id) ?? null} signedIn={!!session?.user}>
              <p className="why">#{i + 1} · {r.why}</p>
              <div className="meta">
                <span className="score">score {r.score.toFixed(2)}</span><span className="score">match {(r.semantic * 100).toFixed(0)}%</span>
                {Object.entries(r.downvoteReasons).map(([k, n]) => <span key={k} className="badge flag">{k} ×{n}</span>)}
                {Object.entries(r.compat).map(([a, c]) => <span key={a} className={`badge ${c.works >= c.broken ? "ok" : "flag"}`}>{a}: {c.works}✓ {c.broken}✗</span>)}
              </div>
            </ItemCard>
          ))}
          <p className="note">Same results from your agent: <code>gitit find &quot;{q}&quot;</code> or the <code>search_repos</code> MCP tool.</p>
        </>
      )}
    </>
  );
}
