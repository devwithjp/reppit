import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Build an environment for the explicitly local web runtime.
 *
 * Next loads .env.local automatically. Existing process variables win over
 * dotenv files, so empty database URLs deliberately force embedded PGlite even
 * when a previous hosted Supabase project is still recorded in .env.local.
 */
export function localRuntimeEnv(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return {
    ...source,
    DATABASE_URL: "",
    POSTGRES_URL: "",
    GITIT_AUTO_MIGRATE: "1",
    PGLITE_DIR: source.PGLITE_DIR || path.resolve(process.cwd(), ".pglite"),
  };
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "dev" && mode !== "start") {
    console.error("usage: tsx scripts/local-next.ts <dev|start>");
    process.exit(2);
  }

  const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  const child = spawn(process.execPath, [nextBin, mode, "-p", "3100"], {
    cwd: path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    env: localRuntimeEnv(process.env) as NodeJS.ProcessEnv,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(`could not start local Next.js: ${error.message}`);
    process.exit(1);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
