import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { EMBEDDING_DIMENSIONS } from "@gitit/db";

export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  /** USD per 1k tokens, for cost logging. */
  readonly costPer1kTokens: number;
}

/** Deterministic hashed bag-of-words embedder for dev and tests. No network, no cost. */
export class LocalEmbedder implements Embedder {
  readonly name = "local";
  readonly costPer1kTokens = 0;
  async embed(texts: string[]) { return texts.map((t) => hashEmbed(t, EMBEDDING_DIMENSIONS)); }
}

export class OpenAIEmbedder implements Embedder {
  readonly name = "openai";
  readonly costPer1kTokens = 0.00002; // text-embedding-3-small
  constructor(private apiKey: string, private model = "text-embedding-3-small") {}
  async embed(texts: string[]) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
    });
    if (!res.ok) throw new Error(`openai embeddings ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => normalize(d.embedding));
  }
}

/** The gte-small checkpoint Supabase publishes and runs in Edge Functions (`Supabase.ai.Session('gte-small')`). */
export const GTE_SMALL_MODEL = "Supabase/gte-small";
export const GTE_SMALL_DIMENSIONS = 384;
/** Model files live here, outside the repo and node_modules (about 34 MB for the q8 weights). */
export const defaultModelCache = (env = process.env) => env.REPPIT_MODEL_CACHE ?? path.join(os.homedir(), ".cache", "reppit", "transformers");

type FeatureExtractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

/**
 * gte-small in-process (transformers.js + onnxruntime-node, quantised q8 weights). Mean pooling and
 * L2 normalisation, the same as `session.run(text, { mean_pool: true, normalize: true })` in a
 * Supabase Edge Function. No key, no network after the first model download. The model loads lazily
 * on first use (about 1–2 s warm from the cache, longer on the very first download).
 */
export class GteSmallEmbedder implements Embedder {
  readonly name = "gte-small";
  readonly costPer1kTokens = 0;
  private extractor: Promise<FeatureExtractor> | null = null;
  constructor(private opts: { cacheDir?: string; dtype?: "q8" | "fp32" } = {}) {}
  private load(): Promise<FeatureExtractor> {
    this.extractor ??= (async () => {
      const t = await import("@huggingface/transformers");
      t.env.cacheDir = this.opts.cacheDir ?? defaultModelCache();
      return (await t.pipeline("feature-extraction", GTE_SMALL_MODEL, { dtype: this.opts.dtype ?? "q8" })) as unknown as FeatureExtractor;
    })();
    return this.extractor;
  }
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const fe = await this.load();
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16).map((t) => t || " ");
      out.push(...(await fe(batch, { pooling: "mean", normalize: true })).tolist());
    }
    return out;
  }
}

/**
 * gte-small through a Supabase Edge Function (packages/db/supabase/functions/embed). For serverless
 * hosts where onnxruntime cannot load or cold starts matter. POST { input: string[] } →
 * { embeddings: number[][] }. Vectors come from the same checkpoint as GteSmallEmbedder.
 */
export class SupabaseEmbedder implements Embedder {
  readonly name = "gte-small";
  readonly costPer1kTokens = 0;
  constructor(private url: string, private key?: string, private f: typeof fetch = fetch) {}
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const res = await this.f(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.key ? { "x-reppit-embed-key": this.key } : {}),
      },
      body: JSON.stringify({ input: texts }),
    });
    if (!res.ok) throw new Error(`embed function ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { embeddings?: number[][] };
    if (!Array.isArray(j.embeddings) || j.embeddings.length !== texts.length || j.embeddings.some((v) => v.length !== GTE_SMALL_DIMENSIONS)) {
      throw new Error("embed function returned an unexpected shape");
    }
    return j.embeddings;
  }
}

/** Whether transformers.js can be loaded here (it is an optional dependency of the web app). */
export function gteSmallAvailable(): boolean {
  try { createRequire(import.meta.url).resolve("@huggingface/transformers"); return true; } catch { return false; }
}

const g = globalThis as unknown as { __reppitGte?: GteSmallEmbedder };

/**
 * EMBEDDING_PROVIDER: "gte-small" (in-process), "supabase" (EMBEDDING_FUNCTION_URL, optional
 * EMBEDDING_FUNCTION_KEY), "local" (hashed, tests and offline dev), "openai" (OPENAI_API_KEY, asked
 * for 384 dimensions). Unset: gte-small when transformers.js is installed, else local. Voyage cannot
 * return 384 dimensions and is not offered.
 * Every provider named "gte-small" yields comparable vectors; never mix models in one index
 * (items.embedding_model records which one wrote each row).
 */
export function embedderFromEnv(env = process.env): Embedder {
  const p = (env.EMBEDDING_PROVIDER ?? (gteSmallAvailable() ? "gte-small" : "local")).toLowerCase();
  if (p === "gte-small") return (g.__reppitGte ??= new GteSmallEmbedder());
  if (p === "supabase" && env.EMBEDDING_FUNCTION_URL) return new SupabaseEmbedder(env.EMBEDDING_FUNCTION_URL, env.EMBEDDING_FUNCTION_KEY);
  if (p === "openai" && env.OPENAI_API_KEY) return new OpenAIEmbedder(env.OPENAI_API_KEY);
  return new LocalEmbedder();
}

/** Text we embed for an item. README is truncated; topics are repeated to weight them. */
export function itemEmbeddingText(i: { name: string; description?: string | null; topics?: string[] | null; readme?: string | null; language?: string | null }) {
  const topics = (i.topics ?? []).join(" ");
  const readme = (i.readme ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 4000);
  return `${i.name}. ${i.description ?? ""}. ${i.language ?? ""}. ${topics} ${topics}. ${readme}`.toLowerCase();
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set(["the","a","an","and","or","of","to","in","for","on","with","is","it","this","that","be","as","at","by","from","are","was","i","my","me","we","you","need","want","use","using","how","do","can","some","any"]);

function hashEmbed(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) {
    for (const g of [toks[i], i + 1 < toks.length ? `${toks[i]}_${toks[i + 1]}` : null]) {
      if (!g) continue;
      const h = fnv1a(g);
      const idx = h % dims;
      const sign = (h >>> 31) & 1 ? -1 : 1;
      v[idx] += sign * (g.includes("_") ? 0.5 : 1);
    }
  }
  return normalize(v);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function normalize(v: number[]): number[] {
  let n = 0; for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
