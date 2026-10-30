#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checksumFiles = process.argv.slice(2);
if (!checksumFiles.length) {
  console.error("Usage: assemble-cli-wrapper <checksum.json>...");
  process.exit(1);
}

const checksums = {};
for (const file of checksumFiles) {
  const entry = JSON.parse(await readFile(resolve(file), "utf8"));
  if (!entry.package || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    console.error(`Invalid checksum entry: ${file}`);
    process.exit(1);
  }
  if (checksums[entry.package]) {
    console.error(`Duplicate checksum entry: ${entry.package}`);
    process.exit(1);
  }
  checksums[entry.package] = entry.sha256;
}

const platforms = JSON.parse(
  await readFile(join(root, "packages", "cli", "platforms.json"), "utf8"),
);
const expectedPackages = new Set(platforms.map((platform) => platform.package));
const unknown = Object.keys(checksums).filter(
  (packageName) => !expectedPackages.has(packageName),
);
if (unknown.length) {
  console.error(`Unknown native checksums: ${unknown.join(", ")}`);
  process.exit(1);
}
const missing = platforms
  .map((platform) => platform.package)
  .filter((packageName) => !checksums[packageName]);
if (missing.length) {
  console.error(`Missing native checksums: ${missing.join(", ")}`);
  process.exit(1);
}

const destination = join(root, "packages", "cli", "checksums.json");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(checksums, null, 2)}\n`);
console.log(destination);
