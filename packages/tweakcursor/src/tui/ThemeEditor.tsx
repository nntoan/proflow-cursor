import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { TweakcursorConfig } from "../config.js";
import type { DiffPalette } from "../patches/registry.js";
import { PRESETS } from "./theme.js";
import { Header, Menu, Swatch } from "./ui.js";

type Field = "lightAdd" | "lightRemove" | "darkAdd" | "darkRemove";
const FIELDS: { key: Field; label: string }[] = [
  { key: "lightAdd", label: "light add" },
  { key: "lightRemove", label: "light remove" },
  { key: "darkAdd", label: "dark add" },
  { key: "darkRemove", label: "dark remove" },
];

function getField(p: DiffPalette, key: Field): string {
  return key === "lightAdd" ? p.light.add : key === "lightRemove" ? p.light.remove : key === "darkAdd" ? p.dark.add : p.dark.remove;
}

function setField(p: DiffPalette, key: Field, value: string): DiffPalette {
  if (key === "lightAdd") return { ...p, light: { ...p.light, add: value } };
  if (key === "lightRemove") return { ...p, light: { ...p.light, remove: value } };
  if (key === "darkAdd") return { ...p, dark: { ...p.dark, add: value } };
  return { ...p, dark: { ...p.dark, remove: value } };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function ThemeEditor({
  config,
  onChange,
  onBack,
}: {
  config: TweakcursorConfig;
  onChange: (next: TweakcursorConfig) => void;
  onBack: () => void;
}) {
  const current = (config.patches.themes?.options?.palette as DiffPalette | undefined) ?? PRESETS[0]!.palette;
  const [draft, setDraft] = React.useState<DiffPalette>(current);
  const [editing, setEditing] = React.useState<Field | null>(null);

  useInput(
    (input, key) => {
      if (editing) return; // TextInput owns keys while editing
      if (input === "q" || key.escape) onBack();
    },
    { isActive: editing === null },
  );

  const save = (palette: DiffPalette): void => {
    setDraft(palette);
    onChange({
      ...config,
      patches: {
        ...config.patches,
        themes: { enabled: true, options: { ...config.patches.themes?.options, palette } },
      },
    });
  };

  if (editing) {
    const field = FIELDS.find((f) => f.key === editing)!;
    const idx = FIELDS.findIndex((f) => f.key === editing);
    return (
      <Box flexDirection="column">
        <Header title="Custom palette" subtitle={`${field.label} — hex #RRGGBB, enter for next`} />
        <Text>
          {field.label}:{" "}
          <TextInput
            value={getField(draft, editing)}
            onChange={(v) => setDraft(setField(draft, editing, v))}
            onSubmit={(v) => {
              const value = HEX.test(v) ? v : getField(draft, editing);
              const next = setField(draft, editing, value);
              setDraft(next);
              const following = FIELDS[idx + 1];
              if (following) setEditing(following.key);
              else {
                setEditing(null);
                save(next);
              }
            }}
          />
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header title="Themes" subtitle="diff highlight palette (enables the themes patch)" />
      <Box flexDirection="column" marginBottom={1}>
        <Swatch color={draft.light.add} label="light add" />
        <Swatch color={draft.light.remove} label="light remove" />
        <Swatch color={draft.dark.add} label="dark add" />
        <Swatch color={draft.dark.remove} label="dark remove" />
      </Box>
      <Menu
        items={[
          ...PRESETS.map((p) => ({ value: p.name, label: p.name })),
          ...FIELDS.map((f) => ({ value: `edit:${f.key}`, label: `edit ${f.label}`, hint: getField(draft, f.key) })),
        ]}
        onSelect={(v) => {
          if (v.startsWith("edit:")) {
            setEditing(v.slice(5) as Field);
            return;
          }
          const preset = PRESETS.find((p) => p.name === v);
          if (preset) save(preset.palette);
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>enter pick/edit · esc/q back</Text>
      </Box>
    </Box>
  );
}
