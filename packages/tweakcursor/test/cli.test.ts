import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cleanup, copyFixtureInstall, pkgRoot, tmpDir } from "./engine/helpers.js";

const distCli = path.join(pkgRoot, "dist", "cli.js");

interface RunResult {
  code: number;
  out: string;
}

function run(args: string[], env: NodeJS.ProcessEnv, strip: string[] = []): RunResult {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const key of strip) delete merged[key];
  const res = spawnSync(process.execPath, [distCli, ...args], {
    encoding: "utf8",
    env: merged,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: res.status ?? 1, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

/** Isolated sandbox: copied fixture install + fake HOME + tmp config dirs. */
function sandbox() {
  const root = tmpDir("tweakcursor-cli-");
  const install = copyFixtureInstall(root);
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    TWEAKCURSOR_INSTALL_PATH: install.path,
    TWEAKCURSOR_CONFIG_DIR: path.join(root, "cfg"),
    TWEAKCURSOR_CLI_CONFIG_PATH: path.join(root, "cli-config.json"),
    HOME: home,
    NO_COLOR: "1",
  };
  return { root, install, env };
}

const sandboxes: string[] = [];
function mkSandbox() {
  const s = sandbox();
  sandboxes.push(s.root);
  return s;
}

beforeAll(() => {
  if (!existsSync(distCli)) {
    execFileSync("npm", ["run", "build"], { cwd: pkgRoot, stdio: "inherit" });
  }
});

afterAll(() => {
  while (sandboxes.length) cleanup(sandboxes.pop() as string);
});

describe("cli", () => {
  it("--help lists commands and flags", () => {
    const { env, root } = mkSandbox();
    void root;
    const r = run(["--help"], env);
    expect(r.code).toBe(0);
    expect(r.out).toContain("--apply");
    expect(r.out).toContain("doctor");
    expect(r.out).toContain("adhoc-patch");
  });

  it("doctor reports the selected install", () => {
    const { env, install } = mkSandbox();
    const r = run(["doctor"], env);
    expect(r.code).toBe(0);
    expect(r.out).toContain(install.version);
    expect(r.out).toContain("auto-update guard");
  });

  it("--list-patches prints the registry", () => {
    const { env } = mkSandbox();
    const r = run(["--list-patches"], env);
    expect(r.code).toBe(0);
    for (const id of [
      "disable-third-party-plugins",
      "disable-third-party-extensibility",
      "patched-indicator",
      "themes",
      "update-guard",
    ]) {
      expect(r.out).toContain(id);
    }
  });

  it("--apply patches files, writes cli-config, and is idempotent", () => {
    const { env, install } = mkSandbox();
    const r1 = run(["--apply", "--yes"], env);
    expect(r1.code).toBe(0);

    const index = readFileSync(path.join(install.path, "index.js"), "utf8");
    expect(index).toContain(".importThirdPartyPlugins&&!1||(");
    expect(index).toContain('.description("Cursor Agent [tweakcursor]")');
    const headless = readFileSync(path.join(install.path, "3863.index.js"), "utf8");
    expect(headless).toContain("he=!1");
    const kickoff = readFileSync(path.join(install.path, "8008.index.js"), "utf8");
    expect(kickoff).toContain("console.error(");

    const cliCfg = JSON.parse(readFileSync(env.TWEAKCURSOR_CLI_CONFIG_PATH as string, "utf8")) as Record<
      string,
      unknown
    >;
    expect(cliCfg.disableAutoUpdate).toBe(true);

    // smoke: patched install still boots
    const v = execFileSync(process.execPath, [path.join(install.path, "index.js"), "--version"], {
      encoding: "utf8",
    });
    expect(v.trim()).toBe(install.version);

    // second run: restore-first then re-apply => still exit 0, same content
    const r2 = run(["--apply", "--yes"], env);
    expect(r2.code).toBe(0);
    expect(readFileSync(path.join(install.path, "index.js"), "utf8")).toBe(index);
  });

  it("--apply --patches applies exactly the listed patch (non-additive)", () => {
    const { env, install } = mkSandbox();
    const r = run(["--apply", "--yes", "--patches", "disable-third-party-plugins"], env);
    expect(r.code).toBe(0);
    const index = readFileSync(path.join(install.path, "index.js"), "utf8");
    expect(index).toContain(".importThirdPartyPlugins&&!1||(");
    expect(index).not.toContain("[tweakcursor]");
  });

  it("--apply exits 1 on unknown patch id", () => {
    const { env } = mkSandbox();
    const r = run(["--apply", "--yes", "--patches", "nope"], env);
    expect(r.code).toBe(1);
    expect(r.out).toContain("unknown patch id");
  });

  it("--restore returns the install to pristine", () => {
    const { env, install } = mkSandbox();
    expect(run(["--apply", "--yes"], env).code).toBe(0);
    const r = run(["--restore", "--yes"], env);
    expect(r.code).toBe(0);
    const index = readFileSync(path.join(install.path, "index.js"), "utf8");
    expect(index).toContain('.description("Cursor Agent")');
    expect(index).not.toContain("[tweakcursor]");
  });

  it("--restore with no backup is a no-op exit 0", () => {
    const { env } = mkSandbox();
    expect(run(["--restore", "--yes"], env).code).toBe(0);
  });

  it("refuses the real install under VITEST without an explicit path", () => {
    const { env } = mkSandbox();
    delete env.TWEAKCURSOR_INSTALL_PATH;
    const r = run(["--apply", "--yes"], env, ["TWEAKCURSOR_INSTALL_PATH"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("VITEST");
  });

  it("posture B: unverified config-version still applies with a loud warning", () => {
    const { env, install, root } = mkSandbox();
    // pretend anchors were verified against some other version
    const cfgDir = env.TWEAKCURSOR_CONFIG_DIR as string;
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(
      path.join(cfgDir, "config.json"),
      JSON.stringify({ version: 1, changesApplied: false, patches: {} }),
    );
    void root;
    const r = run(["--apply", "--yes", "--patches", "patched-indicator"], env);
    expect(r.code).toBe(0);
    expect(r.out).toContain("UNVERIFIED");
    expect(readFileSync(path.join(install.path, "index.js"), "utf8")).toContain("[tweakcursor]");
  });
});
