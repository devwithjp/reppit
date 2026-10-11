import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gitit/core", "@gitit/db"],
  // transformers.js and onnxruntime-node are native and load model files at runtime: never bundle them.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "drizzle-orm", "@huggingface/transformers", "onnxruntime-node", "sharp"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};
export default config;
