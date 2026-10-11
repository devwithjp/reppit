import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests only. The e2e/ folder is Playwright's and runs against a live build.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { exclude: ["e2e/**", "node_modules/**", ".next/**"] },
});
