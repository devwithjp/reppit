import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { confirm } from "../src/confirm";

function tty(answer: string) {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  setTimeout(() => input.write(answer + "\n"), 5);
  return input;
}
const out = () => new PassThrough();

describe("confirm before install", () => {
  it("proceeds only on y/yes", async () => {
    expect(await confirm("Run?", { input: tty("y"), output: out() })).toBe(true);
    expect(await confirm("Run?", { input: tty("YES"), output: out() })).toBe(true);
    expect(await confirm("Run?", { input: tty(""), output: out() })).toBe(false);
    expect(await confirm("Run?", { input: tty("n"), output: out() })).toBe(false);
    expect(await confirm("Run?", { input: tty("sure"), output: out() })).toBe(false);
  });
  it("refuses without a terminal unless --yes", async () => {
    const pipe = Object.assign(new PassThrough(), { isTTY: false });
    expect(await confirm("Run?", { input: pipe, output: out() })).toBe(false);
    expect(await confirm("Run?", { input: pipe, output: out(), yes: true })).toBe(true);
  });
});
