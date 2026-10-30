#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checksumFile = process.argv[2];
if (!checksumFile) {
  console.error("Usage: prepare-cli-smoke-wrapper <checksum.json>");
  process.exit(1);
}
const current = JSON.parse(await readFile(resolve(checksumFile), "utf8"));
const platforms = JSON.parse(
  await readFile(join(root, "packages", "cli", "platforms.json"), "utf8"),
);
if (!platforms.some((platform) => platform.package === current.package)) {
  console.error(`Unknown native package in ${checksumFile}`);
  process.exit(1);
}
const checksums = Object.fromEntries(
  platforms.map((platform) => [
    platform.package,
    platform.package === current.package ? current.sha256 : "0".repeat(64),
  ]),
);
await writeFile(
  join(root, "packages", "cli", "checksums.json"),
  `${JSON.stringify(checksums, null, 2)}\n`,
);
