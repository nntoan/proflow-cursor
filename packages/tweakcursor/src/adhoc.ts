import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { detectInstallation } from "./engine/discovery.js";
import { parseGate } from "./engine/parseGate.js";
import { applySingleAnchor, type AnchorApplyResult } from "./engine/patcher.js";
import { smokeTest } from "./engine/verify.js";
import { log, printChanges } from "./ui/log.js";

export interface AdhocOptions {
  string?: string;
  regex?: string;
  script?: string;
  replace?: string;
  index?: number;
  file?: string;
  yes?: boolean;
  installPath?: string;
}

const RUNNER = `import { readFileSync } from "node:fs";
const [script, input] = process.argv.slice(2);
const js = readFileSync(input, "utf8");
globalThis.vars = {};
const mod = await import("file://" + script);
const fn = mod.default;
const out = typeof fn === "function" ? fn(js, globalThis.vars) : undefined;
if (typeof out !== "string") {
  throw new Error("adhoc script must default-export (js, vars) => newContent");
}
process.stdout.write(out);
`;

/** Node 20-22 spell the flag --experimental-permission; 23.5+ stabilized it as --permission. */
export function permissionFlag(nodeVersion: string = process.versions.node): string {
  const [majorStr, minorStr] = nodeVersion.split(".");
  const major = Number(majorStr);
  const minor = Number(minorStr ?? 0);
  return major > 23 || (major === 23 && minor >= 5) ? "--permission" : "--experimental-permission";
}

/**
 * Runs a user transform script under Node's permission model: no fs write,
 * no network, no child processes; read limited to script + input + runner.
 */
export function runSandboxedScript(scriptPath: string, content: string): string {
  // realpath everything: the module loader resolves symlinks (macOS /var ->
  // /private/var) and the permission model checks the RESOLVED path.
  const base = realpathSync(os.tmpdir());
  const scriptReal = realpathSync(scriptPath);
  const dir = mkdtempSync(path.join(base, "tweakcursor-adhoc-"));
  try {
    const runner = path.join(dir, "runner.mjs");
    const input = path.join(dir, "input.js");
    writeFileSync(runner, RUNNER, "utf8");
    writeFileSync(input, content, "utf8");
    return execFileSync(
      process.execPath,
      [
        permissionFlag(),
        `--allow-fs-read=${runner}`,
        `--allow-fs-read=${input}`,
        `--allow-fs-read=${scriptReal}`,
        runner,
        scriptReal,
        input,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

/** adhoc-patch: one-shot edit with diff preview. NO backup (tweakcc parity). */
export async function adhocPatch(opts: AdhocOptions): Promise<number> {
  const modes = [opts.string, opts.regex, opts.script].filter((m) => m !== undefined).length;
  if (modes !== 1) {
    log.error("exactly one of --string, --regex, or --script is required");
    return 1;
  }

  let install;
  try {
    install = detectInstallation({ path: opts.installPath });
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const relFile = opts.file ?? "index.js";
  const abs = path.resolve(install.path, relFile);
  if (!abs.startsWith(path.resolve(install.path) + path.sep)) {
    log.error("--file escapes the install dir");
    return 1;
  }
  let content: string;
  try {
    content = readFileSync(abs, "utf8");
  } catch {
    log.error(`file not found in install: ${relFile}`);
    return 1;
  }

  let result: AnchorApplyResult;
  if (opts.script) {
    const scriptPath = path.resolve(opts.script);
    let patched: string;
    try {
      patched = runSandboxedScript(scriptPath, content);
    } catch (err) {
      log.error(`sandbox failed (needs Node >=20 permission model): ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    result = { content: patched, hunks: [{ offset: 0, before: content.slice(0, 80), after: patched.slice(0, 80) }] };
  } else {
    const anchor =
      opts.string !== undefined
        ? ({ kind: "string", find: opts.string, replace: opts.replace ?? "", index: opts.index } as const)
        : ({
            kind: "regex",
            find: new RegExp(opts.regex ?? "", "g"),
            replace: opts.replace ?? "",
            index: opts.index,
          } as const);
    result = applySingleAnchor(content, anchor);
  }

  if ("error" in result) {
    log.error(result.error);
    return 2;
  }
  if (result.content === content) {
    log.info("no change produced; nothing written");
    return 0;
  }

  const gate = parseGate(result.content);
  if (!gate.ok) {
    log.error(`parse gate rejected the result: ${gate.error ?? "invalid JS"} — nothing written`);
    return 2;
  }

  log.warn("adhoc-patch writes WITHOUT a backup (parity with tweakcc adhoc-patch)");
  printChanges([{ file: relFile, hunks: result.hunks }]);
  if (!opts.yes) {
    const ok = await confirm(`Write ${relFile} in ${install.version}?`);
    if (!ok) {
      log.info("Aborted.");
      return 1;
    }
  }

  copyFileSync(abs, `${abs}.adhoc-tmp`);
  writeFileSync(abs, result.content, "utf8");
  const smoke = await smokeTest(install);
  if (!smoke.ok) {
    copyFileSync(`${abs}.adhoc-tmp`, abs);
    rmSync(`${abs}.adhoc-tmp`, { force: true });
    log.error(`smoke test failed after write; file rolled back. ${smoke.output.slice(0, 200)}`);
    return 3;
  }
  rmSync(`${abs}.adhoc-tmp`, { force: true });
  log.ok(`patched ${relFile} (${install.version})`);
  return 0;
}
