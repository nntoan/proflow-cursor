# Spec: tweakcursor — patch & customize the shipped cursor-agent CLI

**Date:** 2026-10-30 · **Status:** ready-for-agent (v0.1.0 implemented; this spec documents the delivered milestone) · **Package:** `tweakcursor` (npm, MIT)

## Problem Statement

Cursor's terminal agent (`cursor-agent`) silently imports third-party plugins and
skills from competing tool ecosystems (`.claude/`, `.codex/`, `.grok/`, `.agents/`)
into every session. There is **no official setting to disable this** — Cursor staff
confirmed on the forum that the toggle is hardcoded. Users who want a hermetic,
Cursor-only agent have no recourse.

On top of that, cursor-agent **self-updates in the background** (~2s after startup,
unless the official cli-config keys say otherwise), so any local modification is
silently wiped. And its bundled diff-highlight colors are fixed.

Users are left choosing between accepting behavior they didn't ask for, or hacking
minified bundles by hand with no safety net: no backup, no validation, no way to know
whether an edit broke the binary until it crashes mid-session.

## Solution

A standalone CLI + TUI wizard, `tweakcursor` (npm: `npx tweakcursor`), that patches
the locally installed cursor-agent bundle with surgical, verified string/regex
anchors — never shipping any Anysphere code, only the patcher.

From the user's perspective:

- Run `npx tweakcursor`, pick the installation, toggle patches, apply. Done.
- Every apply starts from a pristine restore of the last backup, so repeated runs are
  idempotent and non-additive.
- If a patch's anchors no longer match (cursor-agent updated), that patch fails
  loudly and writes nothing; the others still apply (**posture B**).
- If the patched binary fails to boot, the backup is restored automatically.
- An update guard sets the **official** `disableAutoUpdate` cli-config key and prints
  a startup reminder, so patches are not silently lost to self-update.
- `tweakcursor --restore` returns the install to pristine at any time.

## User Stories

1. As a cursor-agent user, I want to disable third-party plugin imports, so that agent sessions only load Cursor-native capabilities.
2. As a cursor-agent user, I want third-party skill/rule discovery gates forced off at construction, so that `.claude/`/`.codex/`/`.grok/`/`.agents/` paths are never walked.
3. As a user, I want an interactive wizard, so that I can patch my install without memorizing flags.
4. As a user with multiple cursor-agent versions on disk, I want to pick which installation to patch, so that I don't touch the wrong one.
5. As a user, I want the active installation auto-detected, so that the common case needs zero configuration.
6. As a user, I want an explicit `--install-path`/env override, so that I can patch non-standard layouts.
7. As a user, I want every file backed up before the first write, so that I can always get back to a working agent.
8. As a user, I want applies to restore-then-patch from the pristine backup, so that running apply twice never double-applies an edit.
9. As a user, I want each patch to be atomic, so that a half-applied patch can never leave my bundle inconsistent.
10. As a user, I want other patches to still apply when one fails, so that one drifted anchor doesn't block everything (posture B).
11. As a user, I want patched files validated as parseable JavaScript before they're written, so that a bad edit can never produce a syntax-error bundle.
12. As a user, I want a post-apply boot smoke test with automatic restore on failure, so that I'm never left with a broken agent.
13. As a user, I want a loud, unmissable warning when my cursor-agent version isn't anchor-verified, so that I know I'm in best-effort territory.
14. As a user, I want unverified versions attempted anyway, so that minor upstream bumps often keep working without waiting for a tweakcursor release.
15. As a user, I want `--restore` to bring my install back to pristine, so that I can undo everything cleanly.
16. As a user, I want restore to be a safe no-op when there's no backup, so that scripts can call it unconditionally.
17. As a user, I want auto-update disabled via the official cli-config keys when the update guard is on, so that a background update can't silently wipe my patches.
18. As a user, I want cli-config writes to merge and preserve unknown keys, so that tweakcursor never clobbers other settings.
19. As a user, I want a startup warning printed by the patched bundle itself, so that I'm reminded the install is patched when I launch cursor-agent.
20. As a user, I want a `[tweakcursor]` marker in `--help` output, so that I can tell at a glance whether an install is patched.
21. As a user, I want version-parsing code paths never touched by the indicator, so that the updater can't be confused by the marker.
22. As a user, I want to recolor diff-highlight tables from preset palettes, so that diffs match my terminal theme.
23. As a user, I want to enter custom hex colors in the TUI, so that I can match any palette.
24. As a user, I want themes applied through the same atomic/gated pipeline, so that cosmetic edits get the same safety as behavioral ones.
25. As a user, I want a `doctor` command reporting installs, backup state, running PIDs, cli-config keys, and the verification matrix, so that I can diagnose issues without guesswork.
26. As a user, I want a `--list-patches` command, so that I can see what's available and what's on by default.
27. As a user, I want `--apply --patches id1,id2` to be a non-additive one-shot selection, so that I can test a single patch without changing my saved toggles.
28. As a user, I want my enabled toggles and theme palette persisted in a config file, so that re-applies after updates repeat my choices.
29. As a user, I want a `--config-url` option whose remote values act only as defaults (local config always wins), so that teams can share baselines without losing local control.
30. As a user, I want clear exit codes (0 ok / 1 user error / 2 some patches failed / 3 verify-failed-and-restored), so that scripts can react correctly.
31. As a user, I want confirmation prompts before writes, skippable with `-y`, so that I don't patch by accident — and so that CI can run unattended.
32. As a user, I want non-TTY invocations without `-y` refused, so that automation never hangs on a hidden prompt.
33. As a power user, I want `adhoc-patch --string/--regex` one-shot edits with occurrence indexing, so that I can fix things not covered by built-ins.
34. As a power user, I want `adhoc-patch --script` transforms sandboxed under Node's permission model, so that third-party scripts can't touch my disk or network.
35. As a power user, I want a diff preview before any adhoc write, so that I can see exactly what changes.
36. As a power user, I want adhoc writes rolled back if the bundle won't boot afterward, so that even no-backup edits fail safe.
37. As a developer on this project, I want all tests to run against synthetic hand-written fixtures, so that no proprietary Anysphere code ever enters the repo or CI.
38. As a developer, I want the test suite to refuse touching a real install when no explicit path is given, so that running tests can never damage my machine.
39. As a developer, I want anchors verified against the real bundle during development, so that the verified-version claim is grounded in fact.
40. As a user, I want the package to work on macOS and Linux with Node ≥ 20, so that I can use it on any of my machines.

