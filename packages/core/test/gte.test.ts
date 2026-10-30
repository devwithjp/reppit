import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GteSmallEmbedder, SupabaseEmbedder, embedderFromEnv, defaultModelCache, GTE_SMALL_MODEL, LocalEmbedder, cosine } from "../src/embeddings";

describe("embedderFromEnv", () => {
  it("chooses by EMBEDDING_PROVIDER and defaults to gte-small when transformers.js is installed", () => {
    expect(embedderFromEnv({ EMBEDDING_PROVIDER: "local" })).toBeInstanceOf(LocalEmbedder);
    expect(embedderFromEnv({ EMBEDDING_PROVIDER: "gte-small" })).toBeInstanceOf(GteSmallEmbedder);
    expect(embedderFromEnv({})).toBeInstanceOf(GteSmallEmbedder);
    expect(embedderFromEnv({ EMBEDDING_PROVIDER: "supabase", EMBEDDING_FUNCTION_URL: "https://x.supabase.co/functions/v1/embed" })).toBeInstanceOf(SupabaseEmbedder);
    // Misconfigured remote: no URL, so it does not pretend.
    expect(embedderFromEnv({ EMBEDDING_PROVIDER: "supabase" })).toBeInstanceOf(LocalEmbedder);
    expect(embedderFromEnv({ EMBEDDING_PROVIDER: "supabase", EMBEDDING_FUNCTION_URL: "u" }).name).toBe("gte-small");
  });
});

describe("SupabaseEmbedder (client side of the embed edge function)", () => {
  const vec = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
  it("posts { input } with the key and returns the vectors", async () => {
    let sent: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => { sent = { url, init }; return new Response(JSON.stringify({ embeddings: [vec, vec] })); }) as typeof fetch;
    const e = new SupabaseEmbedder("https://p.supabase.co/functions/v1/embed", "service-secret", f);
    expect(await e.embed(["a", "b"])).toEqual([vec, vec]);
    expect(JSON.parse(String(sent!.init!.body))).toEqual({ input: ["a", "b"] });
    expect((sent!.init!.headers as Record<string, string>)["x-reppit-embed-key"]).toBe("service-secret");
    expect((sent!.init!.headers as Record<string, string>).authorization).toBeUndefined();
  });
  it("rejects errors and wrong shapes rather than storing garbage", async () => {
    const bad = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(new SupabaseEmbedder("u", undefined, bad({ error: "x" }, 500)).embed(["a"])).rejects.toThrow(/500/);
    await expect(new SupabaseEmbedder("u", undefined, bad({ embeddings: [[1, 2, 3]] })).embed(["a"])).rejects.toThrow(/shape/);
    await expect(new SupabaseEmbedder("u", undefined, bad({ embeddings: [] })).embed(["a"])).rejects.toThrow(/shape/);
  });
});

// Runs only when the model is already cached (no download in CI or offline).
const cached = fs.existsSync(path.join(defaultModelCache(), ...GTE_SMALL_MODEL.split("/")));
describe.skipIf(!cached)("gte-small in-process", () => {
  it("returns 384-dimension unit vectors that rank meaning, not just shared words", async () => {
    const e = new GteSmallEmbedder();
    const [q, polars, resize, sm] = await e.embed([
      "dataframe library faster than pandas",
      "polars: extremely fast query engine for DataFrames, written in Rust",
      "image resizing in python",
      "a finite state machine and statechart library",
    ]);
    expect(q).toHaveLength(384);
    expect(Math.sqrt(q.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 4);
    expect(cosine(q, polars)).toBeGreaterThan(cosine(q, resize));
    expect(cosine(q, polars)).toBeGreaterThan(cosine(q, sm));
  }, 60_000);
});
