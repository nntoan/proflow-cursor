import React from "react";
import { Box, Text, useInput } from "ink";
import type { TweakcursorConfig } from "../config.js";
import { isPatchEnabled, REGISTRY, VERIFIED_VERSION } from "../patches/registry.js";
import { Header, Menu } from "./ui.js";

export function PatchToggles({
  config,
  installVersion,
  onChange,
  onBack,
}: {
  config: TweakcursorConfig;
  installVersion: string;
  onChange: (next: TweakcursorConfig) => void;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (input === "q" || key.escape) onBack();
  });

  const toggle = (id: string): void => {
    const entry = REGISTRY.find((e) => e.id === id);
    if (!entry) return;
    const current = isPatchEnabled(config, entry);
    onChange({
      ...config,
      patches: {
        ...config.patches,
        [id]: { enabled: !current, options: config.patches[id]?.options },
      },
    });
  };

  const unverified = installVersion !== VERIFIED_VERSION;
  return (
    <Box flexDirection="column">
      <Header
        title="Patches"
        subtitle={
          unverified
            ? `UNVERIFIED on ${installVersion} (anchors checked against ${VERIFIED_VERSION})`
            : `verified on ${installVersion}`
        }
      />
      <Menu
        items={REGISTRY.map((e) => {
          const enabled = isPatchEnabled(config, e);
          return {
            value: e.id,
            label: `[${enabled ? "x" : " "}] ${e.id}`,
            hint: e.description,
          };
        })}
        onSelect={toggle}
      />
      <Box marginTop={1}>
        <Text dimColor>enter toggle · esc/q back</Text>
      </Box>
    </Box>
  );
}
