# tweakcursor — Product & Technical Specification

**Status:** Draft v0.1 · 2026-10-29 · Pre-implementation
**Distribution:** `npx tweakcursor` (public npm, public GitHub repo — TBD)
**Inspiration / parity target:** [tweakcc](https://github.com/Piebald-AI/tweakcc) (Piebald-AI)
**Locked decisions:** v1 scope = full catalog (spike risk accepted) · TUI = Ink (React) · spec/plan live in proflow-cursor `docs/`

---

## 1. Product definition

A command-line tool that customizes the **Cursor Agent CLI** (`cursor-agent`) beyond
what Cursor exposes — shipped as an npx package with an interactive Ink-based TUI,
version-aware binary patching, transactional safety, and one-command restore.

tweakcc proved the demand and the mechanics for Claude Code. cursor-agent is a
strictly better target technically (§3), and has no equivalent tool today.

**Non-goals for v1:** patching the Cursor desktop/Electron app (asar), modifying
Cursor's first-party plugin marketplace behavior, anything requiring redistribution
of Cursor code.

## 2. Users & top use cases

| User | Use case |
|---|---|
| Poly-tool power user | Disable Claude Code / Codex / Grok imports from Cursor CLI (`/ask`, `~/.claude/skills`, `.claude/agents`) without affecting those tools |
| Privacy-conscious dev | Kill telemetry, control attribution, sandbox defaults |
| Customizer | Themes, thinking verbs, spinner styles, input styling |
| Prompt engineer | Inspect/customize system prompts (client-side portion) |
| Feature hunter | Flip runtime feature flags, unlock capabilities (max mode, usage, web tools) |
| Team lead | Apply a shared tweak config across machines (remote config) |

## 3. Feasibility evidence (recon on 2026.10.22-27dcf5f, darwin-arm64)

Established, not speculative:

- The CLI is **plain webpack JS bundles** (`index.js` 7.7M + ~80 `*.index.js`
  chunks) executed by a bundled Node via a bash launcher:
  `"$SCRIPT_DIR/node" "$SCRIPT_DIR/index.js" "$@"`.
  No SEA repack step (the `cursor-agent-sea` binary exists but is not the launch
  path), no signature enforcement on JS. Patching = string replacement.
- `NODE_COMPILE_CACHE` auto-invalidates on source change — no stale-cache step.
- Auto-update installs into a **new** `~/.local/share/cursor-agent/versions/<ver>/`
  dir and re-points `~/.local/bin/cursor-agent` (symlink). Patches die on update,
  cleanly and predictably. Version detection = one `realpath`.
- Boot-smoke-test is scriptable: `cursor-agent -p "<ping>" --output-format text -f`.

### Proven patch points (all verified unique in 2026.10.22)

| # | Feature | File | Anchor (abbrev.) | Effect |
|---|---|---|---|---|
| P1 | Master third-party extensibility switch | `3863.index.js` | `L.span.end()})),R=()=>!0,j=(0,` | `getThirdPartyExtensibilityEnabled` for bootstrap: gates `.claude/.codex/.grok` skill roots, `.claude/agents` subagents, third-party nested rules |
| P2 | Claude plugin imports | `3863.index.js` | `sparsePluginClones:!0}),he=h.enableMarketplacePlugins,ge=` | `importThirdPartyPlugins=false` → filters `identifier.source==="claude-plugin"`; Cursor first-party plugins (marketplace, team) unaffected (separate flag `enableFirstPartyPlugins`) |
| P3 | Slash-command loader default | `5622.index.js` | `thirdPartyExtensibilityEnabled??!0}async loadCommands` | TUI `/` list stops scanning `~/.claude/commands`, `~/.claude/skills` |
| P4 | Capability toggles | `3863.index.js` | `local-agent-profile.ts` capabilities const | Compile-time flags: `enableCursorTelemetry`, `enableMaxMode`, `enableUsageCommand`, `enableWebTools`, `enableGenerateImage`, `enableMcp`, `enableTeamHooks`, `enableManagedSkillsSync` |
| P5 | Runtime feature flags | multiple | `QF("<flag>")` call sites | e.g. `"browser_canvas"`, `"subagents_discovery_allow_external_symlinks"` |

### Known internal structures (for registry authors)

- Command scan list (`5622.index.js` `loadCommands`): team commands → global →
  `<ws>/.claude/commands` → `<ws>/.cursor/commands` → `~/.claude/commands` →
  `~/.cursor/commands` → plugin skills. Non-recursive, `*.md` only.
- Plugin loading (`LocalPluginsService.load` in `index.js`): `getSettings()` →
  `{importThirdPartyPlugins, loadUserLocalPlugins, loadCursorFirstParty}`;
  Claude import reads `~/.claude/settings.json` `enabledPlugins` +
  `~/.claude/plugins/installed_plugins.json`, merged with per-workspace
  `.claude/settings{,.local}.json` (workspace `false` wins).
- CLI config schema (zod, in `index.js`): governs `~/.cursor/cli-config.json` —
  `approvalMode`, `display.mode`, `sandbox`, `steering`, `rewind`, `attribution`,
  `autoAcceptWebSearch`, … (drives the zero-risk Config Manager, §4 F9).

## 4. Feature catalog (v1 = full)

| ID | Feature | Tier | Mechanism | Risk |
|---|---|---|---|---|
| F1 | Disable third-party extensibility | A-proven | P1 | Low |
| F2 | Disable Claude plugin imports | A-proven | P2 | Low |
| F3 | Slash-list scrub of `~/.claude/*` | A-proven | P3 (subsumed by F1 in effect; keep as separate toggle for ACP-only users) | Low |
| F4 | Telemetry off | A | P4 `enableCursorTelemetry` | Low |
| F5 | Capability toggles (max mode, usage, web tools, generate image, MCP, team hooks) | A | P4 per-flag | Med — server may re-deny; label "best effort" |
| F6 | Runtime flag explorer/flipper | A | P5 catalog | Med |
| F7 | System prompt view/customize | B-spike | locate client-side prompt assembly; server-delivered portions read-only | High — may be mostly server-side |
| F8 | TUI themes, thinking verbs, spinners, input styling | B-spike | locate style/verb tables in TUI chunk (React/Ink internals confirmed present) | Med |
| F9 | Config manager (approvalMode, display, sandbox, attribution, steering, rewind…) | A | Structured editor for `~/.cursor/cli-config.json` — **no binary patch** | None |
| F10 | Update resilience: detect new version, hash-check, reapply, refuse-unknown | A | registry + watcher | — |
| F11 | Adhoc patches (sandboxed user scripts) | B | vm2-style sandbox over a constrained API (`find/replace/verify`) | Med |
| F12 | Remote config / shared tweak profiles | B | fetch JSON from URL, explicit consent prompt | Med |

## 5. Architecture

```
tweakcursor (npm pkg, Node ≥ 18, bin "tweakcursor")
├─ core/
│  ├─ detector.ts      # active version via realpath(~/.local/bin/cursor-agent);
│  │                   # enumerate versions/; channel & platform detection
│  ├─ registry.ts      # patch defs keyed by (version, file, sha256)
│  ├─ patcher.ts       # transactional engine (§6)
│  ├─ verifier.ts      # node --check → optional boot smoke → auto-rollback
│  ├─ configmgr.ts     # schema-aware cli-config.json editor (F9)
│  ├─ backups.ts       # content-addressed store
│  └─ knownversions.ts # local index + opt-in remote refresh
├─ tui/                # Ink (React): dashboard, toggles, diff preview,
│                      # backups browser, flag explorer, update flow
├─ cli.ts              # non-interactive: apply|restore|status|doctor|smoke
├─ patches/*.patch.json
└─ known-versions.json
```

### Patch definition schema

```json
{
  "id": "disable-3p-extensibility",
  "feature": "F1",
  "targets": [{
    "file": "3863.index.js",
    "sha256": "<file hash>",
    "anchor": "L.span.end()})),R=()=>!0,j=(0,",
    "find": "R=()=>!0",
    "replace": "R=()=>!1",
    "occurrences": 1
  }],
  "appliesTo": ["2026.10.22-27dcf5f"],
  "risk": "low",
  "description": "Disable .claude/.codex/.grok skills, subagents, nested rules"
}
```

Rules: `anchor` must be present and `find` must occur exactly `occurrences`
times **within/after the anchor context**; unknown file hash ⇒ refuse unless
`--force`; no blind global string replaces.

## 6. Transaction & safety model (hard requirements)

Lessons from the 2026-10-29 proof-of-concept failure are normative:

1. **One backup per file per transaction**, taken before the first write to that
   file, and **never overwritten** by subsequent patches in the same run.
   (The PoC snapshotted state once for all patches; two patches sharing
   `3863.index.js` caused the second to overwrite the pristine backup with a
   patched copy, silently surviving "restore".)
2. Backups are **content-addressed**: `~/.tweakcursor/backups/<version>/<file>.<sha256>`.
   Restore verifies the backup hash before writing.
3. **Applied-state detection uses `anchor`+`find` presence — never
   `replace`-string presence.** (Minified names recur across modules; the PoC's
   status check false-positived on `R=()=>!1` in an unrelated scope.)
4. Apply pipeline per transaction: preflight (hashes, anchors) → backup →
   write → `node --check` each touched file → optional `--smoke` boot test →
   commit transaction log → on ANY failure, auto-rollback and report.
5. Every write is previewable (`--dry-run` diff) and logged
   (`~/.tweakcursor/transactions.log`, append-only).

## 7. CLI surface

```
tweakcursor                 # TUI
tweakcursor status|doctor   # installation + patch state, integrity checks
tweakcursor apply [ids...]  # [--dry-run] [--smoke] [--force]
tweakcursor restore [--all]
tweakcursor flags list|set  # F6
tweakcursor config get|set  # F9 (cli-config.json)
tweakcursor backup list|restore <id>
```

## 8. TUI surface (Ink)

1. **Dashboard** — version, patch state per feature, update-available banner.
2. **Feature toggles** — grouped (Privacy / Capabilities / Appearance / Prompts /
   Advanced), risk badges, description panel.
3. **Diff preview** — anchored before/after per patch.
4. **Backups & transactions** — browse, restore point-in-time.
5. **Flag explorer** — searchable `QF("...")` catalog with flip actions.
6. **Update flow** — on new cursor-agent version: what changed, reapply prompt.

## 9. Distribution & legal posture

- Ship **patch instructions only** (anchors + find/replace + hashes). Never ship
  Cursor code, bundle excerpts beyond minimal anchors, or license keys.
- Public repo + npm with provenance; no telemetry in v1; remote
  known-versions/config fetch is explicit opt-in.
- Prominent disclaimer: unofficial, may violate Cursor ToS, use at own risk.
  Same posture tweakcc takes re: Anthropic.

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Minification churn breaks needles on each release | High | Hash index, contextual anchors, refuse-unknown, CI release tracker |
| Server-side enforcement makes toggles cosmetic | Med | Honest labeling ("best effort, server may deny"); smoke tests |
| Maintenance treadmill vs Cursor cadence | Med | CI auto-validates needles on new releases; community patch defs |
| ToS exposure for users | Med | Disclaimer; no redistribution; patches are user-local |
| Supply-chain trust (we patch a security-sensitive binary) | Med | Transparent defs, dry-run diffs, signed npm provenance, no remote exec without consent |
| F7/F8 spikes fail (prompts/themes not client-patchable) | Med | Accepted for v1; de-scope to read-only viewers if so |

## 11. Open questions

- Repo host/org and package name availability (`tweakcursor` on npm).
- Whether to support the npm-installed variant of cursor-agent (if one exists)
  in v1 or native-installer only.
- Windows support timing (paths differ; recon was macOS-only).
