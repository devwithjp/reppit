#!/usr/bin/env node
import { GititClient, formatResults, installCommand } from "@gitit/mcp-server/client";

const HELP = `gitit — community-ranked repos and agent skills

Usage:
  gitit find "<problem>" [--lang python] [--kind repo|skill|mcp] [-n 5]
  gitit show <owner/name>
  gitit add <owner/name>              print (and for skills, run) the install command
  gitit vote <owner/name> up|down [--reason unmaintained|insecure|broken-on-agent|misleading|low-quality]
  gitit compat <owner/name> <agent> works|broken [--note "..."]

Env: GITIT_API_URL (default https://gitit.dev), GITIT_API_KEY (needed for vote/compat)`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const client = new GititClient();
  switch (cmd) {
    case "find": {
      const problem = rest.filter((a) => !a.startsWith("-") && rest[rest.indexOf(a) - 1]?.startsWith("-") !== true)[0];
      if (!problem) throw new Error("find needs a problem string");
      const { results, cached } = await client.search(problem, { language: flag(rest, "--lang"), kind: flag(rest, "--kind"), limit: flag(rest, "-n") ? Number(flag(rest, "-n")) : undefined });
      console.log(formatResults(results)); if (cached) console.error("(cached)");
      break;
    }
    case "show": {
      const it = await client.item(rest[0]);
      console.log(`${it.slug} (${it.kind}) — ${it.url}\n${it.description ?? ""}\nvotes +${it.upvotes}/-${it.downvotes} · health ${(it.healthScore * 100).toFixed(0)}% · ★${it.stars}\ninstall: ${installCommand(it)}`);
      break;
    }
    case "add": {
      const it = await client.item(rest[0]);
      const c = installCommand(it);
      console.log(c);
      if (it.kind === "skill") {
        const { spawn } = await import("node:child_process");
        await new Promise<void>((res, rej) => { const p = spawn("npx", ["skills", "add", it.slug], { stdio: "inherit" }); p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`exit ${code}`)))); });
      }
      break;
    }
    case "vote": {
      const [slug, dir] = rest; if (dir !== "up" && dir !== "down") throw new Error("direction must be up|down");
      await client.vote(slug, dir, flag(rest, "--reason")); console.log("ok"); break;
    }
    case "compat": {
      const [slug, agent, status] = rest; if (status !== "works" && status !== "broken") throw new Error("status must be works|broken");
      await client.reportCompat(slug, agent, status, flag(rest, "--note")); console.log("ok"); break;
    }
    default: console.log(HELP); process.exit(cmd ? 1 : 0);
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
