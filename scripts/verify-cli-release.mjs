#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliDirectory = join(root, "packages", "cli");
const wrapper = JSON.parse(await readFile(join(cliDirectory, "package.json"), "utf8"));
const platforms = JSON.parse(await readFile(join(cliDirectory, "platforms.json"), "utf8"));
const checksums = JSON.parse(await readFile(join(cliDirectory, "checksums.json"), "utf8"));
const cargo = await readFile(join(root, "packages", "cli-rs", "Cargo.toml"), "utf8");
const rustVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const errors = [];
if (rustVersion !== wrapper.version) {
  errors.push(`Rust version ${rustVersion ?? "missing"} does not match npm ${wrapper.version}`);
}

const packageNames = platforms.map((platform) => platform.package);
if (new Set(packageNames).size !== packageNames.length) {
  errors.push("Platform package names must be unique");
}
for (const platform of platforms) {
  if (wrapper.optionalDependencies?.[platform.package] !== wrapper.version) {
    errors.push(`${platform.package} must be pinned to ${wrapper.version}`);
  }
  if (!/^[a-f0-9]{64}$/.test(checksums[platform.package] ?? "")) {
    errors.push(`${platform.package} is missing a valid SHA-256 checksum`);
  }
}
for (const packageName of Object.keys(wrapper.optionalDependencies ?? {})) {
  if (!packageNames.includes(packageName)) {
    errors.push(`Unexpected native optional dependency: ${packageName}`);
  }
}
for (const packageName of Object.keys(checksums)) {
  if (!packageNames.includes(packageName)) {
    errors.push(`Unexpected native checksum: ${packageName}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`CLI release ${wrapper.version} is internally consistent.`);
