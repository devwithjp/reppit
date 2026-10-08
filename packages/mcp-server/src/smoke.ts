/** Manual smoke test: spawn the stdio server, list tools, run one search. Usage: GITIT_API_URL=http://localhost:3100 node dist/smoke.js "problem" */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [path.join(here, "index.js")], env: { ...process.env } as Record<string, string> });
const client = new Client({ name: "gitit-smoke", version: "0.0.0" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const problem = process.argv[2] ?? "extract tables from PDF files in Python";
const res = await client.callTool({ name: "search_repos", arguments: { problem, limit: 3 } });
for (const c of res.content as { type: string; text?: string }[]) if (c.type === "text") console.log(c.text);
await client.close();
