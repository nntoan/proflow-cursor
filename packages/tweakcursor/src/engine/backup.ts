import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Installation } from "./discovery.js";

export const BACKUP_DIR_NAME = ".tweakcursor-backup";

export interface BackupManifest {
  createdAt: string;
  version: string;
  /** relPath -> sha256 of the pristine content */
  files: Record<string, string>;
}

export function backupDir(install: Installation): string {
  return path.join(install.path, BACKUP_DIR_NAME);
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function hasBackup(install: Installation): boolean {
  return existsSync(path.join(backupDir(install), "manifest.json"));
}

export function readManifest(install: Installation): BackupManifest | null {
  const p = path.join(backupDir(install), "manifest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as BackupManifest;
}

/**
 * Snapshots relFiles into <install>/.tweakcursor-backup/. Keeps the existing
 * pristine backup unless opts.force. Returns the files backed up ([] when kept).
 */
export function createBackup(
  install: Installation,
  relFiles: string[],
  opts: { force?: boolean } = {},
): string[] {
  if (hasBackup(install) && !opts.force) return [];
  const dir = backupDir(install);
  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    version: install.version,
    files: {},
  };
  const backed: string[] = [];
  for (const rel of relFiles) {
    const src = path.join(install.path, rel);
    const content = readFileSync(src);
    const dest = path.join(dir, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    manifest.files[rel] = sha256(content);
    backed.push(rel);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return backed;
}

/** Restores every file in the manifest. Returns restored relPaths. */
export function restoreBackup(install: Installation): string[] {
  const manifest = readManifest(install);
  if (!manifest) throw new Error(`No backup found at ${backupDir(install)}`);
  const restored: string[] = [];
  for (const rel of Object.keys(manifest.files)) {
    copyFileSync(path.join(backupDir(install), rel), path.join(install.path, rel));
    restored.push(rel);
  }
  return restored;
}
