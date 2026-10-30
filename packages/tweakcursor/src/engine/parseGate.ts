import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface GateResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates JS content with the runtime parser (`node --check`) before it is
 * ever written to an install. Use module:true for ESM targets.
 */
export function parseGate(content: string, opts: { module?: boolean } = {}): GateResult {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tweakcursor-gate-"));
  try {
    const file = path.join(dir, opts.module ? "check.mjs" : "check.js");
    writeFileSync(file, content, "utf8");
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message.slice(0, 500) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
