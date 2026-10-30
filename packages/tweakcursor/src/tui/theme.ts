import { STOCK_PALETTE, type DiffPalette } from "../patches/registry.js";

export interface PalettePreset {
  name: string;
  palette: DiffPalette;
}

export const PRESETS: PalettePreset[] = [
  { name: "stock (cursor default)", palette: STOCK_PALETTE },
  {
    name: "ocean",
    palette: {
      light: { add: "#BEE3F8", remove: "#FED7D7" },
      dark: { add: "#2A4365", remove: "#742A2A" },
    },
  },
  {
    name: "forest",
    palette: {
      light: { add: "#C6F6D5", remove: "#FED7E2" },
      dark: { add: "#22543D", remove: "#702459" },
    },
  },
  {
    name: "amber",
    palette: {
      light: { add: "#FEEBC8", remove: "#E9D8FD" },
      dark: { add: "#7B341E", remove: "#44337A" },
    },
  },
];

export function presetByName(name: string | undefined): PalettePreset {
  return PRESETS.find((p) => p.name.startsWith(name ?? "")) ?? PRESETS[0]!;
}
