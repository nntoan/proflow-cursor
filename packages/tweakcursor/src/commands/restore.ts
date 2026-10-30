import { hasBackup, restoreBackup } from "../engine/backup.js";
import { detectInstallation } from "../engine/discovery.js";
import { smokeTest } from "../engine/verify.js";
import { readConfig, writeConfig } from "../config.js";
import { log } from "../ui/log.js";

export interface RestoreOptions {
  installPath?: string;
}

/** Restores pristine files from backup; keeps config (tweakcc parity). */
export async function restore(opts: RestoreOptions): Promise<number> {
  let install;
  try {
    install = detectInstallation({ path: opts.installPath });
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  if (!hasBackup(install)) {
    log.info("No backup found — install is already pristine.");
    return 0;
  }

  const restored = restoreBackup(install);
  log.ok(`restored ${restored.length} file(s): ${restored.join(", ")}`);

  const smoke = await smokeTest(install);
  if (!smoke.ok) {
    log.error(`post-restore smoke test failed: ${smoke.output}`);
    return 3;
  }

  const cfg = await readConfig();
  if (cfg) await writeConfig({ ...cfg, changesApplied: false });
  log.ok("install is pristine");
  return 0;
}
