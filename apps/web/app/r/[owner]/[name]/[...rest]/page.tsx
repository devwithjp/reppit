import type { Metadata } from "next";
import { ItemView } from "@/app/_views/Item";

export const dynamic = "force-dynamic";

/** Skills live at owner/repo/path/to/skill, so their pages need more than two segments. */
type Params = { owner: string; name: string; rest: string[] };
const slugOf = (p: Params) => [p.owner, p.name, ...p.rest].map((s) => decodeURIComponent(s)).join("/");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  return { title: slugOf(await params) };
}

export default async function NestedItemPage({ params }: { params: Promise<Params> }) {
  return <ItemView slug={slugOf(await params)} />;
}
