import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkRunning, smokeTest } from "../../src/engine/verify.js";
import { cleanup, fixtureInstall, tmpDir } from "./helpers.js";

const dirs: string[] = [];
function mk(): string {
  const d = tmpDir("tweakcursor-verify-");
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

describe("smokeTest", () => {
  it("passes on the fixture install", async () => {
    const res = await smokeTest(fixtureInstall);
    expect(res.ok).toBe(true);
    expect(res.output).toBe("2099.01.01-test");
  });

  it("fails when index.js errors", async () => {
    const dir = mk();
    writeFileSync(path.join(dir, "index.js"), "process.exit(1);\n");
    const res = await smokeTest({ path: dir, version: "x", active: false });
    expect(res.ok).toBe(false);
  });
});

describe("checkRunning", () => {
  it("empty when no .running dir", () => {
    const res = checkRunning(fixtureInstall);
    expect(res.running).toEqual([]);
    expect(res.stale).toEqual([]);
  });

  it("separates live from stale pids", () => {
    const dir = mk();
    const runningDir = path.join(dir, ".running");
    mkdirSync(runningDir, { recursive: true });
    writeFileSync(path.join(runningDir, String(process.pid)), "cursor-agent|now");
    writeFileSync(path.join(runningDir, "99999"), "cursor-agent|long-ago");
    const res = checkRunning({ path: dir, version: "x", active: false });
    expect(res.running).toEqual([process.pid]);
    expect(res.stale).toEqual([99999]);
  });
});
