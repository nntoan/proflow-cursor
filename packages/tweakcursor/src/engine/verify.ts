import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Installation } from "./discovery.js";

export interface SmokeResult {
  ok: boolean;
  output: string;
}

/**
 * Runs `node <install>/index.js --version` (bundled node when present) — NOT
 * the bash launcher — to prove the patched bundle still boots far enough to
 * answer.
 */
export function smokeTest(
  install: Installation,
  opts: { timeoutMs?: number } = {},
): Promise<SmokeResult> {
  const bundled = path.join(install.path, "node");
  const nodeBin = existsSync(bundled) ? bundled : process.execPath;
  return new Promise((resolve) => {
    execFile(
      nodeBin,
      [path.join(install.path, "index.js"), "--version"],
      { timeout: opts.timeoutMs ?? 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, output: `${String(err)}\n${stderr}`.slice(0, 500) });
        } else {
          resolve({ ok: true, output: stdout.trim() });
        }
      },
    );
  });
}

export interface RunningState {
  running: number[];
  stale: number[];
}

/** Reads .running/<pid> markers; kill(pid, 0) separates live from stale. */
export function checkRunning(install: Installation): RunningState {
  const dir = path.join(install.path, ".running");
  const running: number[] = [];
  const stale: number[] = [];
  if (!existsSync(dir)) return { running, stale };
  for (const entry of readdirSync(dir)) {
    const pid = Number(entry);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try {
      process.kill(pid, 0);
      running.push(pid);
    } catch {
      stale.push(pid);
    }
  }
  return { running, stale };
}
