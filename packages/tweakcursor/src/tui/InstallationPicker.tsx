import React from "react";
import { Box } from "ink";
import type { Installation } from "../engine/discovery.js";
import { Header, Menu } from "./ui.js";

export function InstallationPicker({
  installs,
  onPick,
}: {
  installs: Installation[];
  onPick: (install: Installation) => void;
}) {
  return (
    <Box flexDirection="column">
      <Header title="Select cursor-agent installation" subtitle="multiple versions found" />
      <Menu
        items={installs.map((i) => ({
          value: i.path,
          label: `${i.version}${i.active ? " (active)" : ""}`,
          hint: i.path,
        }))}
        onSelect={(value) => {
          const found = installs.find((i) => i.path === value);
          if (found) onPick(found);
        }}
      />
    </Box>
  );
}
