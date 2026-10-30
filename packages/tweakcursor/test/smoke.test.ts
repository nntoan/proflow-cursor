import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("scaffold smoke", () => {
  it("cli source keeps the bin shebang on line 1", () => {
    const src = readFileSync(path.join(pkgRoot, "src", "cli.ts"), "utf8");
    expect(src.split("\n")[0]).toBe("#!/usr/bin/env node");
  });

  it("built cli runs --version when dist exists", () => {
    const distCli = path.join(pkgRoot, "dist", "cli.js");
    if (!existsSync(distCli)) {
      // build has not run yet; acceptance sequence runs build before test
      return;
    }
    const head = readFileSync(distCli, "utf8").split("\n")[0];
    expect(head).toBe("#!/usr/bin/env node");
    const out = execFileSync(process.execPath, [distCli, "--version"], {
      encoding: "utf8",
    });
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
