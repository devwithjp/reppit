import { sql, desc } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ItemCard } from "@/components/ItemCard";
export const dynamic = "force-dynamic";
export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params; const t = decodeURIComponent(topic);
  const session = await auth(); const d = await db();
  const rows = await d.select({ id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description, language: items.language, stars: items.stars, upvotes: items.upvotes, downvotes: items.downvotes, healthScore: items.healthScore, commentCount: items.commentCount })
    .from(items).where(sql`${items.topics} @> ${JSON.stringify([t])}::jsonb`).orderBy(desc(items.weightedScore), desc(items.stars)).limit(50);
  return <><h1>#{t}</h1>{rows.length === 0 && <p className="muted">Nothing tagged {t} yet.</p>}{rows.map((r) => <ItemCard key={r.id} item={r} signedIn={!!session?.user} />)}</>;
}
