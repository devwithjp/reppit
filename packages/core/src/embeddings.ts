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

export class VoyageEmbedder implements Embedder {
  readonly name = "voyage";
  readonly costPer1kTokens = 0.00002; // voyage-3.5-lite
  constructor(private apiKey: string, private model = "voyage-3.5-lite") {}
  async embed(texts: string[]) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, output_dimension: EMBEDDING_DIMENSIONS }),
    });
    if (!res.ok) throw new Error(`voyage embeddings ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => normalize(d.embedding));
  }
}

export function embedderFromEnv(env = process.env): Embedder {
  const p = (env.EMBEDDING_PROVIDER ?? "local").toLowerCase();
  if (p === "openai" && env.OPENAI_API_KEY) return new OpenAIEmbedder(env.OPENAI_API_KEY);
  if (p === "voyage" && env.VOYAGE_API_KEY) return new VoyageEmbedder(env.VOYAGE_API_KEY);
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
