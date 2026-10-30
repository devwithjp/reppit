import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("the published reppit command", () => {
  test("forwards every argument to the native CLI and preserves its exit code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "reppit-launcher-"));
    temporaryDirectories.push(directory);

    const binary = join(directory, "reppit-native");
    const argumentLog = join(directory, "arguments.json");
    const fixture = `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
writeFileSync(process.env.REPPIT_ARGUMENT_LOG, JSON.stringify(process.argv.slice(2)));
process.exit(23);
`;
    await writeFile(binary, fixture);
    await chmod(binary, 0o755);

    const result = await runLauncher(["find", "cinematic video", "--kind", "skill"], {
      REPPIT_BINARY_PATH: binary,
      REPPIT_BINARY_SHA256: sha256(fixture),
      REPPIT_ARGUMENT_LOG: argumentLog,
    });

    expect(result.code).toBe(23);
    expect(JSON.parse(await readFile(argumentLog, "utf8"))).toEqual([
      "find",
      "cinematic video",
      "--kind",
      "skill",
    ]);
  });

  test("refuses to execute a native binary whose checksum does not match", async () => {
    const directory = await mkdtemp(join(tmpdir(), "reppit-launcher-"));
    temporaryDirectories.push(directory);

    const binary = join(directory, "reppit-native");
    await writeFile(binary, "#!/bin/sh\nexit 0\n");
    await chmod(binary, 0o755);

    const result = await runLauncher([], {
      REPPIT_BINARY_PATH: binary,
      REPPIT_BINARY_SHA256: "0".repeat(64),
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("checksum verification failed");
  });

  test("explains how to recover when npm omitted the native package", async () => {
    const expectedPackage = new Map([
      ["darwin-arm64", "@reppit/cli-darwin-arm64"],
      ["darwin-x64", "@reppit/cli-darwin-x64"],
      ["linux-arm64", "@reppit/cli-linux-arm64"],
      ["linux-x64", "@reppit/cli-linux-x64"],
      ["win32-x64", "@reppit/cli-win32-x64"],
    ]).get(`${process.platform}-${process.arch}`);

    if (!expectedPackage) return;

    const result = await runLauncher([], {
      REPPIT_BINARY_PATH: "",
      REPPIT_BINARY_SHA256: "",
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(expectedPackage);
    expect(result.stderr).toContain("optional dependencies");
  });

  test("runs the native executable selected from the installed npm package", async () => {
    if (process.platform !== "linux" || process.arch !== "x64") return;

    const directory = await mkdtemp(join(tmpdir(), "reppit-packed-launcher-"));
    temporaryDirectories.push(directory);
    const sourceDirectory = new URL("../src/", import.meta.url);
    const launcherDirectory = join(directory, "src");
    const nativeDirectory = join(
      directory,
      "node_modules",
      "@reppit",
      "cli-linux-x64",
      "bin",
    );
    await mkdir(launcherDirectory, { recursive: true });
    await mkdir(nativeDirectory, { recursive: true });

    const fixture = "#!/bin/sh\nprintf 'native %s\\n' \"$*\"\n";
    const binary = join(nativeDirectory, "reppit");
    await writeFile(binary, fixture);
    await chmod(binary, 0o755);
    await writeFile(
      join(launcherDirectory, "index.ts"),
      await readFile(new URL("index.ts", sourceDirectory)),
    );
    await writeFile(
      join(directory, "platforms.json"),
      await readFile(new URL("../platforms.json", sourceDirectory)),
    );
    await writeFile(
      join(directory, "checksums.json"),
      JSON.stringify({ "@reppit/cli-linux-x64": sha256(fixture) }),
    );

    const result = await runFile(
      join(launcherDirectory, "index.ts"),
      ["get", "skills", "video editing"],
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("native get skills video editing\n");
  });

  test("reports unreadable release metadata without a Node stack trace", async () => {
    if (process.platform !== "linux" || process.arch !== "x64") return;

    const directory = await mkdtemp(join(tmpdir(), "reppit-broken-release-"));
    temporaryDirectories.push(directory);
    const launcherDirectory = join(directory, "src");
    const nativeDirectory = join(
      directory,
      "node_modules",
      "@reppit",
      "cli-linux-x64",
      "bin",
    );
    await mkdir(launcherDirectory, { recursive: true });
    await mkdir(nativeDirectory, { recursive: true });
    await writeFile(join(nativeDirectory, "reppit"), "broken");
    await writeFile(
      join(launcherDirectory, "index.ts"),
      await readFile(new URL("../src/index.ts", import.meta.url)),
    );
    await writeFile(
      join(directory, "platforms.json"),
      await readFile(new URL("../platforms.json", import.meta.url)),
    );
    await writeFile(join(directory, "checksums.json"), "{");

    const result = await runFile(join(launcherDirectory, "index.ts"), []);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("release metadata is unreadable");
    expect(result.stderr).not.toContain("SyntaxError");
  });
});

function runLauncher(
  arguments_: string[],
  environment: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/index.ts", ...arguments_],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, ...environment },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function runFile(
  file: string,
  arguments_: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", file, ...arguments_], {
      env: process.env,
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
