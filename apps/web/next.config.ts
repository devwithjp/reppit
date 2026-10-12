import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gitit/core", "@gitit/db"],
  // transformers.js and onnxruntime-node are native and load model files at runtime: never bundle them.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "drizzle-orm", "@huggingface/transformers", "onnxruntime-node", "sharp"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  // On Vercel, query embeddings come from the Supabase embed function (EMBEDDING_PROVIDER=supabase),
  // so the in-process model and its native runtime stay out of the function bundle.
  ...(process.env.VERCEL ? {
    outputFileTracingExcludes: { "*": ["**/onnxruntime-node/**", "**/onnxruntime-web/**", "**/@huggingface/transformers/**", "**/sharp/**", "**/@img/**"] },
  } : {}),
};
export default config;
