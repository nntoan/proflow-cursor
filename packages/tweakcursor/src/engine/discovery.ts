import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Installation {
  /** Absolute path of the version directory. */
  path: string;
  /** Version string (directory basename). */
  version: string;
  /** True when pointed at by ~/.local/bin/cursor-agent. */
  active: boolean;
}

export interface DiscoveryOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
}

export function defaultInstallRoot(home: string = os.homedir()): string {
  return path.join(home, ".local", "share", "cursor-agent", "versions");
}

export function defaultBinPath(home: string = os.homedir()): string {
  return path.join(home, ".local", "bin", "cursor-agent");
}

export function isInstallDir(dir: string): boolean {
  try {
    return statSync(path.join(dir, "index.js")).isFile();
  } catch {
    return false;
  }
}

function resolveActiveVersionDir(home: string): string | null {
  const bin = defaultBinPath(home);
  try {
    if (!lstatSync(bin).isSymbolicLink()) return null;
    const target = realpathSync(bin);
    // launcher lives inside the version dir
    return path.dirname(target);
  } catch {
    return null;
  }
}

export function findInstallations(opts: DiscoveryOptions = {}): Installation[] {
  const home = opts.home ?? os.homedir();
  const root = defaultInstallRoot(home);
  const activeDir = resolveActiveVersionDir(home);
  const out: Installation[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    const dir = path.join(root, entry);
    if (!isInstallDir(dir)) continue;
    // realpath both sides: macOS tmpdirs and the bin symlink resolve /var -> /private/var
    let active = activeDir === dir;
    if (!active && activeDir !== null) {
      try {
        active = realpathSync(dir) === activeDir;
      } catch {
        active = false;
      }
    }
    out.push({ path: dir, version: entry, active });
  }
  out.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return out;
}

export function detectInstallation(
  opts: DiscoveryOptions & { path?: string } = {},
): Installation {
  const env = opts.env ?? process.env;
  const explicit = opts.path ?? env.TWEAKCURSOR_INSTALL_PATH?.trim();
  if (explicit) {
    const dir = path.resolve(explicit);
    if (!isInstallDir(dir)) {
      throw new Error(`Not a cursor-agent install dir (index.js missing): ${dir}`);
    }
    return { path: dir, version: path.basename(dir), active: false };
  }
  const all = findInstallations(opts);
  const active = all.find((i) => i.active);
  if (active) return active;
  if (all.length === 1) {
    const only = all[0];
    if (only) return only;
  }
  if (all.length === 0) {
    throw new Error(
      "No cursor-agent installation found (expected ~/.local/share/cursor-agent/versions/<version>/)",
    );
  }
  const list = all.map((i) => `  ${i.path}`).join("\n");
  throw new Error(
    `Multiple cursor-agent installations found; set TWEAKCURSOR_INSTALL_PATH:\n${list}`,
  );
}
