import { defineConfig } from "vitest/config";

// Unit tests only. The e2e/ folder is Playwright's and runs against a live build.
export default defineConfig({
  test: { exclude: ["e2e/**", "node_modules/**", ".next/**"] },
});
