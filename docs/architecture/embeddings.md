# Embeddings

reppit embeds every item (name, description, language, topics, README head) and every search query with **gte-small**: 384 dimensions, mean-pooled, L2-normalised. It needs no API key and costs nothing per call.

Code: `packages/core/src/embeddings.ts`. `EMBEDDING_PROVIDER` picks the provider. Unset means `gte-small` when `@huggingface/transformers` is installed, and the hashed `local` embedder otherwise (tests and offline dev).

| Provider | Where it runs | Use |
|---|---|---|
| `gte-small` | in-process (transformers.js + onnxruntime-node, q8 weights) | building the index; queries on a long-running Node server |
| `supabase` | Supabase Edge Function `embed` (`packages/db/supabase/functions/embed`), `EMBEDDING_FUNCTION_URL` + `EMBEDDING_FUNCTION_KEY` | queries from serverless hosts |
| `local` | hashed bag of words | tests only; not comparable with the others |
| `openai` | OpenAI API, `dimensions: 384` | optional; a different model, so it needs a full re-embed |

`items.embedding_model` records which model wrote each row. `scripts/reembed.ts` re-embeds every row whose model differs from the configured one. It resumes where it stopped and writes after every batch. Never mix models in one index: their vectors are not comparable.

## Compatibility between the in-process model and the Edge Function

- **Checked:** `Supabase/gte-small` (the checkpoint Supabase publishes) and `Xenova/gte-small` give identical vectors in transformers.js (cosine 1.0000 on four test strings). Both use mean pooling and normalisation, the same options the Edge Function passes (`mean_pool: true, normalize: true`).
- **Not checked:** the Supabase Edge Runtime's own output. Running it locally needs the Supabase CLI with Docker, which isn't available on the dev machine. The runtime may also use a different precision than our q8 weights. Before switching queries to the function, embed about 20 strings both ways and require a cosine of at least 0.99 per pair. If it's lower, re-embed the index through the same path the queries use.

## Measurements (dev machine, Linux x64, CPU)

| | |
|---|---|
| Model download (first use) | about 34 MB to `~/.cache/reppit/transformers`, 12–14 s |
| Load from cache + first embedding | about 0.3 s |
| Query embedding, warm | about 3 ms |
| Resident memory with the model loaded | about 265 MB |
| Re-embedding the index (2,226 items, long texts) | 213 s, 10.5 items/s |
| Disk: onnxruntime-node (linux-x64 only) / transformers.js / onnxruntime-web / model | 43 MB / 48 MB / 69 MB / 34 MB |

## Search calibration

gte-small similarities sit in a narrow band: unrelated pairs often score 0.80 or more. `packages/core/src/search.ts` deals with that in two ways. Both were tuned on the 30 eval fixtures plus 7 junk negatives that must return nothing, never on the held-out queries.

- **Rescale for ranking:** before similarity is blended with lexical relevance, it is mapped from [0.82, 0.92] to [0, 1] (`GTE_SMALL_SEMANTIC_SCALE`, override with `SEARCH_SEMANTIC_SCALE=lo,hi`). Raw similarity gave hit@5 25/30 and hit@1 16/30; the rescale gives 28/30 and 20/30.
- **Admission by meaning, relative to each query** (`outlierRule`):
  - Per query, the similarity of a fixed pseudo-random baseline of 300 indexed items (ordered by `md5(id)`, so results are reproducible) gives a median and a spread (MAD × 1.4826).
  - A candidate that fails the full-text floor still passes if its similarity is at least median + k × spread, and within `margin` of the query's best match.
  - Keyboard mash gives a flat distribution, so nothing clears it.
  - Chosen: k = 5, margin = 0.03 (`SEARCH_OUTLIER_K`, `SEARCH_OUTLIER_MARGIN`).
- **The sweep that chose those values:**
  - With admission by meaning off: hit@5 27/30, hit@1 20/30, negatives empty 7/7.
  - k = 5: 28/30, 20/30, 7/7.
  - k = 4: one negative leaks.
  - k = 6 and above: 27/30.
  - The margin barely matters between 0.01 and 0.08.
  - k = 5 is one step above the value that leaks: keep watching the negatives as the index grows.
