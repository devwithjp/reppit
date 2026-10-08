import Link from "next/link";
import { VoteButtons } from "./VoteButtons";

export interface CardItem { kind: string; slug: string; url: string; description: string | null; language: string | null; stars: number; upvotes: number; downvotes: number; healthScore: number; commentCount?: number }

export function ItemCard({ item, mine = null, signedIn, children }: { item: CardItem; mine?: "up" | "down" | null; signedIn: boolean; children?: React.ReactNode }) {
  return (
    <div className="card row">
      <VoteButtons slug={item.slug} upvotes={item.upvotes} downvotes={item.downvotes} mine={mine} signedIn={signedIn} />
      <div className="body">
        <Link href={`/r/${item.slug}`} className="title">{item.slug}</Link>{" "}
        <span className="badge kind">{item.kind}</span>
        {item.description && <p className="desc">{item.description}</p>}
        {children}
        <div className="meta">
          {item.language && <span>{item.language}</span>}
          <span>★ {item.stars.toLocaleString()}</span>
          <span title="maintenance health">health {(item.healthScore * 100).toFixed(0)}%</span>
          {item.commentCount !== undefined && <Link href={`/r/${item.slug}#comments`}>{item.commentCount} comments</Link>}
          <a href={item.url} target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </div>
    </div>
  );
}
