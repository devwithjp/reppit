import Link from "next/link";
import { desc, eq, and, gte, lte, type SQL } from "drizzle-orm";
import { items, votes, featuredListings } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { SearchBox } from "@/components/SearchBox";
import { ItemCard } from "@/components/ItemCard";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; kind?: string }> }) {
  const { sort = "hot", kind } = await searchParams;
  const session = await auth();
  const d = await db();
  const where: SQL[] = [];
  if (kind === "repo" || kind === "skill" || kind === "mcp") where.push(eq(items.kind, kind));
  const order = sort === "top" ? desc(items.weightedScore) : sort === "new" ? desc(items.createdAt) : desc(items.hotScore);
  const rows = await d.select({
    id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description, language: items.language,
    stars: items.stars, upvotes: items.upvotes, downvotes: items.downvotes, healthScore: items.healthScore, commentCount: items.commentCount,
  }).from(items).where(where.length ? and(...where) : undefined).orderBy(order).limit(30);

  // Paid placement: separate query, separate slot, clearly labelled. Never mixed into `rows`.
  const now = new Date();
  const featured = await d.select({ label: featuredListings.label, slug: items.slug, description: items.description, url: items.url, kind: items.kind })
    .from(featuredListings).innerJoin(items, eq(items.id, featuredListings.itemId))
    .where(and(lte(featuredListings.startsAt, now), gte(featuredListings.endsAt, now))).limit(1);

  const mine = new Map<string, "up" | "down">();
  if (session?.user?.id && rows.length) {
    const vs = await d.select({ itemId: votes.itemId, direction: votes.direction }).from(votes).where(eq(votes.userId, session.user.id));
    for (const v of vs) mine.set(v.itemId, v.direction);
  }

  return (
    <>
      <h1>Which repo or skill should I use for…</h1>
      <SearchBox kind={kind} />
      <div className="tabs" style={{ marginBottom: 12 }}>
        {["hot", "top", "new"].map((s) => <Link key={s} href={`/?sort=${s}${kind ? `&kind=${kind}` : ""}`} className={sort === s ? "on" : ""}>{s}</Link>)}
        <span className="muted" style={{ marginLeft: 12 }}>
          {["", "repo", "skill", "mcp"].map((k) => <Link key={k} href={`/?sort=${sort}${k ? `&kind=${k}` : ""}`} className={(kind ?? "") === k ? "on" : ""}>{k || "all"}</Link>)}
        </span>
      </div>
      {featured[0] && (
        <div className="card sponsored">
          <div className="label">{featured[0].label}</div>
          <Link href={`/r/${featured[0].slug}`} className="title">{featured[0].slug}</Link> <span className="badge kind">{featured[0].kind}</span>
          <p className="desc">{featured[0].description}</p>
          <small>Paid placement. Does not affect rankings below.</small>
        </div>
      )}
      {rows.length === 0 && <div className="card">No items yet. <Link href="/submit">Submit a repo</Link> or run <code>pnpm seed</code>.</div>}
      {rows.map((r) => <ItemCard key={r.id} item={r} mine={mine.get(r.id) ?? null} signedIn={!!session?.user} />)}
    </>
  );
}
