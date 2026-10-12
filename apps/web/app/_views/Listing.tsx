import Link from "next/link";
import { desc, type SQL } from "drizzle-orm";
import { items } from "@gitit/db";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { ItemRow } from "@/components/ItemRow";
import { StripKey } from "@/components/marks";
import { rowColumns, loadExtras } from "../_data/items";

/** Topic and language listings. v2 surfaces: reachable by URL, not linked from primary navigation. */
export async function Listing({ title, kicker, where, here, empty }: { title: string; kicker: string; where: SQL; here: string; empty: string }) {
  const viewer = await getViewer();
  const d = await db();
  const rows = await d.select(rowColumns).from(items).where(where).orderBy(desc(items.weightedScore), desc(items.stars)).limit(50);
  const extras = await loadExtras(d, rows.map((r) => r.id), viewer?.id ?? null);
  return (
    <>
      <Masthead viewer={viewer} current="browse" next={here} />
      <main className="wrap" id="main">
        <nav className="crumbs" aria-label="Breadcrumb"><Link href="/?sort=trusted">browse</Link> / {kicker} / <b>{title}</b></nav>
        <div className="toolbar"><h1 className="list-h1">{title}</h1><span className="meta">{rows.length === 50 ? "top 50" : rows.length} by community score, then stars</span></div>
        <StripKey />
        {rows.length === 0 ? (
          <div className="nothing"><h3>{empty}</h3><p>Try <Link className="inline-link" href="/search">searching by problem</Link> instead.</p></div>
        ) : (
          <div className="list">{rows.map((r, i) => <ItemRow key={r.id} item={r} extras={extras} signedIn={!!viewer} rank={i + 1} />)}</div>
        )}
      </main>
      <Footer />
    </>
  );
}
