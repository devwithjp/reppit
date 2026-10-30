import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = process.env.REPPIT_CAMPAIGN_STATE_PATH
  ?? path.join(root, "bip/campaign-state.json");
const queuePath = process.env.REPPIT_CAMPAIGN_QUEUE_PATH
  ?? path.join(root, "bip/queue.json");
const reviewDirectory = process.env.REPPIT_CAMPAIGN_REVIEW_DIR
  ?? path.join(root, "bip/review");
const campaignPath = process.env.REPPIT_CAMPAIGN_SOURCE_PATH
  ?? path.join(root, "bip/campaign.json");
const tweetsPath = process.env.REPPIT_CAMPAIGN_TWEETS_PATH
  ?? path.join(root, "docs/tweets.md");
const assetsDirectory = process.env.REPPIT_CAMPAIGN_ASSETS_DIR
  ?? path.join(root, "bip/campaign-assets");

const source = fs.readFileSync(campaignPath, "utf8");
const campaign = JSON.parse(source);
const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : { active: false, nights: [] };
const command = process.argv[2] || "status";
const canonicalCopy = fs
  .readFileSync(tweetsPath, "utf8")
  .split("\n")
  .map((line) => (line === ">" ? "" : line.startsWith("> ") ? line.slice(2) : line))
  .join("\n");

validateReviewedCampaign();
const digest = campaignDigest();
const windowStart = parseMinute(campaign.postingWindow?.start);
const windowEnd = parseMinute(campaign.postingWindow?.end);
if (windowStart < 17 * 60 || windowEnd <= windowStart || windowEnd >= 24 * 60) {
  throw new Error("Posting window must start at or after 17:00 and end later the same evening");
}

if (command === "activate") {
  activate();
} else if (command === "resume") {
  if (!state.nights.length) throw new Error("No schedule exists; activate it first");
  if (state.digest !== digest) throw new Error("Campaign changed after review; review it before resuming");
  state.active = true;
  delete state.error;
  saveState();
  console.log("Reminder scheduler resumed");
} else if (command === "reschedule") {
  reschedule();
} else if (command === "pause") {
  state.active = false;
  saveState();
  console.log("Paused");
} else if (command === "status") {
  console.log(JSON.stringify(state, null, 2));
} else if (command === "packet" || command === "preview") {
  const day = Number(process.argv[3] || 1);
  console.log(createPacket(day));
} else if (command === "tick") {
  tick();
} else if (command === "mark-posted") {
  markPosted();
} else {
  throw new Error(
    "Use status, activate, resume, reschedule, pause, packet <day>, tick, or mark-posted <day> <url-1> <url-2>",
  );
}

function activate() {
  if (state.nights.length) throw new Error("Schedule already exists; inspect state before changing it");
  const start = new Date();
  const local = localDateKey(start);
  for (let index = 0; index < campaign.days.length; index += 1) {
    let at = randomEvening(addDays(local, index));
    if (index === 0 && process.argv.includes("--now")) at = start;
    if (index === 0 && at < start) {
      throw new Error(
        `Tonight's ${campaign.postingWindow.start}-${campaign.postingWindow.end} window has passed.`,
      );
    }
    state.nights.push({ day: index + 1, at: at.toISOString(), status: "queued" });
  }
  state.active = true;
  state.digest = digest;
  saveState();
  console.log(`Activated ${campaign.days.length} reminder nights for @${campaign.account}`);
}

function reschedule() {
  if (!state.nights.length) throw new Error("No schedule exists; activate it first");
  for (const night of state.nights) {
    if (night.status !== "queued") continue;
    const at = randomEvening(localDateKey(new Date(night.at)));
    if (at <= new Date()) throw new Error(`Cannot reschedule day ${night.day} into a past window`);
    night.at = at.toISOString();
    syncQueueTime(night);
  }
  state.active = true;
  saveQueue();
  state.digest = campaignDigest();
  delete state.error;
  saveState();
  console.log(
    `Rescheduled reminders between ${campaign.postingWindow.start} and ${campaign.postingWindow.end} ${campaign.timezone}`,
  );
}

