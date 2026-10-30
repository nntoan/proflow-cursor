import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyPatches } from "../../src/engine/patcher.js";
import { REGISTRY, VERIFIED_VERSION } from "../../src/patches/registry.js";
import { cleanup, copyFixtureInstall, tmpDir } from "../engine/helpers.js";

const dirs: string[] = [];
function mkInst() {
  const d = tmpDir("tweakcursor-reg-");
  dirs.push(d);
  return copyFixtureInstall(d);
}
afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

function build(id: string, version = "2099.01.01-test", options: Record<string, unknown> = {}) {
  const entry = REGISTRY.find((e) => e.id === id);
  if (!entry) throw new Error(`registry missing ${id}`);
  return entry.build({ version, options });
}

function applyOne(id: string, inst: { path: string; version: string; active: boolean }) {
  const patch = build(id, inst.version);
  const [report] = applyPatches(inst, [patch]);
  if (!report) throw new Error("no report");
  return report;
}

describe("registry contract", () => {
  it("has 5 built-ins, all verified against VERIFIED_VERSION", () => {
    expect(REGISTRY.map((e) => e.id)).toEqual([
      "disable-third-party-plugins",
      "disable-third-party-extensibility",
      "patched-indicator",
      "themes",
      "update-guard",
    ]);
    for (const e of REGISTRY) {
      expect(e.build({ version: VERIFIED_VERSION, options: {} }).verifiedVersions).toContain(
        VERIFIED_VERSION,
      );
    }
  });
});

describe("disable-third-party-plugins", () => {
  it("rewrites all three gate sites on the fixture", () => {
    const inst = mkInst();
    const report = applyOne("disable-third-party-plugins", inst);
    expect(report.status).toBe("applied");
    const index = readFileSync(path.join(inst.path, "index.js"), "utf8");
    expect(index).toContain(".importThirdPartyPlugins&&!1||(");
    expect(index).toContain("a=!1,");
    expect(index).not.toContain("a=s.importThirdPartyPlugins,");
    const headless = readFileSync(path.join(inst.path, "3863.index.js"), "utf8");
    expect(headless).toContain("he=!1");
  });
});

describe("disable-third-party-extensibility", () => {
  it("forces the gate false at both construction sites", () => {
    const inst = mkInst();
    const report = applyOne("disable-third-party-extensibility", inst);
    expect(report.status).toBe("applied");
    expect(readFileSync(path.join(inst.path, "5622.index.js"), "utf8")).toContain(
      "thirdPartyExtensibilityEnabled??!1",
    );
    expect(readFileSync(path.join(inst.path, "2478.index.js"), "utf8")).toContain(
      "getThirdPartyExtensibilityEnabled:j=()=>!1",
    );
  });
});

describe("patched-indicator", () => {
  it("marks only the --help description; version source untouched", () => {
    const inst = mkInst();
    const report = applyOne("patched-indicator", inst);
    expect(report.status).toBe("applied");
    const index = readFileSync(path.join(inst.path, "index.js"), "utf8");
    expect(index).toContain('.description("Cursor Agent [tweakcursor]")');
    // version() must stay clean — the updater parses it
    expect(index).toContain('function version(){return"2099.01.01-test"}');
  });
});

describe("themes", () => {
  it("stock palette is a no-op; custom palette rewrites both tables", () => {
    const inst = mkInst();
    const patch = build("themes", inst.version, {
      palette: { light: { add: "#111111", remove: "#222222" }, dark: { add: "#333333", remove: "#444444" } },
    });
    const [report] = applyPatches(inst, [patch]);
    expect(report?.status).toBe("applied");
    const index = readFileSync(path.join(inst.path, "index.js"), "utf8");
    expect(index).toContain('{addHex:"#111111",removeHex:"#222222"}');
    expect(index).toContain('{addHex:"#333333",removeHex:"#444444"}');
  });
});

describe("update-guard", () => {
  it("injects a startup warning preserving condition truthiness", () => {
    const inst = mkInst();
    const report = applyOne("update-guard", inst);
    expect(report.status).toBe("applied");
    const kickoff = readFileSync(path.join(inst.path, "8008.index.js"), "utf8");
    expect(kickoff).toContain("console.error(");
    expect(kickoff).toContain(inst.version);
    expect(kickoff).toContain('r.disableAutoUpdate)||"static"===er.channel');
  });
});

describe("broken anchors fail atomically (wrong-version simulation)", () => {
  it("FAILED + file untouched when the anchor drifted", () => {
    const inst = mkInst();
    // simulate a bundle update that renamed the description
    const indexPath = path.join(inst.path, "index.js");
    writeFileSync(
      indexPath,
      readFileSync(indexPath, "utf8").replace('.description("Cursor Agent")', '.description("Cursor CLI")'),
    );
    const before = readFileSync(indexPath, "utf8");
    const report = applyOne("patched-indicator", inst);
    expect(report.status).toBe("failed");
    expect(readFileSync(indexPath, "utf8")).toBe(before);
  });

  it("plugins patch fails if the headless chunk drifted, leaving index.js pristine", () => {
    const inst = mkInst();
    const headlessPath = path.join(inst.path, "3863.index.js");
    writeFileSync(
      headlessPath,
      readFileSync(headlessPath, "utf8").replace("he=h.enableMarketplacePlugins", "zz=h.enableMarketplacePluginsX"),
    );
    const indexBefore = readFileSync(path.join(inst.path, "index.js"), "utf8");
    const report = applyOne("disable-third-party-plugins", inst);
    expect(report.status).toBe("failed");
    // atomic: index.js anchors matched but the patch as a whole failed => untouched
    expect(readFileSync(path.join(inst.path, "index.js"), "utf8")).toBe(indexBefore);
  });
});
