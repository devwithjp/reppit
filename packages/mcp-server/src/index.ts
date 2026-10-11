#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { z } from "zod";
import { ReppitClient, formatResults, formatTrust, installCommand } from "./client.js";

export function buildServer(client = new ReppitClient()) {
  const server = new McpServer({ name: "reppit", version: "0.1.0" });

  server.registerTool("search_repos", {
    title: "Find the best repo or skill for a problem",
    description: "Describe a programming problem in plain language. Returns the top community-ranked GitHub repos, agent skills or MCP servers with a one-line reason each, downvote flags, per-agent compatibility reports and an install command. Each result carries a trust score (0-100, or 'not enough data') built from maintenance, archived/deprecated status, security advisories and issue load, adjusted by community votes. Archived and deprecated items never outrank healthy ones. Use this before recommending a library or writing something from scratch.",
    inputSchema: {
      problem: z.string().min(3).describe("The problem, e.g. 'parse PDF tables in Python' or 'a skill for writing Playwright tests'"),
      language: z.string().optional().describe("Filter by primary language, e.g. python, typescript"),
      kind: z.enum(["repo", "skill", "mcp"]).optional().describe("Restrict to repos, agent skills, or MCP servers"),
      limit: z.number().int().min(1).max(10).optional().describe("Number of results, default 5"),
    },
  }, async ({ problem, language, kind, limit }) => {
    const { results, notIndexed } = await client.search(problem, { language, kind, limit });
    return { content: [{ type: "text", text: formatResults(results, notIndexed) }], structuredContent: { results, notIndexed: notIndexed ?? results.length === 0 } };
  });

  server.registerTool("get_repo", {
    title: "Get details for a repo or skill",
    description: "Full details for one item by slug (owner/name): description, trust score and its signals, README excerpt, votes, agent compatibility, recent comments. Old slugs of renamed or transferred repos resolve to the current one.",
    inputSchema: { slug: z.string().describe("owner/name") },
  }, async ({ slug }) => {
    const item = await client.item(slug);
    const text = [
      `${item.slug} (${item.kind}) — ${item.url}`,
      item.redirect ? `(${item.redirect.from} is now ${item.redirect.to})` : "",
      item.description ?? "",
      `${formatTrust(item.trust)} · votes +${item.upvotes}/-${item.downvotes} · ★${item.stars} · ${item.license ?? "no license"}`,
      item.trust ? item.trust.cells.map((c) => `  ${c.state === "not_applicable" ? "-" : c.state === "unknown" ? "?" : c.state === "good" ? "✓" : c.state === "slipping" ? "~" : "✗"} ${c.short}: ${c.label}`).join("\n") : "",
      `topics: ${item.topics.join(", ")}`, `install: ${installCommand(item)}`,
      item.comments?.length ? `\nrecent comments:\n${item.comments.map((c) => `- @${c.user}: ${c.body}`).join("\n")}` : "",
      item.readme ? `\nREADME (excerpt):\n${item.readme.slice(0, 3000)}` : "",
    ].join("\n");
    return { content: [{ type: "text", text }] };
  });

  server.registerTool("vote", {
    title: "Upvote or downvote a repo or skill",
    description: "Cast the user's vote. Downvotes require a reason tag. Only call this when the user explicitly asks to vote; never vote on the user's behalf unprompted. Requires REPPIT_API_KEY (a personal token from reppit.dev/account).",
    inputSchema: {
      slug: z.string(),
      direction: z.enum(["up", "down"]),
      reason: z.enum(["unmaintained", "insecure", "broken-on-agent", "misleading", "low-quality"]).optional().describe("Required for downvotes"),
    },
  }, async ({ slug, direction, reason }) => {
    await client.vote(slug, direction, reason);
    return { content: [{ type: "text", text: `Recorded ${direction}vote on ${slug}${reason ? ` (${reason})` : ""}.` }] };
  });

  server.registerTool("report_compat", {
    title: "Report whether a skill or repo works on an agent",
    description: "Record that an item works or is broken on a specific coding agent (claude-code, codex, cursor, gemini-cli, copilot, windsurf). Call this after the user confirms the outcome of trying it. Requires REPPIT_API_KEY (a personal token from reppit.dev/account).",
    inputSchema: { slug: z.string(), agent: z.string(), status: z.enum(["works", "broken"]), note: z.string().optional() },
  }, async ({ slug, agent, status, note }) => {
    await client.reportCompat(slug, agent, status, note);
    return { content: [{ type: "text", text: `Recorded: ${slug} ${status} on ${agent}.` }] };
  });

  server.registerTool("install_skill", {
    title: "Get the install command for a result",
    description: "Returns the exact shell command to install a skill (via npx skills add) or add a library. Does not execute it.",
    inputSchema: { slug: z.string() },
  }, async ({ slug }) => {
    const item = await client.item(slug);
    return { content: [{ type: "text", text: installCommand(item) }] };
  });

  return server;
}

async function main() {
  const args = process.argv.slice(2);
  const server = buildServer();
  if (args.includes("--http")) {
    const port = Number(process.env.PORT ?? 3200);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    createServer((req, res) => {
      if (req.url?.startsWith("/mcp")) {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => transport.handleRequest(req, res, body ? JSON.parse(body) : undefined));
      } else { res.writeHead(404).end(); }
    }).listen(port, () => console.error(`reppit MCP (streamable http) on :${port}/mcp`));
  } else {
    await server.connect(new StdioServerTransport());
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, "/"));
if (isMain) main().catch((e) => { console.error(e); process.exit(1); });
