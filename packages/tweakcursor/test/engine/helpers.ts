import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Installation } from "../../src/engine/discovery.js";

export const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const fixtureInstall: Installation = {
  path: path.join(pkgRoot, "test", "fixtures", "2099.01.01-test"),
  version: "2099.01.01-test",
  active: false,
};

export function tmpDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Mutable copy of the fixture install for patcher/backup tests. */
export function copyFixtureInstall(dest: string): Installation {
  const target = path.join(dest, "2099.01.01-test");
  cpSync(fixtureInstall.path, target, { recursive: true });
  return { path: target, version: "2099.01.01-test", active: false };
}
