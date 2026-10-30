import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("packet creates a local review page without opening or posting to X", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reppit-campaign-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "campaign-state.json");
  const queuePath = path.join(directory, "queue.json");
  const reviewDirectory = path.join(directory, "review");
  await writeFile(statePath, await readFile(path.join(root, "bip/campaign-state.json")));
  await writeFile(queuePath, await readFile(path.join(root, "bip/queue.json")));

  const result = await runCampaign(["packet", "2"], {
    REPPIT_CAMPAIGN_STATE_PATH: statePath,
    REPPIT_CAMPAIGN_QUEUE_PATH: queuePath,
    REPPIT_CAMPAIGN_REVIEW_DIR: reviewDirectory,
  });

  assert.equal(result.code, 0, result.stderr);
  const review = await readFile(path.join(reviewDirectory, "day-02.html"), "utf8");
  assert.match(review, /Here is what a star actually is/);
  assert.match(review, /day-02-1\.png/);
  assert.match(review, /Copy post 1/);
  assert.doesNotMatch(review, /playwright|connectOverCDP|tweetButton/);
});

test("mark-posted rejects another account and duplicate thread URLs", async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "reppit-campaign-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "campaign-state.json");
  const queuePath = path.join(directory, "queue.json");
  await writeFile(statePath, await readFile(path.join(root, "bip/campaign-state.json")));
  await writeFile(queuePath, await readFile(path.join(root, "bip/queue.json")));
  const environment = {
    REPPIT_CAMPAIGN_STATE_PATH: statePath,
    REPPIT_CAMPAIGN_QUEUE_PATH: queuePath,
    REPPIT_CAMPAIGN_REVIEW_DIR: path.join(directory, "review"),
  };

  const wrongAccount = await runCampaign(
    [
      "mark-posted",
      "2",
      "https://x.com/someone_else/status/100",
      "https://x.com/someone_else/status/101",
    ],
    environment,
  );
  assert.equal(wrongAccount.code, 1);
  assert.match(wrongAccount.stderr, /@prakass_ds/);

  const duplicate = await runCampaign(
    [
      "mark-posted",
      "2",
      "https://x.com/prakass_ds/status/100",
      "https://x.com/prakass_ds/status/100?ref=home",
    ],
    environment,
  );
  assert.equal(duplicate.code, 1);
  assert.match(duplicate.stderr, /unique/);
});

function runCampaign(arguments_, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["bip/campaign.mjs", ...arguments_], {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}
