import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyPatches } from "../../src/engine/patcher.js";
import { isVerified, unverifiedWarning } from "../../src/engine/versionGate.js";
import type { Patch } from "../../src/types.js";
import { cleanup, copyFixtureInstall, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mkInst() {
  const d = tmpDir("tweakcursor-patch-");
  dirs.push(d);
  return copyFixtureInstall(d);
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

function patch(partial: Partial<Patch> & Pick<Patch, "id" | "files">): Patch {
  return {
    description: "test patch",
    verifiedVersions: ["2099.01.01-test"],
    ...partial,
  };
}

function read(inst: { path: string }, file: string): string {
  return readFileSync(path.join(inst.path, file), "utf8");
}

describe("applyPatches anchors", () => {
  it("string anchor replaces all occurrences", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p1",
        files: [{ file: "index.js", anchors: [{ kind: "string", find: '"[32m"', replace: '"[92m"' }] }],
      }),
    ]);
    expect(report?.status).toBe("applied");
    expect(report?.changes[0]?.hunks).toHaveLength(1);
    expect(read(inst, "index.js")).toContain('green:"[92m"');
  });

  it("string anchor with index replaces only that occurrence", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p2",
        files: [
          {
            file: "8008.index.js",
            anchors: [{ kind: "string", find: "realCheck", replace: "CHECK", index: 2 }],
          },
        ],
      }),
    ]);
    expect(report?.status).toBe("applied");
    const content = read(inst, "8008.index.js");
    expect(content).toContain("function realCheck");
    expect(content).toContain("CHECK({showProgress");
  });

  it("regex anchor supports $1 group substitution", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p3",
        files: [
          {
            file: "index.js",
            anchors: [
              {
                kind: "regex",
                find: /(add|remove)Hex:"#[0-9A-Fa-f]{6}"/,
                replace: '$1Hex:"#000000"',
              },
            ],
          },
        ],
      }),
    ]);
    expect(report?.status).toBe("applied");
    const content = read(inst, "index.js");
    expect(content).toContain('addHex:"#000000"');
    expect(content).toContain('removeHex:"#000000"');
    expect(content).toContain('addBgHex:"#2b3f2b"');
  });

  it("FAILED on zero matches, file untouched", () => {
    const inst = mkInst();
    const before = read(inst, "index.js");
    const [report] = applyPatches(inst, [
      patch({
        id: "p4",
        files: [{ file: "index.js", anchors: [{ kind: "string", find: "DOES-NOT-EXIST", replace: "x" }] }],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(report?.failures[0]?.reason).toMatch(/no occurrence/);
    expect(read(inst, "index.js")).toBe(before);
  });

  it("FAILED when occurrence index out of range", () => {
    const inst = mkInst();
    const before = read(inst, "8008.index.js");
    const [report] = applyPatches(inst, [
      patch({
        id: "p5",
        files: [
          {
            file: "8008.index.js",
            anchors: [{ kind: "string", find: "realCheck", replace: "X", index: 9 }],
          },
        ],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(report?.failures[0]?.reason).toMatch(/occurrence #9/);
    expect(read(inst, "8008.index.js")).toBe(before);
  });

  it("parse gate rejects broken JS, file untouched", () => {
    const inst = mkInst();
    const before = read(inst, "index.js");
    const [report] = applyPatches(inst, [
      patch({
        id: "p6",
        files: [
          {
            file: "index.js",
            anchors: [{ kind: "string", find: "function version()", replace: "function version(" }],
          },
        ],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(report?.failures[0]?.reason).toMatch(/parse gate/);
    expect(read(inst, "index.js")).toBe(before);
  });

  it("multi-file patch is atomic: one bad anchor fails the whole patch", () => {
    const inst = mkInst();
    const beforeIndex = read(inst, "index.js");
    const [report] = applyPatches(inst, [
      patch({
        id: "p7",
        files: [
          { file: "index.js", anchors: [{ kind: "string", find: '"[32m"', replace: '"[92m"' }] },
          { file: "8008.index.js", anchors: [{ kind: "string", find: "NOPE", replace: "x" }] },
        ],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(read(inst, "index.js")).toBe(beforeIndex);
  });

  it("missing file fails the patch", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p8",
        files: [{ file: "9999.index.js", anchors: [{ kind: "string", find: "x", replace: "y" }] }],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(report?.failures[0]?.reason).toBe("file not found");
  });

  it("rejects paths escaping the install dir", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p9",
        files: [{ file: "../outside.js", anchors: [{ kind: "string", find: "x", replace: "y" }] }],
      }),
    ]);
    expect(report?.status).toBe("failed");
    expect(report?.failures[0]?.reason).toMatch(/escapes/);
  });

  it("dryRun reports changes without writing", () => {
    const inst = mkInst();
    const before = read(inst, "index.js");
    const [report] = applyPatches(
      inst,
      [
        patch({
          id: "p10",
          files: [{ file: "index.js", anchors: [{ kind: "string", find: '"[32m"', replace: '"[92m"' }] }],
        }),
      ],
      { dryRun: true },
    );
    expect(report?.status).toBe("applied");
    expect(report?.changes[0]?.hunks.length).toBeGreaterThan(0);
    expect(read(inst, "index.js")).toBe(before);
  });

  it("posture B: unverified version still attempts, report flags verified=false", () => {
    const inst = mkInst();
    const [report] = applyPatches(inst, [
      patch({
        id: "p11",
        verifiedVersions: ["1.0.0-other"],
        files: [{ file: "index.js", anchors: [{ kind: "string", find: '"[32m"', replace: '"[92m"' }] }],
      }),
    ]);
    expect(report?.status).toBe("applied");
    expect(report?.verified).toBe(false);
  });

  it("other patches proceed when one fails (posture B)", () => {
    const inst = mkInst();
    const reports = applyPatches(inst, [
      patch({
        id: "bad",
        files: [{ file: "index.js", anchors: [{ kind: "string", find: "NOPE", replace: "x" }] }],
      }),
      patch({
        id: "good",
        files: [{ file: "index.js", anchors: [{ kind: "string", find: '"[32m"', replace: '"[92m"' }] }],
      }),
    ]);
    expect(reports.map((r) => [r.id, r.status])).toEqual([
      ["bad", "failed"],
      ["good", "applied"],
    ]);
  });
});

describe("versionGate", () => {
  it("isVerified + warning text", () => {
    const p = patch({ id: "x", files: [] });
    expect(isVerified(p, "2099.01.01-test")).toBe(true);
    expect(isVerified(p, "other")).toBe(false);
    expect(unverifiedWarning(p, "other")).toContain('"x"');
    expect(unverifiedWarning(p, "other")).toContain("other");
  });
});