function tick() {
  if (!state.active) return;
  if (state.digest !== digest) {
    state.active = false;
    saveState();
    throw new Error("Campaign changed after review. Paused until reviewed again.");
  }
  if (state.nights.some((night) => night.status === "ready")) return;

  const night = state.nights.find(
    (candidate) => candidate.status === "queued" && new Date(candidate.at) <= new Date(),
  );
  if (!night) return;

  const reviewPath = createPacket(night.day);
  night.status = "ready";
  night.reviewPath = reviewPath;
  night.remindedAt = new Date().toISOString();
  saveState();
  notify(
    `Reppit campaign day ${night.day} is ready`,
    `Review the two posts and figures at ${reviewPath}. Post manually, then record both URLs.`,
  );
  console.log(`Review packet ready: ${reviewPath}`);
}

function markPosted() {
  const day = Number(process.argv[3]);
  const row = campaign.days[day - 1];
  const urls = process.argv.slice(4);
  if (!Number.isInteger(day) || !row) throw new Error("mark-posted needs a valid campaign day");
  if (urls.length !== row.posts.length) {
    throw new Error(`Day ${day} needs ${row.posts.length} X status URLs`);
  }
  const canonicalUrls = urls.map(canonicalStatusUrl);
  if (new Set(canonicalUrls).size !== canonicalUrls.length) {
    throw new Error("Every post in the thread needs a unique X status URL");
  }

  const night = state.nights.find((candidate) => candidate.day === day);
  if (!night) throw new Error(`Day ${day} is not in the active schedule`);
  if (night.status === "posted") {
    if (JSON.stringify(night.urls) !== JSON.stringify(canonicalUrls)) {
      throw new Error(`Day ${day} is already marked posted with different URLs`);
    }
    console.log(`Day ${day} was already recorded with these URLs`);
    return;
  }
  night.status = "posted";
  night.url = canonicalUrls[0];
  night.urls = canonicalUrls;
  night.postedAt = new Date().toISOString();
  delete night.reviewPath;
  delete night.remindedAt;
  if (state.nights.every((candidate) => candidate.status === "posted")) state.active = false;

  const slot = queue.slots.find((candidate) => candidate.name === `day-${day}`);
  for (let index = 0; index < slot.posts.length; index += 1) {
    queue.posted[slot.posts[index]] = { url: canonicalUrls[index], at: night.postedAt };
  }
  // Persist the queue first. If the state write is interrupted, the same command can
  // safely repair it on retry; state never claims success while the queue is missing.
  saveQueue();
  saveState();
  console.log(`Recorded day ${day}: ${canonicalUrls.join(" ")}`);
}

function canonicalStatusUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid X status URL: ${value}`);
  }
  if (!(["x.com", "twitter.com"].includes(url.hostname.toLowerCase()))) {
    throw new Error(`Invalid X status URL: ${value}`);
  }
  const match = /^\/([^/]+)\/status\/(\d+)\/?$/.exec(url.pathname);
  if (!match) throw new Error(`Invalid X status URL: ${value}`);
  if (match[1].toLowerCase() !== campaign.account.toLowerCase()) {
    throw new Error(`Status URL must belong to @${campaign.account}`);
  }
  return `https://x.com/${campaign.account}/status/${match[2]}`;
}

