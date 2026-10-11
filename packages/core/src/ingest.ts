/** Write path shared by the backfill and seed scripts: hydrated repo → embedded, identity-resolved, signal-checked row. */
import type { Db } from "@gitit/db";
import type { Embedder } from "./embeddings";
import { itemEmbeddingText } from "./embeddings";
import { graphqlNodeToItem, manifestsOf, type RepoBatchResult } from "./graphql";
import { upsertRepoItem, applySignals } from "./identity";
import { checkPackageSignals, type FetchLike, type RepoManifests } from "./signals";
import type { NewItem } from "@gitit/db";

export interface IngestCounts { inserted: number; updated: number; renamed: number; adopted: number; missing: number; signalsChecked: number; signalsFailed: number }
export const emptyCounts = (): IngestCounts => ({ inserted: 0, updated: 0, renamed: 0, adopted: 0, missing: 0, signalsChecked: 0, signalsFailed: 0 });

export interface StoreOptions {
  checkSignals?: boolean;
  fetch?: FetchLike;
  now?: Date;
  log?: (msg: string) => void;
}

export interface PreparedRepo { row: NewItem; requestedSlug?: string; manifests?: RepoManifests | (() => Promise<RepoManifests>) }

/** Embed, upsert by github_id (recording renames), then check package signals. */
export async function storeRepos(db: Db, embedder: Embedder, repos: PreparedRepo[], opts: StoreOptions = {}, counts: IngestCounts = emptyCounts()): Promise<IngestCounts> {
  if (repos.length === 0) return counts;
  const log = opts.log ?? (() => {});
  const vecs = await embedder.embed(repos.map((r) => itemEmbeddingText(r.row)));
  for (const [i, r] of repos.entries()) {
    const res = await upsertRepoItem(db, { ...r.row, embedding: vecs[i], embeddingModel: embedder.name, embeddedAt: opts.now ?? new Date() }, { requestedSlug: r.requestedSlug, now: opts.now });
    counts[res.action]++;
    if (res.action === "renamed" || res.action === "adopted") log(`  ${res.previousSlug ?? r.requestedSlug} -> ${res.slug} (${res.action})`);
    else if (r.requestedSlug && r.requestedSlug.toLowerCase() !== res.slug.toLowerCase()) log(`  ${r.requestedSlug} -> ${res.slug} (resolved by GitHub)`);
    if (res.displaced.length) log(`  relabelled ${res.displaced.length} stale row(s) that held ${res.slug}`);
    if (opts.checkSignals && r.manifests) {
      const manifests = typeof r.manifests === "function" ? await r.manifests() : r.manifests;
      const slugs = [res.slug, r.requestedSlug, res.previousSlug].filter((s): s is string => !!s);
      const s = await checkPackageSignals(slugs, manifests, opts.fetch, opts.now, { language: r.row.language });
      if (await applySignals(db, res.id, s, opts.now)) counts.signalsChecked++; else counts.signalsFailed++;
    }
  }
  return counts;
}

/** GraphQL batch results → prepared repos. Unresolvable refs are counted as missing. */
export function prepareGraphqlResults(results: RepoBatchResult[], counts: IngestCounts, now?: Date): PreparedRepo[] {
  const out: PreparedRepo[] = [];
  for (const r of results) {
    if (!r.node) { counts.missing++; continue; }
    out.push({ row: graphqlNodeToItem(r.node, now), requestedSlug: `${r.requested.owner}/${r.requested.name}`, manifests: manifestsOf(r.node) });
  }
  return out;
}
