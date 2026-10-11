import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { items } from "@gitit/db";
import { Listing } from "@/app/_views/Listing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  return { title: `#${decodeURIComponent((await params).topic)}` };
}

export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const t = decodeURIComponent((await params).topic).slice(0, 80);
  return <Listing title={`#${t}`} kicker="topics" here={`/t/${encodeURIComponent(t)}`}
    where={sql`${items.topics} @> ${JSON.stringify([t])}::jsonb`} empty={`Nothing tagged ${t} yet.`} />;
}