## Implementation Decisions

- **Monorepo layout**: npm workspaces; single publishable package `tweakcursor`
  (ESM, `"type": "module"`, NodeNext resolution, strict TS, Node ≥ 20).
- **Module boundaries** (engine is UI-free; both CLI and TUI sit on top):
  - `engine/discovery` — installation model `{path, version, active}`; enumerates
    version dirs, detects active via the launcher symlink (realpath-compared for
    macOS `/var`→`/private/var`), explicit path wins, multi-install without active
    is a user error listing candidates.
  - `engine/backup` — first-apply snapshot into `{install}/.tweakcursor-backup/`
    with sha256 manifest; restore replays manifest. Restore-before-apply gives
    idempotent, non-additive applies.
  - `engine/patcher` — patch model `{id, description, files[{file, anchors[]}],
    verifiedVersions}`; anchors are `{kind: "string"|"regex", find, replace,
    index?}` with 1-based occurrence selection and `$N` group substitution.
    Atomic per patch: every anchor in every file must match and every modified
    file must pass the parse gate, or nothing is written; other patches proceed.
    Temp-file + rename writes; in-memory rollback on write failure.
  - `engine/parseGate` — `node --check` on candidate content before any write.
  - `engine/verify` — smoke test = boot `index.js --version` (bundled node when
    present); running-PID detection via `.running/{pid}` markers + `kill(pid, 0)`.
  - `engine/versionGate` — posture B: unverified version ⇒ loud per-patch warning,
    attempt regardless, failure stays isolated to that patch.
  - `engine/cliConfig` — merge-only read/write of `~/.cursor/cli-config.json`;
    official keys `disableAutoUpdate` / `channel: "static"` drive the update guard.
  - `config` — `~/.tweakcursor/config.json` (env `TWEAKCURSOR_CONFIG_DIR` →
    `~/.tweakcursor` → XDG); holds per-patch `{enabled, options}`,
    `changesApplied`, `installationPath`.
  - `patches/registry` — the five built-ins as data + build functions
    `(ctx {version, options}) => Patch`; `update-guard` bakes the install version
    into its startup warning; `themes` reads palette options with stock defaults.
  - `commands/*` — CLI verbs (apply/restore/listPatches/doctor) with exit codes
    0/1/2/3; `--patches` is a one-shot selection that never persists toggles.
  - `tui/*` — Ink 6 + React 19 wizard: InstallationPicker → MainMenu →
    PatchToggles / ThemeEditor (presets + custom hex) / UpdateGuardView →
    ApplyView (streaming) → ReportView. Engine stays UI-free.
  - `adhoc` — one-shot string/regex/script edits; scripts run as a child under
    Node's permission model (no fs-write/net/subprocess; read limited to
    script+input+runner, all realpath-resolved); diff preview + confirm; no
    backup, but rolled back if the boot smoke test fails.
