import { createInterface } from "node:readline/promises";
import { createBackup, hasBackup, restoreBackup } from "../engine/backup.js";
import { writeCliConfig } from "../engine/cliConfig.js";
import { detectInstallation } from "../engine/discovery.js";
import { applyPatches, resolvePatchFiles } from "../engine/patcher.js";
import { smokeTest } from "../engine/verify.js";
import { isVerified, unverifiedWarning } from "../engine/versionGate.js";
import { enabledPatches, getEntry } from "../patches/registry.js";
import type { Patch } from "../types.js";
import { DEFAULT_CONFIG, readConfig, writeConfig, type TweakcursorConfig } from "../config.js";
import { log, loudUnverified, printChanges } from "../ui/log.js";

export interface ApplyOptions {
  installPath?: string;
  patches?: string[];
  yes?: boolean;
  verbose?: boolean;
  configUrl?: string;
}

export const EXIT_OK = 0;
export const EXIT_USER_ERROR = 1;
export const EXIT_SOME_FAILED = 2;
export const EXIT_VERIFY_FAILED = 3;

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

/** Remote config supplies DEFAULTS only; local config always wins (tweakcc semantics). */
async function fetchRemoteDefaults(url: string): Promise<Partial<TweakcursorConfig> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Partial<TweakcursorConfig>;
  } catch (err) {
    log.warn(`config-url fetch failed (${err instanceof Error ? err.message : String(err)}); using local config`);
    return null;
  }
}

function selectPatches(cfg: TweakcursorConfig, ids: string[] | undefined, version: string): Patch[] | string {
  const entries = ids
    ? ids.map((id) => {
        const entry = getEntry(id);
        if (!entry) return `unknown patch id: ${id}`;
        return entry;
      })
    : enabledPatches(cfg);
  const bad = entries.find((e): e is string => typeof e === "string");
  if (bad) return bad;
  return (entries as Exclude<(typeof entries)[number], string>[]).map((e) =>
    e.build({ version, options: cfg.patches[e.id]?.options ?? {} }),
  );
}

export async function apply(opts: ApplyOptions): Promise<number> {
  let install;
  try {
    install = detectInstallation({ path: opts.installPath });
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return EXIT_USER_ERROR;
  }

  let cfg = (await readConfig()) ?? { ...DEFAULT_CONFIG };
  if (opts.configUrl) {
    const remote = await fetchRemoteDefaults(opts.configUrl);
    if (remote) cfg = { ...remote, ...cfg, patches: { ...remote.patches, ...cfg.patches }, version: 1 };
  }

  const patches = selectPatches(cfg, opts.patches, install.version);
  if (typeof patches === "string") {
    log.error(patches);
    return EXIT_USER_ERROR;
  }
  if (patches.length === 0) {
    log.info("No patches enabled. Nothing to do.");
    return EXIT_OK;
  }

  // pre-apply summary
  log.info(`install:  ${install.version}  ${install.path}`);
  log.info(`patches:  ${patches.map((p) => p.id).join(", ")}`);
  loudUnverified(
    patches.filter((p) => !isVerified(p, install.version)).map((p) => unverifiedWarning(p, install.version)),
  );
  if (!opts.yes) {
    const ok = await confirm(`Apply ${patches.length} patch(es) to ${install.version}?`);
    if (!ok) {
      log.info("Aborted.");
      return EXIT_USER_ERROR;
    }
  }

  // restore-first: always start from pristine files so applies are non-additive
  if (hasBackup(install)) {
    const restored = restoreBackup(install);
    log.debug(`restored pristine files: ${restored.join(", ")}`);
  }
  const relFiles = resolvePatchFiles(install, patches);
  const backed = createBackup(install, relFiles);
  if (backed.length > 0) log.debug(`backup created: ${backed.join(", ")}`);

  const reports = applyPatches(install, patches);
  let failed = 0;
  for (const report of reports) {
    if (report.status === "applied") {
      const hunks = report.changes.reduce((n, ch) => n + ch.hunks.length, 0);
      log.ok(`applied  ${report.id} (${hunks} edit${hunks === 1 ? "" : "s"}${report.verified ? "" : ", UNVERIFIED version"})`);
      if (opts.verbose) printChanges(report.changes);
    } else {
      failed++;
      log.error(`failed   ${report.id}`);
      for (const f of report.failures) log.error(`         ${f.file}: ${f.reason}`);
    }
  }

  // update-guard: the real guard is the official cli-config keys
  const guardEnabled = patches.some((p) => p.id === "update-guard");
  if (guardEnabled && reports.find((r) => r.id === "update-guard")?.status === "applied") {
    writeCliConfig({ disableAutoUpdate: true });
    log.ok("auto-update disabled via ~/.cursor/cli-config.json (disableAutoUpdate: true)");
  }

  const anyApplied = reports.some((r) => r.status === "applied");
  if (anyApplied) {
    const smoke = await smokeTest(install);
    if (!smoke.ok) {
      log.error(`post-patch smoke test failed: ${smoke.output}`);
      try {
        restoreBackup(install);
        log.info("install restored from backup");
      } catch (err) {
        log.error(`RESTORE FAILED — reinstall cursor-agent. ${err instanceof Error ? err.message : String(err)}`);
      }
      await writeConfig({ ...cfg, changesApplied: false });
      return EXIT_VERIFY_FAILED;
    }
  }

  await writeConfig({
    ...cfg,
    installationPath: install.path,
    changesApplied: anyApplied,
    // --patches is a one-shot selection; only the default flow persists toggles
    patches: opts.patches
      ? cfg.patches
      : Object.fromEntries(
          patches.map((p) => [p.id, { enabled: true, options: cfg.patches[p.id]?.options }]),
        ),
  });

  if (failed > 0) {
    log.warn(`${failed} patch(es) failed; others applied (posture B)`);
    return EXIT_SOME_FAILED;
  }
  log.ok("done");
  return EXIT_OK;
}
