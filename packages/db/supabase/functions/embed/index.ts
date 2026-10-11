// Supabase Edge Function: gte-small query embeddings for reppit (deploy: supabase functions deploy embed).
//
// POST { input: string[] } (1 to 16 strings, each up to 2,000 characters)
//   → { embeddings: number[][] }, 384 dimensions, mean-pooled and L2-normalised.
// Same checkpoint and pooling as GteSmallEmbedder in packages/core (Supabase/gte-small), so vectors
// from this function and from the in-process embedder that built the index are comparable.
// Called by core's SupabaseEmbedder (EMBEDDING_PROVIDER=supabase, EMBEDDING_FUNCTION_URL,
// EMBEDDING_FUNCTION_KEY = the project's anon key). Deno runtime; not type-checked by the Node build.

// @ts-nocheck  Deno + Supabase globals
const session = new Supabase.ai.Session("gte-small");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST { input: string[] }" }, 405);
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