- **Anchor contract** (decision-rich, verified 2026-10-29 against the real
  `2026.10.22-27dcf5f` bundle; each anchor's occurrence count confirmed unique
  where required):
  - third-party plugins: two filter sites `X.importThirdPartyPlugins||(` →
    force filter to always run; loader gate `a=s.importThirdPartyPlugins,` →
    `a=!1,`; headless wiring `he=h.enableMarketplacePlugins` → `he=!1`.
  - extensibility: `thirdPartyExtensibilityEnabled??!0` → `??!1`; executor
    getter `getThirdPartyExtensibilityEnabled:j=()=>!0` → `()=>!1`.
  - indicator: `.description("Cursor Agent")` (exactly 1 occurrence, `--help`
    display only; version sources untouched).
  - themes: the two `{addHex,removeHex}` diff tables (light + dark).
  - update guard: the `.disableAutoUpdate||"static"===X.channel||setTimeout`
    kickoff — warning injected via comma expression so condition truthiness is
    preserved.
- **Dropped after research**: system-prompt patching (prompts are server-supplied,
  nothing embedded to patch) and thinking-verbs customization (no wordlist exists
  in the bundle).
- **Legal posture**: patcher-only distribution; synthetic hand-written fixtures in
  repo; real-chunk fixtures only in gitignored `test/.local-fixtures/`; prominent
  non-affiliation/ToS disclaimer; no Anysphere strings in `dist/`.
- **Sandbox flag compatibility**: Node 20–22 spell `--experimental-permission`;
  23.5+ spell `--permission` — selected by runtime version.

## Testing Decisions

**What makes a good test here**: tests assert *external behavior* — exit codes,
stderr/stdout text, file contents on disk, terminal frames — never implementation
details. Internal helpers are only exercised where the behavior they produce
(failure isolation, rollback) cannot be observed otherwise.

**Seams** (confirmed 2026-10-30 — keep the existing set):

1. **Primary: the CLI subprocess** — spawn `dist/cli.js` against a copied
   synthetic fixture install with fully sandboxed env (`TWEAKCURSOR_INSTALL_PATH`,
   `TWEAKCURSOR_CONFIG_DIR`, `TWEAKCURSOR_CLI_CONFIG_PATH`, fake `HOME`). Assert
   exit codes, output, and resulting file state. A guard refuses to run against a
   real install when no explicit path is given under test.
2. **Secondary: the Ink App render seam** — `ink-testing-library` drives
   keystrokes through the real component tree and asserts on terminal frames and
   on-disk effects.
3. **Engine unit tests** — reserved for failure modes unreachable or impractical
   via the CLI seam: per-anchor failure reasons, multi-file atomicity, dry-run,
   backup manifest integrity, occurrence indexing, sandbox denial.

**Modules under test**: patcher (anchor semantics, atomicity, posture B), backup,
discovery, cliConfig, config, verify (smoke + PID liveness), the patch registry
(each built-in against the synthetic fixture + drifted-anchor failure cases),
adhoc (all three modes + sandbox write-denial), CLI surface, TUI flows.

**Prior art**: vitest throughout; fixture installs are tiny hand-written bundles
whose anchor strings mimic the real bundle's shapes; subprocess pattern via
`spawnSync` capturing both streams; `ink-testing-library` for frames.

## Out of Scope

- **Windows** — macOS + Linux plain-JS installs only (v1).
- **Auto-reapply hooks** (SessionStart-style) and verified-version update
  automation — post-v1 milestones.
- **Per-source granularity** (e.g., allow `.claude/` but not `.codex/`) — deferred;
  becomes moot if Cursor ships an official toggle.
- **Named Ink color theming** — v1 themes touch the diff hex tables only;
  documented limitation.
- **Publishing to npm / CI execution** — release assets (README, LICENSE,
  workflows, pack inspection, publish dry-run) are complete, but the actual
  publish, name squat, and remote CI runs await a git remote and explicit owner
  approval.
- **System-prompt / thinking-verb patches** — impossible as researched (see
  Implementation Decisions).

## Further Notes

- Anchor offsets from earlier research had drifted versus the shipped bundle; the
  registry now records anchors verified by occurrence-count against the live
  install. Re-verify on every new cursor-agent version and bump
  `verifiedVersions`.
- `--config-url` merge order (remote = defaults, local wins) matches tweakcc
  semantics and should not be flipped without a major version bump.
- The update-guard warning prints once per process start by design; a once-per-day
  stamp was considered and deferred as unnecessary for a CLI.
