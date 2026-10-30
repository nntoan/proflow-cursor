import React from "react";
import { Box, Text, useInput } from "ink";
import {
  defaultCliConfigPath,
  readCliConfig,
  writeCliConfig,
  type CliConfig,
} from "../engine/cliConfig.js";
import type { TweakcursorConfig } from "../config.js";
import { Header, Menu } from "./ui.js";

export function UpdateGuardView({
  config,
  cliConfigPath,
  onChange,
  onBack,
}: {
  config: TweakcursorConfig;
  cliConfigPath?: string;
  onChange: (next: TweakcursorConfig) => void;
  onBack: () => void;
}) {
  const path = cliConfigPath ?? defaultCliConfigPath();
  const [cliCfg, setCliCfg] = React.useState<CliConfig>(() => {
    try {
      return readCliConfig(path);
    } catch {
      return {};
    }
  });

  useInput((input, key) => {
    if (input === "q" || key.escape) onBack();
  });

  const disableAutoUpdate = cliCfg.disableAutoUpdate === true;
  const channelStatic = cliCfg.channel === "static";
  const warnEnabled = config.patches["update-guard"]?.enabled ?? true;

  const write = (updates: CliConfig): void => {
    setCliCfg(writeCliConfig(updates, path));
  };

  return (
    <Box flexDirection="column">
      <Header title="Update guard" subtitle={path} />
      <Box marginBottom={1}>
        <Text dimColor>
          auto-update overwrites patched files; these official cli-config keys control it
        </Text>
      </Box>
      <Menu
        items={[
          {
            value: "disableAutoUpdate",
            label: `[${disableAutoUpdate ? "x" : " "}] disableAutoUpdate`,
            hint: "official key, skips update checks",
          },
          {
            value: "channel",
            label: `[${channelStatic ? "x" : " "}] channel: static`,
            hint: "static channel never self-updates",
          },
          {
            value: "warn",
            label: `[${warnEnabled ? "x" : " "}] startup warning patch`,
            hint: "prints patched-install notice",
          },
        ]}
        onSelect={(v) => {
          if (v === "disableAutoUpdate") write({ disableAutoUpdate: !disableAutoUpdate });
          else if (v === "channel") write({ channel: channelStatic ? "prod" : "static" });
          else if (v === "warn") {
            onChange({
              ...config,
              patches: {
                ...config.patches,
                "update-guard": { enabled: !warnEnabled, options: config.patches["update-guard"]?.options },
              },
            });
          }
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>enter toggle · esc/q back</Text>
      </Box>
    </Box>
  );
}
