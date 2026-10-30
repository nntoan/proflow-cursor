import React from "react";
import { Box, Text } from "ink";
import { createBackup, hasBackup, restoreBackup } from "../engine/backup.js";
import { writeCliConfig, defaultCliConfigPath } from "../engine/cliConfig.js";
import type { Installation } from "../engine/discovery.js";
import { applyPatches } from "../engine/patcher.js";
import { smokeTest } from "../engine/verify.js";
import { isVerified } from "../engine/versionGate.js";
import { enabledPatches } from "../patches/registry.js";
import { writeConfig, type TweakcursorConfig } from "../config.js";
import { Header } from "./ui.js";

export interface ApplyRunResult {
  lines: string[];
  code: 0 | 2 | 3;
}

/** Shared apply pipeline for the TUI; mirrors commands/apply.ts without prompts. */
export async function runApply(
  install: Installation,
  config: TweakcursorConfig,
  deps: { env: NodeJS.ProcessEnv; home: string; cliConfigPath: string },
  onLine: (line: string) => void,
): Promise<ApplyRunResult> {
  const lines: string[] = [];
  const say = (line: string): void => {
    lines.push(line);
    onLine(line);
  };

  const patches = enabledPatches(config).map((e) =>
    e.build({ version: install.version, options: config.patches[e.id]?.options ?? {} }),
  );
  if (patches.length === 0) {
    say("no patches enabled; nothing to do");
    return { lines, code: 0 };
  }

  for (const p of patches.filter((p) => !isVerified(p, install.version))) {
    say(`!! ${p.id}: UNVERIFIED on ${install.version} — attempting anyway (posture B)`);
  }

  if (hasBackup(install)) {
    restoreBackup(install);
    say("restored pristine files from backup");
  }
  const relFiles = [...new Set(patches.flatMap((p) => p.files.map((f) => f.file)))];
  createBackup(install, relFiles);

  const reports = applyPatches(install, patches);
  let failed = 0;
  for (const r of reports) {
    if (r.status === "applied") {
      const hunks = r.changes.reduce((n, ch) => n + ch.hunks.length, 0);
      say(`applied  ${r.id} (${hunks} edits${r.verified ? "" : ", UNVERIFIED"})`);
    } else {
      failed++;
      say(`FAILED   ${r.id}: ${r.failures.map((f) => `${f.file}: ${f.reason}`).join("; ")}`);
    }
  }

  const guard = reports.find((r) => r.id === "update-guard");
  if (guard?.status === "applied") {
    writeCliConfig({ disableAutoUpdate: true }, deps.cliConfigPath);
    say("auto-update disabled (disableAutoUpdate: true)");
  }

  const anyApplied = reports.some((r) => r.status === "applied");
  if (anyApplied) {
    const smoke = await smokeTest(install);
    if (!smoke.ok) {
      say(`smoke test FAILED: ${smoke.output.slice(0, 200)}`);
      try {
        restoreBackup(install);
        say("install restored from backup");
      } catch (err) {
        say(`RESTORE FAILED — reinstall cursor-agent (${err instanceof Error ? err.message : String(err)})`);
      }
      await writeConfig({ ...config, changesApplied: false }, deps.env, deps.home);
      return { lines, code: 3 };
    }
  }

  await writeConfig(
    { ...config, installationPath: install.path, changesApplied: anyApplied },
    deps.env,
    deps.home,
  );
  say(failed > 0 ? `done with ${failed} failure(s) (posture B)` : "done");
  return { lines, code: failed > 0 ? 2 : 0 };
}

export function ApplyView({
  install,
  config,
  deps,
  onDone,
}: {
  install: Installation;
  config: TweakcursorConfig;
  deps: { env: NodeJS.ProcessEnv; home: string; cliConfigPath: string };
  onDone: (result: ApplyRunResult) => void;
}) {
  const [lines, setLines] = React.useState<string[]>([]);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runApply(install, config, deps, (line) => setLines((ls) => [...ls, line])).then(onDone);
  }, [install, config, deps, onDone]);

  return (
    <Box flexDirection="column">
      <Header title={`Applying to ${install.version}`} />
      {lines.map((line, i) => (
        <Text key={i} color={line.startsWith("FAILED") || line.startsWith("!!") ? "red" : undefined}>
          {line}
        </Text>
      ))}
    </Box>
  );
}
