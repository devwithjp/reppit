import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const baseUrl = process.env.REPPIT_DEMO_URL ?? "http://127.0.0.1:3100";
const apiUrl = process.env.REPPIT_API_URL ?? "http://127.0.0.1:3101";
const cli = path.join(root, "packages/cli-rs/target/release/reppit");
const output = path.join(root, "bip/campaign-assets/reppit-product-demo.webm");
const videoDir = mkdtempSync(path.join(os.tmpdir(), "reppit-demo-video-"));

function runCli(args, cwd = root) {
  return JSON.parse(execFileSync(cli, args, {
    cwd,
    env: { ...process.env, REPPIT_API_URL: apiUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
}

const task = "video editing to make cinematic videos";
const recommendation = runCli(["get", "skills", task, "--json", "--limit", "3"]);
const selected = runCli(["get", "skills", task, "--select", "1", "--instructions", "--json", "--limit", "3"]);
const installRoot = mkdtempSync(path.join(os.tmpdir(), "reppit-demo-install-"));
const installWork = path.join(installRoot, "project");
mkdirSync(installWork);
const installed = runCli(["get", "skills", task, "--install-top", "--json", "--limit", "1"], installWork);

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const comic = readFileSync(path.join(root, "bip/campaign-assets/day-16-2.png")).toString("base64");

function frame(body, extra = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f5f7fa;color:#19202a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    .stage{height:100%;display:flex;align-items:center;justify-content:center;padding:44px}.card{background:white;border:1px solid #d8dee8;border-radius:18px;box-shadow:0 18px 60px #17203318;overflow:hidden}
    .eyebrow{font-size:18px;font-weight:750;color:#df3f00;letter-spacing:.04em;text-transform:uppercase}.title{font-size:48px;line-height:1.05;font-weight:820;margin:10px 0 12px}.sub{font-size:23px;line-height:1.45;color:#566170}
    ${extra}
  </style></head><body>${body}</body></html>`;
}

async function caption(page, title, sub) {
  await page.evaluate(({ title, sub }) => {
    document.getElementById("reppit-demo-caption")?.remove();
    const box = document.createElement("div");
    box.id = "reppit-demo-caption";
    box.innerHTML = `<b>${title}</b><span>${sub}</span>`;
    Object.assign(box.style, {
      position: "fixed", left: "28px", right: "28px", bottom: "24px", zIndex: "2147483647",
      display: "flex", alignItems: "baseline", gap: "15px", padding: "15px 20px",
      background: "rgba(18,24,33,.94)", color: "white", borderRadius: "12px",
      boxShadow: "0 12px 40px rgba(0,0,0,.24)", font: "18px/1.35 Inter,system-ui,sans-serif",
    });
    box.querySelector("b").style.fontSize = "21px";
    box.querySelector("span").style.color = "#d4d9e1";
    document.body.append(box);
  }, { title, sub });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

await page.setContent(frame(`<main class="stage"><section style="display:grid;grid-template-columns:1.15fr .85fr;gap:34px;align-items:center;max-width:1160px"><div><div class="eyebrow">reppit</div><h1 class="title">Two ways to find what already works.</h1><p class="sub">Browse the ranked community when you want to explore. Ask by task when an agent needs a skill now.</p></div><div class="card"><img alt="Two doors, one index" src="data:image/png;base64,${comic}" style="display:block;width:100%;height:auto"></div></section></main>`));
await delay(4300);

await page.goto(`${baseUrl}/?sort=trusted`, { waitUntil: "networkidle" });
await caption(page, "Browse like Reddit.", "Repos, votes, reasons, comments and a score you can inspect.");
await page.locator('[data-testid="feed-row"]').nth(1).hover();
await delay(6200);

await page.locator('[data-slug="drizzle-team/drizzle-orm"] .repo').click();
await page.waitForLoadState("networkidle");
await caption(page, "Trust is measured.", "The page shows each signal instead of hiding it behind one number.");
const trustHeading = page.getByText("How this score was built").first();
if (await trustHeading.count()) await trustHeading.scrollIntoViewIfNeeded();
await delay(6200);

const comments = page.locator("#comments");
if (await comments.count()) await comments.scrollIntoViewIfNeeded();
await caption(page, "Discussion carries the tradeoff.", "Votes rank it. Comments explain when the choice works—and when it does not.");
await delay(4700);

const rows = recommendation.results.map((r, i) => {
  const source = r.item.url.replace("https://github.com/", "github.com/");
  return `<div class="result"><b>${i + 1}. ${esc(r.item.name)}</b><span>${esc(r.item.description ?? "")}</span><small>${esc(source)}</small></div>`;
}).join("");
await page.setContent(frame(`<main class="stage"><section class="terminal"><div class="dots"><i></i><i></i><i></i></div><div class="prompt"><em>$</em> reppit get skills &quot;${esc(task)}&quot; --limit 3</div>${rows}</section></main>`, `
  .terminal{width:1110px;min-height:590px;background:#10151d;color:#eef2f7;border-radius:18px;padding:29px 34px;box-shadow:0 22px 70px #0b102044;font:20px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}.dots{display:flex;gap:8px;margin-bottom:24px}.dots i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840}.prompt{font-weight:700;margin-bottom:23px}.prompt em{color:#ff5a1f;font-style:normal}.result{border-top:1px solid #2b3442;padding:16px 0;display:grid;grid-template-columns:270px 1fr;gap:3px 20px}.result b{color:#fff}.result span{color:#cbd3df}.result small{grid-column:2;color:#75a7ff;font-size:14px}
`));
await delay(7800);

const instructionLine = String(selected.instructions ?? "").split("\n").find((line) => line.trim() && line.trim() !== "---" && !line.includes(":")) ?? "Instructions fetched from the pinned skill.";
await page.setContent(frame(`<main class="stage"><section class="terminal"><div class="dots"><i></i><i></i><i></i></div><div class="prompt"><em>$</em> reppit get skills &quot;${esc(task)}&quot; --select 1 --instructions</div><p class="ok">selected: ${esc(selected.selected)}</p><p>${esc(instructionLine)}</p><div class="prompt second"><em>$</em> reppit get skills &quot;${esc(task)}&quot; --install-top --json --limit 1</div><pre>${esc(JSON.stringify({ selected: installed.selected, installed: installed.installed }, null, 2))}</pre><p class="pin">✓ source fetched and verified at the indexed 40-character commit</p></section></main>`, `
  .terminal{width:1110px;min-height:590px;background:#10151d;color:#eef2f7;border-radius:18px;padding:29px 34px;box-shadow:0 22px 70px #0b102044;font:20px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.dots{display:flex;gap:8px;margin-bottom:24px}.dots i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.dots i:nth-child(2){background:#febc2e}.dots i:nth-child(3){background:#28c840}.prompt{font-weight:700}.prompt em{color:#ff5a1f;font-style:normal}.second{margin-top:38px}.ok,.pin{color:#72d99b}pre{background:#0a0e14;border:1px solid #2b3442;border-radius:10px;padding:14px 18px;color:#d7e3ff}
`));
await delay(7600);

await page.setContent(frame(`<main class="stage"><section style="text-align:center;max-width:980px"><div class="eyebrow">reppit</div><h1 class="title" style="font-size:64px">Browse repos.<br>Find skills for the task.</h1><p class="sub">Community ranking for people. Task-based recommendations for agents.</p><div style="margin-top:30px;font-size:25px;font-weight:800;color:#df3f00">reppit.dev</div></section></main>`));
await delay(4400);

const video = page.video();
await context.close();
await video.saveAs(output);
await browser.close();
console.log(JSON.stringify({ output, installed: installed.installed, selected: installed.selected, results: recommendation.results.length }));
