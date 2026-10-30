import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface PatchConfig {
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface TweakcursorConfig {
  version: 1;
  installationPath?: string;
  changesApplied: boolean;
  patches: Record<string, PatchConfig>;
}

export const DEFAULT_CONFIG: TweakcursorConfig = {
  version: 1,
  changesApplied: false,
  patches: {},
};

export function getConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  const fromEnv = env.TWEAKCURSOR_CONFIG_DIR?.trim();
  if (fromEnv) return fromEnv;
  const dotDir = path.join(home, ".tweakcursor");
  if (existsSync(dotDir)) return dotDir;
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) {
    const xdgDir = path.join(xdg, "tweakcursor");
    if (existsSync(xdgDir)) return xdgDir;
  }
  return dotDir;
}

export function getConfigPath(env?: NodeJS.ProcessEnv, home?: string): string {
  return path.join(getConfigDir(env, home), "config.json");
}

export async function readConfig(
  env?: NodeJS.ProcessEnv,
  home?: string,
): Promise<TweakcursorConfig | null> {
  const p = getConfigPath(env, home);
  if (!existsSync(p)) return null;
  const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<TweakcursorConfig>;
  return { ...DEFAULT_CONFIG, ...parsed, version: 1, patches: parsed.patches ?? {} };
}

export async function writeConfig(
  cfg: TweakcursorConfig,
  env?: NodeJS.ProcessEnv,
  home?: string,
): Promise<void> {
  const dir = getConfigDir(env, home);
  mkdirSync(dir, { recursive: true });
  const p = getConfigPath(env, home);
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}
