import type { Patch } from "../types.js";

/** Version every built-in was anchor-verified against (posture B: others still attempted). */
export const VERIFIED_VERSION = "2026.10.22-27dcf5f";

export interface PatchBuildContext {
  /** Installed cursor-agent version being patched. */
  version: string;
  /** Per-patch options from config (patches.<id>.options). */
  options: Record<string, unknown>;
}

export interface RegistryEntry {
  id: string;
  description: string;
  defaultEnabled: boolean;
  build(ctx: PatchBuildContext): Patch;
}

function base(id: string, description: string): Pick<Patch, "id" | "description" | "verifiedVersions"> {
  return { id, description, verifiedVersions: [VERIFIED_VERSION] };
}

/** disable-third-party-plugins: force importThirdPartyPlugins false at every gate. */
const disableThirdPartyPlugins: RegistryEntry = {
  id: "disable-third-party-plugins",
  description: "Never import third-party (claude/codex/grok/agents) plugins or skills",
  defaultEnabled: true,
  build: () => ({
    ...base("disable-third-party-plugins", "Force importThirdPartyPlugins false"),
    files: [
      {
        file: "index.js",
        anchors: [
          // two filter sites: keep-list filter must ALWAYS run
          {
            kind: "string",
            find: ".importThirdPartyPlugins||(",
            replace: ".importThirdPartyPlugins&&!1||(",
          },
          // loader gate: `a=s.importThirdPartyPlugins,` -> `a=!1,`
          {
            kind: "regex",
            find: /([a-zA-Z$_])=[a-zA-Z$_]+\.importThirdPartyPlugins,/,
            replace: "$1=!1,",
          },
        ],
      },
      {
        file: "3863.index.js",
        anchors: [
          // headless wiring: `he=h.enableMarketplacePlugins` -> `he=!1`
          {
            kind: "regex",
            find: /([a-zA-Z$_]{1,3})=[a-zA-Z$_]+\.enableMarketplacePlugins/,
            replace: "$1=!1",
          },
        ],
      },
    ],
  }),
};

/** disable-third-party-extensibility: force the extensibility gate false at construction. */
const disableThirdPartyExtensibility: RegistryEntry = {
  id: "disable-third-party-extensibility",
  description: "Force thirdPartyExtensibilityEnabled false (skill/rule discovery gates)",
  defaultEnabled: false,
  build: () => ({
    ...base("disable-third-party-extensibility", "Force thirdPartyExtensibilityEnabled false"),
    files: [
      {
        file: "5622.index.js",
        anchors: [
          { kind: "string", find: "thirdPartyExtensibilityEnabled??!0", replace: "thirdPartyExtensibilityEnabled??!1" },
        ],
      },
      {
        file: "2478.index.js",
        anchors: [
          // executor getter: `getThirdPartyExtensibilityEnabled:j=()=>!0` -> `()=>!1`
          {
            kind: "regex",
            find: /getThirdPartyExtensibilityEnabled:([a-zA-Z$_]+)=\(\)=>!0/,
            replace: "getThirdPartyExtensibilityEnabled:$1=()=>!1",
          },
        ],
      },
    ],
  }),
};

/** patched-indicator: display-only marker in --help description. NEVER version sources. */
const patchedIndicator: RegistryEntry = {
  id: "patched-indicator",
  description: "Show [tweakcursor] in the --help program description (display sites only)",
  defaultEnabled: true,
  build: () => ({
    ...base("patched-indicator", "Append [tweakcursor] to the --help description"),
    files: [
      {
        file: "index.js",
        anchors: [
          {
            kind: "string",
            find: '.description("Cursor Agent")',
            replace: '.description("Cursor Agent [tweakcursor]")',
          },
        ],
      },
    ],
  }),
};

export interface DiffPalette {
  light: { add: string; remove: string };
  dark: { add: string; remove: string };
}

/** Stock values — default is a verified no-op until the user picks a palette. */
export const STOCK_PALETTE: DiffPalette = {
  light: { add: "#D0E8C5", remove: "#F7D1BA" },
  dark: { add: "#2b3f2b", remove: "#402626" },
};

function readPalette(options: Record<string, unknown>): DiffPalette {
  const p = options.palette as Partial<DiffPalette> | undefined;
  return {
    light: { ...STOCK_PALETTE.light, ...(p?.light ?? {}) },
    dark: { ...STOCK_PALETTE.dark, ...(p?.dark ?? {}) },
  };
}

/** themes: rewrite the diff-highlight hex tables. Named Ink colors untouched in v1. */
const themes: RegistryEntry = {
  id: "themes",
  description: "Recolor diff highlight tables from config palette (Ink colors: not yet)",
  defaultEnabled: false,
  build: ({ options }) => {
    const palette = readPalette(options);
    return {
      ...base("themes", "Replace diff highlight hex tables"),
      files: [
        {
          file: "index.js",
          anchors: [
            {
              kind: "string",
              find: `{addHex:"${STOCK_PALETTE.light.add}",removeHex:"${STOCK_PALETTE.light.remove}"}`,
              replace: `{addHex:"${palette.light.add}",removeHex:"${palette.light.remove}"}`,
            },
            {
              kind: "string",
              find: `{addHex:"${STOCK_PALETTE.dark.add}",removeHex:"${STOCK_PALETTE.dark.remove}"}`,
              replace: `{addHex:"${palette.dark.add}",removeHex:"${palette.dark.remove}"}`,
            },
          ],
        },
      ],
    };
  },
};

/**
 * update-guard: warn at startup that the install is patched. The real guard is the
 * official cli-config keys (disableAutoUpdate / channel: static) written by apply;
 * this patch only prints. Condition truthiness is preserved via a comma expression.
 */
const updateGuard: RegistryEntry = {
  id: "update-guard",
  description: "Startup warning that patches are applied (guard itself: cli-config keys)",
  defaultEnabled: true,
  build: ({ version }) => {
    const msg =
      `[tweakcursor] this cursor-agent ${version} is patched. ` +
      `A self-update would silently drop patches; auto-update is disabled in ~/.cursor/cli-config.json.`;
    return {
      ...base("update-guard", "Print patched-install warning at startup"),
      files: [
        {
          file: "8008.index.js",
          anchors: [
            {
              kind: "regex",
              find: /([a-zA-Z$_]{1,3})\.disableAutoUpdate\|\|"static"===([a-zA-Z$_]{1,3})\.channel\|\|setTimeout/,
              replace: `(console.error(${JSON.stringify(msg)}),$1.disableAutoUpdate)||"static"===$2.channel||setTimeout`,
            },
          ],
        },
      ],
    };
  },
};

export const REGISTRY: RegistryEntry[] = [
  disableThirdPartyPlugins,
  disableThirdPartyExtensibility,
  patchedIndicator,
  themes,
  updateGuard,
];

export function getEntry(id: string): RegistryEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}
