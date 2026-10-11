import { createInterface } from "node:readline/promises";

export interface ConfirmOptions {
  /** --yes: skip the prompt. */
  yes?: boolean;
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}

/**
 * Ask before doing something irreversible. Only an explicit "y"/"yes" proceeds. A non-interactive
 * stdin (pipes, CI, an agent's shell) never proceeds without --yes, so nothing installs silently.
 */
export async function confirm(question: string, o: ConfirmOptions = {}): Promise<boolean> {
  if (o.yes) return true;
  const input = o.input ?? process.stdin;
  const output = o.output ?? process.stderr;
  if (!input.isTTY) { output.write(`${question} Refusing without a terminal; pass --yes to proceed.\n`); return false; }
  const rl = createInterface({ input, output });
  try { return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()); } finally { rl.close(); }
}
