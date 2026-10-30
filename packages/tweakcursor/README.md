# tweakcursor

Customize and patch the shipped **cursor-agent** CLI (the terminal agent that ships with
Cursor): disable third-party plugin imports, recolor diff highlights, guard against
self-updates wiping your patches, and apply your own ad-hoc edits.

```bash
npx tweakcursor            # interactive TUI wizard
npx tweakcursor --apply    # non-interactive apply
npx tweakcursor doctor     # environment report
```

> **Disclaimer**
>
> tweakcursor is an **unofficial, community project. It is not affiliated with,
> endorsed by, or supported by Anysphere** (the makers of Cursor). `cursor-agent` is
> proprietary software; tweakcursor contains **no Anysphere code** — it is a patcher
> that edits files already installed on your own machine, and it distributes only its
> own code.
>
> Modifying local installation files may conflict with the
> [Cursor Terms of Service](https://cursor.com/terms-of-service) (see §1.5). Review the
> terms and decide for yourself; **use at your own risk**. A valid Cursor subscription
> is required to use cursor-agent. If cursor-agent breaks after patching, run
> `tweakcursor --restore` or reinstall it.
>
> Note: the npm packages named `cursor-agent` and `cursor-cli` are **not** Cursor's
> official CLI and are unrelated to this project.

## Why

cursor-agent imports third-party plugins/skills (`.claude/`, `.codex/`, `.grok/`,
`.agents/`, …) with **no official setting to turn that off** (Cursor staff confirmed in
the forum). tweakcursor surgically patches the shipped bundle to disable those code
paths, and adds a few quality-of-life tweaks on top.

## Safety model

- **Backup before write** — the first apply snapshots every file it may touch into
  `<install>/.tweakcursor-backup/` (sha256 manifest). Every later apply restores the
  pristine files first, so applies are non-additive and idempotent.
- **Parse gate** — no patched file is written unless the result still parses as
  JavaScript (`node --check`).
- **Atomic per patch** — if any anchor of a patch misses, that patch fails as a whole
  and writes nothing. Other patches still proceed (**posture B**: best effort, loud
  per-patch report, never a partial patch).
- **Smoke verify** — after applying, `index.js --version` must still boot; on failure
  the backup is restored automatically.
- **Anchor-verified versions** — patches are verified against cursor-agent
  `2026.10.22-27dcf5f`. On any other version tweakcursor prints a loud UNVERIFIED
  warning and attempts anyway (posture B), failing safely if anchors drifted.
- **Restore anytime** — `tweakcursor --restore` returns the install to pristine.

## Commands

| Command | Description |
| --- | --- |
| `tweakcursor` | TUI wizard (pick install → toggles → themes → update guard → apply) |
| `tweakcursor --apply [--patches id1,id2] [-y]` | Restore-first, then apply enabled (or listed) patches |
| `tweakcursor --restore` | Restore pristine files from backup |
| `tweakcursor --list-patches` | List built-in patches |
| `tweakcursor doctor` | Installs, backup state, running PIDs, cli-config keys, verification matrix |
| `tweakcursor adhoc-patch --string X --replace Y [--index n] [--file f]` | One-shot literal edit (no backup) |
| `tweakcursor adhoc-patch --regex RX --replace R` | One-shot regex edit (`$1` groups supported) |
| `tweakcursor adhoc-patch --script file.mjs` | Transform via sandboxed script (`default export (js, vars) => newJs`; runs under Node's permission model — no fs write/net/subprocess) |

Global flags: `--install-path <dir>` (or `TWEAKCURSOR_INSTALL_PATH`), `-y/--yes`,
`-v/--verbose` (per-edit diffs), `-d/--debug`.

Exit codes: `0` ok · `1` user error · `2` some patches failed (posture B) · `3` smoke
verify failed (install auto-restored).

## Built-in patches

| Patch | Default | What it does |
| --- | --- | --- |
| `disable-third-party-plugins` | on | Forces `importThirdPartyPlugins` false at every gate (loader, filters, headless wiring) |
| `disable-third-party-extensibility` | off | Forces `thirdPartyExtensibilityEnabled` false (skill/rule discovery gates) |
| `patched-indicator` | on | Shows `[tweakcursor]` in the `--help` description (display sites only, never version sources) |
| `themes` | off | Rewrites the diff-highlight hex tables from a configurable palette |
| `update-guard` | on | Disables auto-update via the official `~/.cursor/cli-config.json` keys (`disableAutoUpdate`) and prints a startup reminder that the install is patched |
| `adhoc-patch` | — | Subcommand for your own one-shot edits |

Config lives in `~/.tweakcursor/config.json` (`TWEAKCURSOR_CONFIG_DIR` to override).
cli-config (`~/.cursor/cli-config.json`) is only ever merged — unknown keys are
preserved (`TWEAKCURSOR_CLI_CONFIG_PATH` to override).

## Requirements

- Node.js ≥ 20 (the adhoc script sandbox needs the Node permission model)
- macOS or Linux
- A plain-JS cursor-agent install (`~/.local/share/cursor-agent/versions/<version>/`)

## Development

```bash
npm install
npm run build -w tweakcursor
npm test -w tweakcursor       # vitest, synthetic fixtures only
npm run typecheck -w tweakcursor
```

Tests run against synthetic, hand-written fixture bundles that mimic the real bundle's
anchor shapes. No Anysphere code is (or may be) committed — real-chunk fixtures for
local debugging belong in `test/.local-fixtures/` (gitignored, see
`scripts/make-fixtures.mjs`).

## License

MIT — see [LICENSE](./LICENSE).
