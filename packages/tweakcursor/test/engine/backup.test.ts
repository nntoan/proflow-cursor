import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createBackup, hasBackup, restoreBackup } from "../../src/engine/backup.js";
import { cleanup, copyFixtureInstall, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mk(): string {
  const d = tmpDir("tweakcursor-bak-");
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

function sha(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const FILES = ["index.js", "8008.index.js", "2478.index.js", "5622.index.js"];

describe("backup/restore", () => {
  it("roundtrip restores sha256-identical content", () => {
    const inst = copyFixtureInstall(mk());
    const before = new Map(FILES.map((f) => [f, sha(path.join(inst.path, f))]));
    const backed = createBackup(inst, FILES);
    expect(backed.sort()).toEqual([...FILES].sort());
    expect(hasBackup(inst)).toBe(true);
    for (const f of FILES) writeFileSync(path.join(inst.path, f), "corrupted();\n");
    const restored = restoreBackup(inst);
    expect(restored.sort()).toEqual([...FILES].sort());
    for (const f of FILES) expect(sha(path.join(inst.path, f))).toBe(before.get(f));
  });

  it("keeps pristine backup on second create without force", () => {
    const inst = copyFixtureInstall(mk());
    createBackup(inst, FILES);
    writeFileSync(path.join(inst.path, "index.js"), "later();\n");
    expect(createBackup(inst, FILES)).toEqual([]);
    restoreBackup(inst);
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).not.toBe("later();\n");
  });

  it("force re-backs up", () => {
    const inst = copyFixtureInstall(mk());
    createBackup(inst, FILES);
    writeFileSync(path.join(inst.path, "index.js"), "v2();\n");
    expect(createBackup(inst, FILES, { force: true }).sort()).toEqual([...FILES].sort());
    restoreBackup(inst);
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).toBe("v2();\n");
  });

  it("restore without backup throws", () => {
    const inst = copyFixtureInstall(mk());
    expect(() => restoreBackup(inst)).toThrow(/No backup found/);
  });
});
