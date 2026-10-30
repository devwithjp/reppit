// Supabase Edge Function: gte-small query embeddings for reppit (deploy: supabase functions deploy embed).
//
// POST { input: string[] } (1 to 16 strings, each up to 2,000 characters)
//   → { embeddings: number[][] }, 384 dimensions, mean-pooled and L2-normalised.
// Same checkpoint and pooling as GteSmallEmbedder in packages/core (Supabase/gte-small), so vectors
// from this function and from the in-process embedder that built the index are comparable.
// Called server-to-server by core's SupabaseEmbedder. JWT verification is disabled in config.toml;
// this handler requires a separate REPPIT_EMBED_KEY secret and never accepts the browser key.

// @ts-nocheck  Deno + Supabase globals
const session = new Supabase.ai.Session("gte-small");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST { input: string[] }" }, 405);
  const expectedKey = Deno.env.get("REPPIT_EMBED_KEY");
  if (!expectedKey) return json({ error: "service is not configured" }, 503);
  const providedKey = req.headers.get("x-reppit-embed-key") ?? "";
  if (!(await equalSecret(providedKey, expectedKey))) return json({ error: "unauthorized" }, 401);
  let input: unknown;
  try { input = (await req.json())?.input; } catch { return json({ error: "body must be JSON" }, 400); }
  if (!Array.isArray(input) || input.length === 0 || input.length > 16 || !input.every((s) => typeof s === "string")) {
    return json({ error: "input must be 1 to 16 strings" }, 400);
  }
  const embeddings: number[][] = [];
  for (const text of input as string[]) {
    const v = await session.run(text.slice(0, 2000) || " ", { mean_pool: true, normalize: true });
    embeddings.push(Array.from(v as ArrayLike<number>));
  }
  return json({ embeddings });
});

async function equalSecret(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
