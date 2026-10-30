#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { apply } from "./commands/apply.js";
import { doctor } from "./commands/doctor.js";
import { listPatches } from "./commands/listPatches.js";
import { restore } from "./commands/restore.js";
import { log, setDebug } from "./ui/log.js";

// Version is read from the installed package.json (dist/cli.js -> ../package.json),
// never hardcoded: a stale constant shipped in the 0.1.1 tarball reporting 0.1.0.
const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

interface GlobalOpts {
  apply?: boolean;
  restore?: boolean;
  revert?: boolean;
  listPatches?: boolean;
  patches?: string;
  yes?: boolean;
  installPath?: string;
  configUrl?: string;
  debug?: boolean;
  verbose?: boolean;
}

function guardTestEnv(opts: GlobalOpts): void {
  // tests must never touch the real install: require an explicit path under VITEST
  if (process.env.VITEST && !opts.installPath && !process.env.TWEAKCURSOR_INSTALL_PATH) {
    log.error("VITEST detected but no --install-path/TWEAKCURSOR_INSTALL_PATH set; refusing real install");
    process.exit(1);
  }
}

function splitIds(csv: string | undefined): string[] | undefined {
  if (!csv) return undefined;
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const program = new Command();

program
  .name("tweakcursor")
  .version(VERSION, "--version")
  .description(
    "Customize and patch the shipped cursor-agent CLI.\n" +
      "Unofficial — not affiliated with or endorsed by the Cursor team. Patches may break on update.",
  )
  .option("-a, --apply", "apply enabled patches (restore-first, non-additive)")
  .option("--patches <ids>", "comma-separated patch ids to apply (one-shot, non-additive)")
  .option("--restore", "restore pristine files from backup")
  .option("--revert", "alias for --restore")
  .option("--list-patches", "list built-in patches")
  .option("-y, --yes", "skip confirmation prompts")
  .option("--install-path <path>", "cursor-agent version dir (or TWEAKCURSOR_INSTALL_PATH)")
  .option("--config-url <url>", "remote config DEFAULTS (local config wins; only with --apply)")
  .option("-d, --debug", "debug output")
  .option("-v, --verbose", "print per-edit diffs")
  .action(async () => {
    const opts = program.opts<GlobalOpts>();
    setDebug(Boolean(opts.debug));
    guardTestEnv(opts);

    if (opts.configUrl && !opts.apply) {
      log.error("--config-url is only valid with --apply");
      process.exit(1);
    }

    if (opts.listPatches) process.exit(listPatches());

    if (opts.restore || opts.revert) {
      process.exit(await restore({ installPath: opts.installPath }));
    }

    if (opts.apply) {
      process.exit(
        await apply({
          installPath: opts.installPath,
          patches: splitIds(opts.patches),
          yes: Boolean(opts.yes),
          verbose: Boolean(opts.verbose),
          configUrl: opts.configUrl,
        }),
      );
    }

    // no flags: TUI wizard (ink degrades gracefully when stdin/stdout are piped)
    const { renderApp } = await import("./tui/render.js");
    await renderApp({ installPath: opts.installPath });
    process.exit(0);
  });

program
  .command("doctor")
  .description("report installs, backup, running pids, cli-config, verification matrix")
  .action(async () => {
    const opts = program.opts<GlobalOpts>();
    setDebug(Boolean(opts.debug));
    guardTestEnv(opts);
    process.exit(doctor({ installPath: opts.installPath }));
  });

program
  .command("adhoc-patch")
  .description("apply an ad-hoc string/regex/script patch (no backup)")
  .option("--string <find>", "literal string to find")
  .option("--regex <pattern>", "regex to find")
  .option("--script <path>", "JS transform script (sandboxed)")
  .option("--replace <text>", "replacement text ($1 groups supported for --regex)")
  .option("--index <n>", "1-based occurrence to patch")
  .option("--file <relpath>", "limit to one file in the install")
  .action(async (cmdOpts: Record<string, unknown>) => {
    const opts = program.opts<GlobalOpts>();
    setDebug(Boolean(opts.debug));
    guardTestEnv(opts);
    const { adhocPatch } = await import("./adhoc.js");
    const index = cmdOpts.index !== undefined ? Number(cmdOpts.index) : undefined;
    if (index !== undefined && (!Number.isInteger(index) || index < 1)) {
      log.error("--index must be a positive integer");
      process.exit(1);
    }
    process.exit(
      await adhocPatch({
        string: cmdOpts.string as string | undefined,
        regex: cmdOpts.regex as string | undefined,
        script: cmdOpts.script as string | undefined,
        replace: cmdOpts.replace as string | undefined,
        index,
        file: cmdOpts.file as string | undefined,
        yes: Boolean(opts.yes),
        installPath: opts.installPath,
      }),
    );
  });

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
