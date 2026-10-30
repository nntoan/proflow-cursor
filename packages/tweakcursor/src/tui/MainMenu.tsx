import React from "react";
import { Box, Text, useInput } from "ink";
import type { Installation } from "../engine/discovery.js";
import type { TweakcursorConfig } from "../config.js";
import { enabledPatches } from "../patches/registry.js";
import { Header, Menu } from "./ui.js";

export type MenuChoice =
  | "patches"
  | "themes"
  | "guard"
  | "apply"
  | "restore"
  | "config"
  | "doctor"
  | "exit";

export function MainMenu({
  install,
  config,
  onSelect,
  onExit,
}: {
  install: Installation;
  config: TweakcursorConfig;
  onSelect: (choice: MenuChoice) => void;
  onExit: () => void;
}) {
  useInput((input) => {
    if (input === "q") onExit();
  });
  const enabled = enabledPatches(config).length;
  return (
    <Box flexDirection="column">
      <Header
        title={`cursor-agent ${install.version}`}
        subtitle={`${install.path}${config.changesApplied ? "  [PATCHED]" : ""}`}
      />
      <Menu
        items={[
          { value: "patches", label: "Patches", hint: `${enabled} enabled` },
          { value: "themes", label: "Themes", hint: "diff highlight palettes" },
          { value: "guard", label: "Update guard", hint: "cli-config auto-update keys" },
          { value: "apply", label: "Apply patches" },
          { value: "restore", label: "Restore original" },
          { value: "config", label: "Open config.json" },
          { value: "doctor", label: "Doctor" },
          { value: "exit", label: "Exit", hint: "q" },
        ]}
        onSelect={(v) => onSelect(v as MenuChoice)}
      />
      <Box marginTop={1}>
        <Text dimColor>↑/↓ navigate · enter select · q quit</Text>
      </Box>
    </Box>
  );
}
