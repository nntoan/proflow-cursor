import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { App } from "../../src/tui/App.js";
import { REGISTRY } from "../../src/patches/registry.js";
import { cleanup, copyFixtureInstall, tmpDir } from "../engine/helpers.js";

const dirs: string[] = [];

function sandbox() {
  const root = tmpDir("tweakcursor-tui-");
  dirs.push(root);
  const install = copyFixtureInstall(root);
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    TWEAKCURSOR_INSTALL_PATH: install.path,
    TWEAKCURSOR_CONFIG_DIR: path.join(root, "cfg"),
    TWEAKCURSOR_CLI_CONFIG_PATH: path.join(root, "cli-config.json"),
    NO_COLOR: "1",
  };
  return { root, install, home, env };
}

afterEach(() => {
  while (dirs.length) cleanup(dirs.pop() as string);
});

const tick = (ms = 60): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("tui App", () => {
  it("boots to the main menu and quits on q", async () => {
    const { install, home, env } = sandbox();
    const { lastFrame, stdin, unmount } = render(
      <App env={env} home={home} installPath={install.path} />,
    );
    await tick(150);
    expect(lastFrame()).toContain(`cursor-agent ${install.version}`);
    expect(lastFrame()).toContain("Apply patches");
    stdin.write("q");
    await tick();
    unmount();
  });

  it("honors a q pressed during boot (piped stdin)", async () => {
    const { install, home, env } = sandbox();
    const { stdin, unmount, frames } = render(
      <App env={env} home={home} installPath={install.path} />,
    );
    stdin.write("q");
    await tick(200);
    unmount();
    // menu appeared and the app exited without hanging
    expect(frames.join("\n")).toContain("cursor-agent");
  });

  it("toggles a patch and applies via the menu flow", async () => {
    const { install, home, env } = sandbox();
    const { lastFrame, stdin, unmount } = render(
      <App env={env} home={home} installPath={install.path} />,
    );
    await tick(150);

    // menu -> Patches
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("disable-third-party-plugins");

    // toggle themes ON (4th entry: plugins, extensibility, indicator, themes)
    stdin.write("[B"); // down
    stdin.write("[B");
    stdin.write("[B");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("[x] themes");

    stdin.write(""); // back
    await tick();

    // menu -> Apply (down x3: themes, guard, apply)
    stdin.write("[B");
    stdin.write("[B");
    stdin.write("[B");
    await tick();
    stdin.write("\r");
    await tick(400);

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Apply report");
    expect(frame).toContain("applied  disable-third-party-plugins");
    expect(frame).toContain("applied  themes");
    expect(frame).toContain("done");

    // install was actually patched
    const index = readFileSync(path.join(install.path, "index.js"), "utf8");
    expect(index).toContain(".importThirdPartyPlugins&&!1||(");
    // themes is a stock no-op: hex tables unchanged but patch reported applied
    expect(existsSync(path.join(install.path, ".tweakcursor-backup", "manifest.json"))).toBe(true);
    unmount();
  });

  it("update guard view writes cli-config keys", async () => {
    const { install, home, env, root } = sandbox();
    const { lastFrame, stdin, unmount } = render(
      <App env={env} home={home} installPath={install.path} />,
    );
    await tick(150);

    // menu -> Update guard (down x2)
    stdin.write("[B");
    stdin.write("[B");
    await tick();
    stdin.write("\r");
    await tick();
    expect(lastFrame()).toContain("disableAutoUpdate");

    stdin.write("\r"); // toggle disableAutoUpdate on
    await tick();
    expect(lastFrame()).toContain("[x] disableAutoUpdate");

    const cliCfg = JSON.parse(
      readFileSync(path.join(root, "cli-config.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(cliCfg.disableAutoUpdate).toBe(true);
    unmount();
  });

  it("menu patch count matches the toggles screen (defaults included)", async () => {
    const { install, home, env } = sandbox();
    const { lastFrame, stdin, unmount } = render(
      <App env={env} home={home} installPath={install.path} />,
    );
    await tick(150);
    const expected = REGISTRY.filter((e) => e.defaultEnabled).length;
    expect(lastFrame()).toContain(`${expected} enabled`);

    // menu -> Patches: number of checked rows must equal the menu count
    stdin.write("\r");
    await tick();
    const checked = ((lastFrame() ?? "").match(/\[x\]/g) ?? []).length;
    expect(checked).toBe(expected);
    unmount();
  });
});
