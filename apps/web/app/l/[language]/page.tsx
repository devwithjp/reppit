import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { items } from "@gitit/db";
import { Listing } from "@/app/_views/Listing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ language: string }> }): Promise<Metadata> {
  return { title: decodeURIComponent((await params).language) };
}

export default async function LanguagePage({ params }: { params: Promise<{ language: string }> }) {
  const l = decodeURIComponent((await params).language).slice(0, 60);
  return <Listing title={l} kicker="languages" here={`/l/${encodeURIComponent(l)}`}
    where={sql`lower(${items.language}) = ${l.toLowerCase()}`} empty={`No ${l} entries indexed yet.`} />;
}
