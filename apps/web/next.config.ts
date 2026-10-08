import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gitit/core", "@gitit/db"],
  serverExternalPackages: ["@electric-sql/pglite", "pg", "drizzle-orm"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};
export default config;
