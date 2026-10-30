import { backupDir, hasBackup, readManifest } from "../engine/backup.js";
import { isAutoUpdateDisabled, readCliConfig, type CliConfig } from "../engine/cliConfig.js";
import { detectInstallation, findInstallations } from "../engine/discovery.js";
import { checkRunning } from "../engine/verify.js";
import { REGISTRY, VERIFIED_VERSION } from "../patches/registry.js";
import { log } from "../ui/log.js";

export interface DoctorOptions {
  installPath?: string;
}

/** Read-only environment report. Never mutates anything. */
export function doctor(opts: DoctorOptions): number {
  const home = process.env.HOME;
  const installs = findInstallations(home ? { home } : {});

  log.info("== installations ==");
  if (installs.length === 0) {
    log.info("  (none found under ~/.local/share/cursor-agent/versions)");
  }
  for (const i of installs) {
    log.info(`  ${i.version}${i.active ? " (active)" : ""}  ${i.path}`);
  }

  let selected;
  try {
    selected = detectInstallation({
      path: opts.installPath,
      ...(home ? { home } : {}),
    });
  } catch (err) {
    log.error(`installation selection: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  log.info(`\nselected: ${selected.version}  ${selected.path}`);

  log.info("\n== backup ==");
  if (hasBackup(selected)) {
    const manifest = readManifest(selected);
    const files = manifest ? Object.keys(manifest.files).length : 0;
    log.info(`  present at ${backupDir(selected)} (${files} files, created ${manifest?.createdAt ?? "?"})`);
  } else {
    log.info("  none (install is pristine or never patched)");
  }

  const running = checkRunning(selected);
  log.info("\n== running processes ==");
  if (running.running.length === 0 && running.stale.length === 0) {
    log.info("  none");
  }
  for (const pid of running.running) log.info(`  pid ${pid} (live)`);
  for (const pid of running.stale) log.info(`  pid ${pid} (stale marker)`);

  log.info("\n== cli-config (~/.cursor/cli-config.json) ==");
  let cfg: CliConfig = {};
  try {
    cfg = readCliConfig();
  } catch (err) {
    log.warn(`unreadable: ${err instanceof Error ? err.message : String(err)}`);
  }
  log.info(`  disableAutoUpdate: ${String(cfg.disableAutoUpdate ?? "(unset)")}`);
  log.info(`  channel:           ${String(cfg.channel ?? "(unset)")}`);
  log.info(`  auto-update guard: ${isAutoUpdateDisabled(cfg) ? "OFF (patches safe)" : "ACTIVE (patches at risk)"}`);

  log.info("\n== NODE_COMPILE_CACHE ==");
  log.info(
    process.env.NODE_COMPILE_CACHE
      ? `  ${process.env.NODE_COMPILE_CACHE} (source-validated; stale cache not an issue)`
      : "  (unset)",
  );

  log.info("\n== patch verification matrix ==");
  const verified = selected.version === VERIFIED_VERSION;
  for (const entry of REGISTRY) {
    log.info(
      `  ${entry.id}: ${verified ? "verified" : `UNVERIFIED (anchors checked against ${VERIFIED_VERSION})`}`,
    );
  }
  return 0;
}
