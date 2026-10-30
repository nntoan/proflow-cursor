import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type CliConfig = Record<string, unknown>;

export function defaultCliConfigPath(
  home: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.TWEAKCURSOR_CLI_CONFIG_PATH?.trim();
  if (override) return override;
  return path.join(home, ".cursor", "cli-config.json");
}

export function readCliConfig(configPath: string = defaultCliConfigPath()): CliConfig {
  if (!existsSync(configPath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`cli-config at ${configPath} is not a JSON object`);
  }
  return parsed as CliConfig;
}

/** Merges updates, preserving unknown keys. Returns the resulting config. */
export function writeCliConfig(
  updates: CliConfig,
  configPath: string = defaultCliConfigPath(),
): CliConfig {
  const current = existsSync(configPath) ? readCliConfig(configPath) : {};
  const next = { ...current, ...updates };
  mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, configPath);
  return next;
}

export function isAutoUpdateDisabled(cfg: CliConfig): boolean {
  return cfg.disableAutoUpdate === true || cfg.channel === "static";
}
