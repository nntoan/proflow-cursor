import React from "react";
import { Box, Text, useApp, useInput } from "ink";
import { exec } from "node:child_process";
import os from "node:os";
import { hasBackup, restoreBackup } from "../engine/backup.js";
import { defaultCliConfigPath, isAutoUpdateDisabled, readCliConfig } from "../engine/cliConfig.js";
import { detectInstallation, findInstallations, type Installation } from "../engine/discovery.js";
import { checkRunning } from "../engine/verify.js";
import {
  DEFAULT_CONFIG,
  getConfigPath,
  readConfig,
  writeConfig,
  type TweakcursorConfig,
} from "../config.js";
import { ApplyView, type ApplyRunResult } from "./ApplyView.js";
import { InstallationPicker } from "./InstallationPicker.js";
import { MainMenu, type MenuChoice } from "./MainMenu.js";
import { PatchToggles } from "./PatchToggles.js";
import { ReportView } from "./ReportView.js";
import { ThemeEditor } from "./ThemeEditor.js";
import { UpdateGuardView } from "./UpdateGuardView.js";
import { Header } from "./ui.js";

export interface AppProps {
  env?: NodeJS.ProcessEnv;
  home?: string;
  installPath?: string;
}

type Screen =
  | { name: "boot" }
  | { name: "picker"; installs: Installation[] }
  | { name: "menu" }
  | { name: "patches" }
  | { name: "themes" }
  | { name: "guard" }
  | { name: "apply" }
  | { name: "report"; title: string; lines: string[] }
  | { name: "error"; message: string };

export function App({ env = process.env, home = os.homedir(), installPath }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = React.useState<Screen>({ name: "boot" });
  const [install, setInstall] = React.useState<Installation | null>(null);
  const [config, setConfig] = React.useState<TweakcursorConfig>({ ...DEFAULT_CONFIG });
  const cliConfigPath = defaultCliConfigPath(home, env);

  // mirror screen into a ref so the input handler never goes stale
  const screenRef = React.useRef(screen);
  screenRef.current = screen;
  // 'q' arriving during boot (e.g. piped stdin) is honored once the menu mounts
  const pendingQuit = React.useRef(false);

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit();
    if (input === "q") {
      if (screenRef.current.name === "menu") exit();
      else if (screenRef.current.name === "boot") pendingQuit.current = true;
    }
  });

  React.useEffect(() => {
    if (screen.name === "menu" && pendingQuit.current) exit();
  }, [screen, exit]);

  React.useEffect(() => {
    void (async () => {
      const cfg = (await readConfig(env, home)) ?? { ...DEFAULT_CONFIG };
      setConfig(cfg);
      try {
        const explicit = installPath ?? env.TWEAKCURSOR_INSTALL_PATH?.trim();
        if (explicit) {
          setInstall(detectInstallation({ path: explicit, env, home }));
          setScreen({ name: "menu" });
          return;
        }
        const installs = findInstallations({ home });
        if (installs.length === 0) {
          setScreen({
            name: "error",
            message: "No cursor-agent installation found under ~/.local/share/cursor-agent/versions",
          });
        } else if (installs.length === 1) {
          setInstall(installs[0]!);
          setScreen({ name: "menu" });
        } else {
          const active = installs.find((i) => i.active);
          if (active) {
            setInstall(active);
            setScreen({ name: "menu" });
          } else {
            setScreen({ name: "picker", installs });
          }
        }
      } catch (err) {
        setScreen({ name: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMenu = (choice: MenuChoice): void => {
    switch (choice) {
      case "exit":
        exit();
        return;
      case "apply":
        setScreen({ name: "apply" });
        return;
      case "restore": {
        if (!install) return;
        const lines: string[] = [];
        if (!hasBackup(install)) {
          lines.push("no backup found — install is already pristine");
        } else {
          const restored = restoreBackup(install);
          lines.push(`restored ${restored.length} file(s): ${restored.join(", ")}`);
          const next = { ...config, changesApplied: false };
          setConfig(next);
          void writeConfig(next, env, home);
          lines.push("install is pristine");
        }
        setScreen({ name: "report", title: "Restore", lines });
        return;
      }
      case "config": {
        const p = getConfigPath(env, home);
        const opener = process.platform === "darwin" ? "open" : "xdg-open";
        exec(`${opener} ${JSON.stringify(p)}`);
        setScreen({
          name: "report",
          title: "Config",
          lines: [`config path: ${p}`, "opened with the system default editor (best effort)"],
        });
        return;
      }
      case "doctor": {
        if (!install) return;
        const lines: string[] = [`selected: ${install.version}  ${install.path}`];
        lines.push(`backup:   ${hasBackup(install) ? "present" : "none"}`);
        const running = checkRunning(install);
        lines.push(
          `running:  ${running.running.length === 0 ? "none" : running.running.map(String).join(", ")}` +
            (running.stale.length > 0 ? ` (${running.stale.length} stale markers)` : ""),
        );
        let guard = "unknown";
        try {
          guard = isAutoUpdateDisabled(readCliConfig(cliConfigPath))
            ? "OFF (patches safe)"
            : "ACTIVE (patches at risk)";
        } catch {
          guard = "unreadable cli-config";
        }
        lines.push(`auto-update: ${guard}`);
        setScreen({ name: "report", title: "Doctor", lines });
        return;
      }
      case "patches":
        setScreen({ name: "patches" });
        return;
      case "themes":
        setScreen({ name: "themes" });
        return;
      case "guard":
        setScreen({ name: "guard" });
        return;
    }
  };

  switch (screen.name) {
    case "boot":
      return (
        <Box>
          <Text dimColor>loading…</Text>
        </Box>
      );
    case "error":
      return (
        <Box flexDirection="column">
          <Header title="Cannot start" />
          <Text color="red">{screen.message}</Text>
        </Box>
      );
    case "picker":
      return (
        <InstallationPicker
          installs={screen.installs}
          onPick={(picked) => {
            setInstall(picked);
            setScreen({ name: "menu" });
          }}
        />
      );
    case "menu":
      return install ? (
        <MainMenu install={install} config={config} onSelect={onMenu} onExit={exit} />
      ) : null;
    case "patches":
      return install ? (
        <PatchToggles
          config={config}
          installVersion={install.version}
          onChange={setConfig}
          onBack={() => setScreen({ name: "menu" })}
        />
      ) : null;
    case "themes":
      return (
        <ThemeEditor config={config} onChange={setConfig} onBack={() => setScreen({ name: "menu" })} />
      );
    case "guard":
      return (
        <UpdateGuardView
          config={config}
          cliConfigPath={cliConfigPath}
          onChange={setConfig}
          onBack={() => setScreen({ name: "menu" })}
        />
      );
    case "apply":
      return install ? (
        <ApplyView
          install={install}
          config={config}
          deps={{ env, home, cliConfigPath }}
          onDone={(result: ApplyRunResult) => {
            setConfig((c) => ({ ...c, changesApplied: result.code !== 3 }));
            setScreen({ name: "report", title: "Apply report", lines: result.lines });
          }}
        />
      ) : null;
    case "report":
      return (
        <ReportView
          title={screen.title}
          lines={screen.lines}
          onBack={() => setScreen({ name: "menu" })}
          onExit={exit}
        />
      );
  }
}
