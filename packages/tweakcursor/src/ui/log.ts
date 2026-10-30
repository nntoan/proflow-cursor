import { diffWordsWithSpace } from "diff";
import type { FileChange } from "../types.js";

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string): string => (useColor ? `[${code}m${s}[0m` : s);

export const log = {
  info: (msg: string): void => {
    process.stderr.write(`${msg}\n`);
  },
  ok: (msg: string): void => {
    process.stderr.write(`${c("32", msg)}\n`);
  },
  warn: (msg: string): void => {
    process.stderr.write(`${c("33", `warning: ${msg}`)}\n`);
  },
  error: (msg: string): void => {
    process.stderr.write(`${c("31", `error: ${msg}`)}\n`);
  },
  debug: (msg: string): void => {
    if (DEBUG) process.stderr.write(`${c("90", `debug: ${msg}`)}\n`);
  },
};

let DEBUG = false;
export function setDebug(v: boolean): void {
  DEBUG = v;
}

/** Loud posture-B block for unverified-version attempts. */
export function loudUnverified(warnings: string[]): void {
  if (warnings.length === 0) return;
  const bar = "!".repeat(72);
  process.stderr.write(`${c("33;1", bar)}\n`);
  for (const w of warnings) process.stderr.write(`${c("33;1", `!! ${w}`)}\n`);
  process.stderr.write(`${c("33;1", "!! This version is NOT anchor-verified. Patches may miss or misapply.")}\n`);
  process.stderr.write(`${c("33;1", bar)}\n`);
}

/** Word-level before/after printer for --verbose. */
export function printChanges(changes: FileChange[]): void {
  for (const change of changes) {
    process.stderr.write(`${c("36", change.file)}\n`);
    for (const hunk of change.hunks) {
      const parts = diffWordsWithSpace(hunk.before, hunk.after);
      const line = parts
        .map((p) => {
          if (p.added) return c("32", p.value);
          if (p.removed) return c("31", p.value);
          return c("90", p.value);
        })
        .join("");
      process.stderr.write(`  @${hunk.offset} ${line}\n`);
    }
  }
}
