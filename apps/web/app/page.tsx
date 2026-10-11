import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { Landing } from "./_views/Landing";
import { Feed } from "./_views/Feed";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  return sp.sort || sp.kind || sp.page ? { title: "Browse" } : {};
}

/**
 * "/" is the landing page for a signed-out visitor and the feed for everyone else.
 * Any feed parameter (?sort, ?kind, ?page) opens the feed regardless, so "Open the directory" works signed out.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const wantsFeed = sp.sort !== undefined || sp.kind !== undefined || sp.page !== undefined;
  if (!viewer && !wantsFeed) return <Landing />;
  return <Feed viewer={viewer} sort={sp.sort} kind={sp.kind} page={sp.page} />;
}
