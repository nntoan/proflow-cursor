import React from "react";
import { Box, Text, useInput } from "ink";

export interface MenuItem {
  value: string;
  label: string;
  hint?: string;
}

/** Minimal arrow-key select list. Enter picks, onSelect fires with value. */
export function Menu({
  items,
  onSelect,
  isActive = true,
}: {
  items: MenuItem[];
  onSelect: (value: string) => void;
  isActive?: boolean;
}) {
  const [cursor, setCursor] = React.useState(0);
  useInput(
    (input, key) => {
      if (key.upArrow) setCursor((c) => (c - 1 + items.length) % items.length);
      else if (key.downArrow) setCursor((c) => (c + 1) % items.length);
      else if (key.return) onSelect(items[cursor]?.value ?? "");
    },
    { isActive },
  );
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item.value}>
          <Text inverse={i === cursor}>{i === cursor ? "❯ " : "  "}{item.label}</Text>
          {item.hint ? <Text dimColor>  {item.hint}</Text> : null}
        </Text>
      ))}
    </Box>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        tweakcursor
      </Text>
      <Text bold>{title}</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <Text>
      <Text backgroundColor={color}>  </Text> <Text dimColor>{label} {color}</Text>
    </Text>
  );
}
