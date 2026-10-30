#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const platforms = readJson(
  new URL("../platforms.json", import.meta.url),
  "platform metadata",
) as Array<{ os: string; cpu: string; package: string; executable: string }>;

let binaryPath = process.env.REPPIT_BINARY_PATH;
let expectedChecksum = process.env.REPPIT_BINARY_SHA256;

if (!binaryPath) {
  const platform = `${process.platform}-${process.arch}`;
  const nativePlatform = platforms.find(
    (candidate) => `${candidate.os}-${candidate.cpu}` === platform,
  );
  if (!nativePlatform) {
    console.error(`reppit: unsupported platform ${platform}.`);
    process.exit(1);
  }

  try {
    binaryPath = createRequire(import.meta.url).resolve(
      `${nativePlatform.package}/bin/${nativePlatform.executable}`,
    );
  } catch {
    console.error(
      `reppit: ${nativePlatform.package} is missing. Reinstall reppit with npm optional dependencies enabled.`,
    );
    process.exit(1);
  }

  const checksums = readJson(
    new URL("../checksums.json", import.meta.url),
    "release metadata",
  ) as Record<string, string>;
  expectedChecksum = checksums[nativePlatform.package];
}

if (!binaryPath || !expectedChecksum) {
  console.error(
    "reppit: the native CLI checksum is missing; reinstall or report this release.",
  );
  process.exit(1);
}

let binary;
try {
  binary = readFileSync(binaryPath);
} catch {
  console.error("reppit: the native CLI binary is unreadable; reinstall reppit.");
  process.exit(1);
}
const actualChecksum = createHash("sha256").update(binary).digest("hex");

if (actualChecksum !== expectedChecksum.toLowerCase()) {
  console.error("reppit: native CLI checksum verification failed; refusing to run.");
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`reppit: could not start the native CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);

function readJson(url: URL, label: string): unknown {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    console.error(`reppit: ${label} is unreadable; reinstall or report this release.`);
    process.exit(1);
  }
}
