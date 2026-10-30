#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const values = parseArguments(process.argv.slice(2));
const platformId = values.get("--platform");
const binary = values.get("--binary");
const target = values.get("--target");
const outputRoot = resolve(values.get("--out") ?? join(root, "dist", "cli-native"));

if (!platformId || !binary || !target) {
  fail("Usage: package-cli-native --platform <id> --target <triple> --binary <path> [--out <directory>]");
}

const platforms = JSON.parse(
  await readFile(join(root, "packages", "cli", "platforms.json"), "utf8"),
);
const platform = platforms.find((entry) => entry.id === platformId);
if (!platform) fail(`Unknown CLI platform: ${platformId}`);
if (platform.target !== target) {
  fail(`Target mismatch for ${platformId}: expected ${platform.target}, received ${target}`);
}

const wrapper = JSON.parse(
  await readFile(join(root, "packages", "cli", "package.json"), "utf8"),
);
const cargo = await readFile(join(root, "packages", "cli-rs", "Cargo.toml"), "utf8");
const rustVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!rustVersion || rustVersion !== wrapper.version) {
  fail(`CLI version mismatch: npm=${wrapper.version}, rust=${rustVersion ?? "missing"}`);
}
if (wrapper.optionalDependencies?.[platform.package] !== wrapper.version) {
  fail(`${platform.package} must be pinned to ${wrapper.version}`);
}

const packageDirectory = join(outputRoot, platform.id, "package");
const executable = join(packageDirectory, "bin", platform.executable);
await rm(join(outputRoot, platform.id), { recursive: true, force: true });
await mkdir(dirname(executable), { recursive: true });
await copyFile(resolve(binary), executable);
if (platform.os !== "win32") await chmod(executable, 0o755);

const checksum = createHash("sha256")
  .update(await readFile(executable))
  .digest("hex");
const manifest = {
  name: platform.package,
  version: wrapper.version,
  description: `Native Reppit CLI for ${platform.id}`,
  license: wrapper.license,
  os: [platform.os],
  cpu: [platform.cpu],
  ...(platform.libc ? { libc: [platform.libc] } : {}),
  files: ["bin"],
  publishConfig: { access: "public", provenance: true },
};

await writeFile(
  join(packageDirectory, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  join(outputRoot, platform.id, "checksum.json"),
  `${JSON.stringify({ package: platform.package, sha256: checksum })}\n`,
);
await writeFile(
  join(outputRoot, platform.id, `${basename(platform.executable)}.sha256`),
  `${checksum}  ${platform.executable}\n`,
);

console.log(packageDirectory);

function parseArguments(arguments_) {
  const result = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || !value) fail(`Invalid argument: ${flag ?? ""}`);
    result.set(flag, value);
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
