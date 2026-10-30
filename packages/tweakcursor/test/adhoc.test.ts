import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { adhocPatch, runSandboxedScript } from "../src/adhoc.js";
import { cleanup, copyFixtureInstall, tmpDir } from "./engine/helpers.js";

const dirs: string[] = [];
function mk() {
  const d = tmpDir("tweakcursor-adhoc-");
  dirs.push(d);
  return copyFixtureInstall(d);
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

describe("adhocPatch", () => {
  it("requires exactly one mode", async () => {
    const inst = mk();
    expect(await adhocPatch({ installPath: inst.path, yes: true })).toBe(1);
    expect(await adhocPatch({ installPath: inst.path, string: "a", regex: "b", yes: true })).toBe(1);
  });

  it("--string applies with diff preview, no backup dir created", async () => {
    const inst = mk();
    const code = await adhocPatch({
      installPath: inst.path,
      string: '"[32m"',
      replace: '"[92m"',
      yes: true,
    });
    expect(code).toBe(0);
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).toContain('green:"[92m"');
  });

  it("--regex supports $1 and --index", async () => {
    const inst = mk();
    const code = await adhocPatch({
      installPath: inst.path,
      regex: "(add|remove)BgHex:\"#[0-9A-Fa-f]{6}\"",
      replace: '$1BgHex:"#000000"',
      yes: true,
    });
    expect(code).toBe(0);
    const index = readFileSync(path.join(inst.path, "index.js"), "utf8");
    expect(index).toContain('addBgHex:"#000000"');
    expect(index).toContain('removeBgHex:"#000000"');
  });

  it("zero matches exits 2 and writes nothing", async () => {
    const inst = mk();
    const before = readFileSync(path.join(inst.path, "index.js"), "utf8");
    const code = await adhocPatch({ installPath: inst.path, string: "NOPE", replace: "x", yes: true });
    expect(code).toBe(2);
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).toBe(before);
  });

  it("--script runs sandboxed and rewrites content", async () => {
    const inst = mk();
    const scriptDir = mkdtempSync(path.join(os.tmpdir(), "tweakcursor-script-"));
    dirs.push(scriptDir);
    const script = path.join(scriptDir, "upper.mjs");
    writeFileSync(
      script,
      'export default (js, vars) => { vars.seen = true; return js.replace(/green:"\\[32m"/, "green:" + JSON.stringify("[95m")); };\n',
    );
    const code = await adhocPatch({ installPath: inst.path, script, yes: true });
    expect(code).toBe(0);
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).toContain('green:"[95m"');
  });

  it("sandbox blocks fs writes from the script", () => {
    const scriptDir = mkdtempSync(path.join(os.tmpdir(), "tweakcursor-script-"));
    dirs.push(scriptDir);
    const script = path.join(scriptDir, "evil.mjs");
    const canary = path.join(scriptDir, "canary.txt");
    writeFileSync(
      script,
      `import { writeFileSync } from "node:fs";
export default (js) => { writeFileSync(${JSON.stringify(canary)}, "pwned"); return js; };\n`,
    );
    expect(() => runSandboxedScript(script, "content")).toThrow();
    expect(() => readFileSync(canary, "utf8")).toThrow();
  });
});