- **Untouched:** the local hashed embedder never admits on meaning. One-word queries and identifiers stay name lookups.

The word-based floor weights query terms by inverse document frequency over names, topics and descriptions. Frequent words like "self", "hosted", "list" or "tool" count for little, with no hand-written list. The rules:
- One of the query's two rarest terms must match in an item's name, topics or description.
- IDF-weighted coverage must reach 0.5.
- In one- or two-word queries, every word must be in those fields.
- A result admitted by meaning must also contain one of the two rarest terms somewhere, README included.

Requiring only the single rarest term was rejected: ordinary words like "manipulation", "read" and "render" are rare in this index and became mandatory, costing 6 eval hits. Tuned on 32 positives and 16 negatives (hit@5 30/32, hit@1 21/32, 16/16 empty). Overrides: `SEARCH_IDF_COVERAGE`, `SEARCH_DISTINCTIVE_MODE`, `SEARCH_SHORT_ALL`.

If the query embedder fails (the model can't load, or the function is down), search logs it and falls back to full-text only.

## Running under Next.js

`@huggingface/transformers`, `onnxruntime-node` and `sharp` are in `serverExternalPackages`. `@huggingface/transformers` is also a direct dependency of `apps/web`: with pnpm's strict layout, Next can keep a package out of the bundle only if the app itself resolves it. Otherwise webpack tries to bundle the native `.node` binding and the build fails.

Checked with `next build` + `next start -p 3100`: `/api/health` reports `gte-small`, the first search answered in 0.27 s (model load included), later ones in about 0.06 s, and keyboard mash returned `notIndexed: true`.

## Production plan (Vercel + Supabase)

**Index embedding** runs offline, in-process, from the ingest scripts and `reembed.ts`, on any Linux or macOS machine. It costs nothing.

**Query embedding**, one call per uncached search. Search results are cached for 10 minutes per normalised query, so repeats cost nothing.

1. **Default for launch: Supabase Edge Function** (`EMBEDDING_PROVIDER=supabase`). The Vercel function makes one HTTPS call per uncached search. Nothing native ships in the Vercel bundle.
   - **Cost:** Edge Function invocations only; Supabase's built-in model has no per-token charge. At the time of writing Supabase lists 500,000 invocations a month on the free plan, 2 million included on Pro, then $2 per million. That is $0 per 1,000 searches inside the quota and about $0.002 per 1,000 beyond it. Check the current pricing page before relying on these figures.
   - **Cold start:** not measured (no Supabase project available here). An Edge worker boots in milliseconds, but the first `Supabase.ai.Session` on a fresh worker also loads the model. Measure p50/p95 for cold and warm calls after the first deploy, before launch.
   - **Latency:** expect one network round trip to the function's region plus a few milliseconds of inference. Put the function in the same region as the database.
2. **Alternative: in-process on Vercel Node functions** (`EMBEDDING_PROVIDER=gte-small`).
   - **Bundle:** onnxruntime-node for linux-x64 (about 43 MB), transformers.js (about 48 MB) and the model (34 MB) must ship with the function, or the model downloads from Hugging Face on every cold start (an outside dependency on the hot path). The onnxruntime-web dependency adds 69 MB unless trimmed. That is close to Vercel's 250 MB unzipped function limit.
   - **Cold start:** about 0.3 s to load the model, plus Node and native module start-up.
   - **Memory:** about 265 MB.
   - **Cost:** function GB-seconds only, at about 3 ms per query once warm.
   - **When:** if the Edge Function's cold start turns out to be slow.
3. **Not used:** paid embedding APIs. The index is small (about 2,000 items), and gte-small runs free on our own hardware.

Set a dedicated random `REPPIT_EMBED_KEY` as a Supabase function secret, then deploy with `supabase functions deploy embed`. On Vercel set `EMBEDDING_PROVIDER=supabase`, `EMBEDDING_FUNCTION_URL=https://<project>.supabase.co/functions/v1/embed`, and `EMBEDDING_FUNCTION_KEY` to that same dedicated secret. Never reuse the browser publishable key. Keep the key server-side and keep building the index in-process.
