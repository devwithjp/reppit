import { sql, desc } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ItemCard } from "@/components/ItemCard";
export const dynamic = "force-dynamic";
export default async function LanguagePage({ params }: { params: Promise<{ language: string }> }) {
  const { language } = await params; const l = decodeURIComponent(language);
  const session = await auth(); const d = await db();
  const rows = await d.select({ id: items.id, kind: items.kind, slug: items.slug, url: items.url, description: items.description, language: items.language, stars: items.stars, upvotes: items.upvotes, downvotes: items.downvotes, healthScore: items.healthScore, commentCount: items.commentCount })
    .from(items).where(sql`lower(${items.language}) = ${l.toLowerCase()}`).orderBy(desc(items.weightedScore), desc(items.stars)).limit(50);
  return <><h1>{l}</h1>{rows.length === 0 && <p className="muted">No {l} items yet.</p>}{rows.map((r) => <ItemCard key={r.id} item={r} signedIn={!!session?.user} />)}</>;
}
