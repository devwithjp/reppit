import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { Feed } from "./_views/Feed";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const sp = await searchParams;
  return sp.sort || sp.kind || sp.page ? { title: "Browse" } : {};
}

/**
 * "/" is the feed for everyone, Reddit-style. A signed-out visitor on the plain home URL also gets the
 * welcome card with the claim and the problem search above the list.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string; kind?: string; page?: string }> }) {
  const sp = await searchParams;
  const viewer = await getViewer();
  const wantsFeed = sp.sort !== undefined || sp.kind !== undefined || sp.page !== undefined;
  return <Feed viewer={viewer} sort={sp.sort} kind={sp.kind} page={sp.page} welcome={!viewer && !wantsFeed} />;
}
