import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isAutoUpdateDisabled, readCliConfig, writeCliConfig } from "../../src/engine/cliConfig.js";
import { cleanup, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mk(): string {
  const d = tmpDir("tweakcursor-clicfg-");
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

describe("cliConfig", () => {
  it("missing file reads as empty object", () => {
    expect(readCliConfig(path.join(mk(), "nope.json"))).toEqual({});
  });

  it("write creates file and preserves unknown keys", () => {
    const p = path.join(mk(), "cli-config.json");
    writeFileSync(p, JSON.stringify({ theme: "dark", nested: { a: 1 } }));
    const next = writeCliConfig({ disableAutoUpdate: true }, p);
    expect(next).toEqual({ theme: "dark", nested: { a: 1 }, disableAutoUpdate: true });
    expect(JSON.parse(readFileSync(p, "utf8")).theme).toBe("dark");
    expect(readCliConfig(p).disableAutoUpdate).toBe(true);
  });

  it("rejects non-object config", () => {
    const p = path.join(mk(), "cli-config.json");
    writeFileSync(p, "[1,2]");
    expect(() => readCliConfig(p)).toThrow(/not a JSON object/);
  });

  it("isAutoUpdateDisabled honors both keys", () => {
    expect(isAutoUpdateDisabled({})).toBe(false);
    expect(isAutoUpdateDisabled({ disableAutoUpdate: true })).toBe(true);
    expect(isAutoUpdateDisabled({ channel: "static" })).toBe(true);
    expect(isAutoUpdateDisabled({ channel: "prod" })).toBe(false);
  });
});