function createPacket(day) {
  const row = campaign.days[day - 1];
  if (!Number.isInteger(day) || !row) throw new Error(`Unknown campaign day: ${day}`);
  const slot = queue.slots.find((candidate) => candidate.name === `day-${day}`);
  if (!slot?.approved) throw new Error(`Day ${day} is not approved`);

  fs.mkdirSync(reviewDirectory, { recursive: true });
  const file = path.join(reviewDirectory, `day-${String(day).padStart(2, "0")}.html`);
  const cards = row.posts.map((post, index) => {
    const image = path.join(
      assetsDirectory,
      `day-${String(day).padStart(2, "0")}-${index + 1}.png`,
    );
    if (!fs.existsSync(image)) throw new Error(`Missing campaign figure: ${image}`);
    const relativeImage = path.relative(reviewDirectory, image).split(path.sep).join("/");
    return `<article>
      <h2>Post ${index + 1}</h2>
      <textarea id="post-${index + 1}" readonly>${escapeHtml(post)}</textarea>
      <button type="button" onclick="copyPost(${index + 1}, this)">Copy post ${index + 1}</button>
      <img src="${escapeHtml(relativeImage)}" alt="Stick figure for post ${index + 1}">
    </article>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reppit campaign day ${day}</title>
<style>
  :root{color-scheme:light;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f4f1e8;color:#151515}
  body{max-width:900px;margin:0 auto;padding:32px 18px 72px}header,article{border:2px solid #151515;background:#fff;padding:20px;margin:0 0 20px;box-shadow:5px 5px 0 #151515}
  h1,h2{margin-top:0}textarea{box-sizing:border-box;width:100%;min-height:190px;padding:14px;font:16px/1.45 system-ui,sans-serif;border:2px solid #151515;resize:vertical}
  button{margin:12px 0 18px;padding:10px 16px;border:2px solid #151515;background:#f6e45d;font:700 14px ui-monospace,monospace;cursor:pointer}
  img{display:block;width:100%;height:auto;border:2px solid #151515}code{background:#eee;padding:2px 5px}
</style></head><body>
<header><h1>Reppit · campaign day ${day}</h1><p>${escapeHtml(row.title)}</p>
<p>This page does not connect to X. Review each post, copy it into X yourself, attach the matching figure, and click Post yourself.</p>
<p>After both posts are live:</p><code>node bip/campaign.mjs mark-posted ${day} &lt;post-1-url&gt; &lt;post-2-url&gt;</code></header>
${cards}
<script>async function copyPost(number,button){const field=document.getElementById('post-'+number);try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(field.value)}else{field.focus();field.select();if(!document.execCommand('copy'))throw new Error('copy failed')}button.textContent='Copied';setTimeout(()=>button.textContent='Copy post '+number,1500)}catch{field.focus();field.select();button.textContent='Copy failed; text selected'}}</script>
</body></html>\n`;
  writeAtomic(file, html, 0o600);
  return file;
}

function validateReviewedCampaign() {
  for (let index = 0; index < campaign.days.length; index += 1) {
    const slot = queue.slots.find((candidate) => candidate.name === `day-${index + 1}`);
    if (!slot?.approved) throw new Error(`Day ${index + 1} is not approved in bip/queue.json`);
    for (const post of campaign.days[index].posts) {
      if (!canonicalCopy.includes(post)) {
        throw new Error(`Day ${index + 1} contains copy that is not in docs/tweets.md`);
      }
    }
  }
}

function campaignDigest() {
  const approvalProjection = queue.slots.map(
    ({ name, at_utc, post_at_utc, posts, approved, approved_at }) => ({
      name,
      at_utc,
      post_at_utc,
      posts,
      approved,
      approved_at,
    }),
  );
  return crypto
    .createHash("sha256")
    .update(source)
    .update(JSON.stringify(approvalProjection))
    .digest("hex");
}

function parseMinute(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) throw new Error(`Invalid posting window time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function localDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: campaign.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount, 12)).toISOString().slice(0, 10);
}

function timezoneOffset(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: campaign.timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - date.getTime();
}

function atLocalMinute(dateKey, minute) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
  let result = new Date(naive);
  for (let index = 0; index < 3; index += 1) {
    result = new Date(naive - timezoneOffset(result));
  }
  return result;
}

function randomEvening(dateKey) {
  return atLocalMinute(dateKey, crypto.randomInt(windowStart, windowEnd + 1));
}

function syncQueueTime(night) {
  const slot = queue.slots.find((candidate) => candidate.name === `day-${night.day}`);
  if (!slot?.approved) throw new Error(`Day ${night.day} is not approved in bip/queue.json`);
  slot.at_utc = night.at;
  delete slot.post_at_utc;
}

function notify(title, message) {
  const result = spawnSync("notify-send", [title, message], { stdio: "ignore" });
  if (result.error?.code !== "ENOENT" && result.status !== 0) {
    console.error("Desktop notification failed; the review packet was still created.");
  }
}

function saveState() {
  writeAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`, 0o600);
}

function saveQueue() {
  writeAtomic(queuePath, `${JSON.stringify(queue, null, 2)}\n`, 0o600);
}

function writeAtomic(file, contents, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, contents, { mode });
  fs.renameSync(temporary, file);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
