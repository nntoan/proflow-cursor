import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  detectInstallation,
  findInstallations,
  defaultInstallRoot,
  defaultBinPath,
} from "../../src/engine/discovery.js";
import { cleanup, fixtureInstall, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mk(): string {
  const d = tmpDir("tweakcursor-disc-");
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

function fakeHome(withVersions: string[], activeVersion?: string): string {
  const home = mk();
  for (const v of withVersions) {
    const dir = path.join(defaultInstallRoot(home), v);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "index.js"), "module.exports={};\n");
    writeFileSync(path.join(dir, "cursor-agent"), "#!/bin/sh\n");
  }
  if (activeVersion) {
    mkdirSync(path.dirname(defaultBinPath(home)), { recursive: true });
    symlinkSync(
      path.join(defaultInstallRoot(home), activeVersion, "cursor-agent"),
      defaultBinPath(home),
    );
  }
  return home;
}

describe("findInstallations", () => {
  it("enumerates version dirs, newest first, flags active via symlink", () => {
    const home = fakeHome(["2026.01.01-aaa", "2026.10.22-bbb"], "2026.10.22-bbb");
    const all = findInstallations({ home });
    expect(all.map((i) => i.version)).toEqual(["2026.10.22-bbb", "2026.01.01-aaa"]);
    expect(all[0]?.active).toBe(true);
    expect(all[1]?.active).toBe(false);
  });

  it("returns empty when versions root missing", () => {
    expect(findInstallations({ home: mk() })).toEqual([]);
  });
});

describe("detectInstallation", () => {
  it("env override wins and validates index.js", () => {
    const env = { TWEAKCURSOR_INSTALL_PATH: fixtureInstall.path } as NodeJS.ProcessEnv;
    const inst = detectInstallation({ env, home: mk() });
    expect(inst.version).toBe("2099.01.01-test");
  });

  it("env override rejects non-install dir", () => {
    const env = { TWEAKCURSOR_INSTALL_PATH: mk() } as NodeJS.ProcessEnv;
    expect(() => detectInstallation({ env, home: mk() })).toThrow(/index\.js missing/);
  });

  it("prefers active install", () => {
    const home = fakeHome(["2026.01.01-aaa", "2026.10.22-bbb"], "2026.01.01-aaa");
    expect(detectInstallation({ home, env: {} as NodeJS.ProcessEnv }).version).toBe(
      "2026.01.01-aaa",
    );
  });

  it("single install without symlink is used", () => {
    const home = fakeHome(["2026.01.01-aaa"]);
    expect(detectInstallation({ home, env: {} as NodeJS.ProcessEnv }).version).toBe(
      "2026.01.01-aaa",
    );
  });

  it("no installs throws", () => {
    expect(() => detectInstallation({ home: mk(), env: {} as NodeJS.ProcessEnv })).toThrow(
      /No cursor-agent installation/,
    );
  });

  it("multiple installs without active throws with candidates", () => {
    const home = fakeHome(["2026.01.01-aaa", "2026.10.22-bbb"]);
    expect(() => detectInstallation({ home, env: {} as NodeJS.ProcessEnv })).toThrow(
      /TWEAKCURSOR_INSTALL_PATH/,
    );
  });
});
