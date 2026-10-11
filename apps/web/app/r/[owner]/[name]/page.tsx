import type { Metadata } from "next";
import { ItemView } from "@/app/_views/Item";

export const dynamic = "force-dynamic";

type Params = { owner: string; name: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, name } = await params;
  return { title: `${decodeURIComponent(owner)}/${decodeURIComponent(name)}` };
}

export default async function ItemPage({ params }: { params: Promise<Params> }) {
  const { owner, name } = await params;
  return <ItemView slug={`${decodeURIComponent(owner)}/${decodeURIComponent(name)}`} />;
}
