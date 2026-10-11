#!/usr/bin/env node
import { ReppitClient, formatResults, formatTrust, installCommand } from "reppit-mcp/client";
import { confirm } from "./confirm.js";

const HELP = `reppit — community-ranked repos and agent skills

Usage:
  reppit find "<problem>" [--lang python] [--kind repo|skill|mcp] [-n 5]
  reppit show <owner/name>
  reppit add <owner/name> [--yes]     print the install command; for skills, run it after you confirm
  reppit vote <owner/name> up|down [--reason unmaintained|insecure|broken-on-agent|misleading|low-quality]
  reppit compat <owner/name> <agent> works|broken [--note "..."]

Env: REPPIT_API_URL (default https://reppit.dev), REPPIT_API_KEY (personal token, needed for vote/compat).
     GITIT_API_URL / GITIT_API_KEY are still read as fallbacks.`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const client = new ReppitClient();
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
      if (it.redirect) console.error(`(${it.redirect.from} is now ${it.redirect.to})`);
      console.log(`${it.slug} (${it.kind}) — ${it.url}\n${it.description ?? ""}\n${formatTrust(it.trust)} · votes +${it.upvotes}/-${it.downvotes} · ★${it.stars}\ninstall: ${installCommand(it)}`);
      for (const c of it.trust?.cells ?? []) console.log(`  ${c.state.padEnd(8)} ${c.short}: ${c.label}`);
      break;
    }
    case "add": {
      const it = await client.item(rest.find((a) => !a.startsWith("-")) ?? "");
      const c = installCommand(it);
      console.log(c);
      if (it.kind === "skill") {
        const ok = await confirm(`Run \`npx skills add ${it.slug}\`?`, { yes: rest.includes("--yes") || rest.includes("-y") });
        if (!ok) { console.error("Not installed."); process.exit(1); }
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
