import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getConfigDir,
  getConfigPath,
  readConfig,
  writeConfig,
  DEFAULT_CONFIG,
} from "../../src/config.js";
import { cleanup, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mk(): string {
  const d = tmpDir("tweakcursor-cfg-");
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

describe("config dir resolution", () => {
  it("TWEAKCURSOR_CONFIG_DIR wins", () => {
    const home = mk();
    const env = { TWEAKCURSOR_CONFIG_DIR: "/tmp/somewhere-else" } as NodeJS.ProcessEnv;
    expect(getConfigDir(env, home)).toBe("/tmp/somewhere-else");
  });

  it("~/.tweakcursor preferred when it exists", () => {
    const home = mk();
    mkdirSync(path.join(home, ".tweakcursor"));
    const env = { XDG_CONFIG_HOME: path.join(home, "xdg") } as NodeJS.ProcessEnv;
    expect(getConfigDir(env, home)).toBe(path.join(home, ".tweakcursor"));
  });

  it("XDG used when dot dir absent and xdg dir exists", () => {
    const home = mk();
    const xdg = path.join(home, "xdg");
    mkdirSync(path.join(xdg, "tweakcursor"), { recursive: true });
    const env = { XDG_CONFIG_HOME: xdg } as NodeJS.ProcessEnv;
    expect(getConfigDir(env, home)).toBe(path.join(xdg, "tweakcursor"));
  });

  it("falls back to ~/.tweakcursor", () => {
    const home = mk();
    expect(getConfigDir({} as NodeJS.ProcessEnv, home)).toBe(path.join(home, ".tweakcursor"));
  });
});

describe("read/write", () => {
  it("readConfig returns null when missing", async () => {
    const home = mk();
    expect(await readConfig({} as NodeJS.ProcessEnv, home)).toBeNull();
  });

  it("roundtrips and creates the dir", async () => {
    const home = mk();
    const env = {} as NodeJS.ProcessEnv;
    await writeConfig(
      { ...DEFAULT_CONFIG, installationPath: "/x", patches: { themes: { enabled: true } } },
      env,
      home,
    );
    const cfg = await readConfig(env, home);
    expect(cfg?.installationPath).toBe("/x");
    expect(cfg?.patches.themes?.enabled).toBe(true);
    expect(existsSync(getConfigPath(env, home))).toBe(true);
    const raw = readFileSync(getConfigPath(env, home), "utf8");
    expect(JSON.parse(raw).version).toBe(1);
  });
});
