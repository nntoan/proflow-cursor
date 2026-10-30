# tweakcursor — Execution Plan

**Companion to:** `docs/tweakcursor/SPEC.md` (v0.1)
**Mode:** planning only — no implementation authorized yet.

---

## Phase 0 — Research spikes (timeboxed: 5 working days)

Zero modifications to any Cursor installation; recon and feasibility only.

| Spike | Question | Method | Output |
|---|---|---|---|
| S1 Prompt assembly | How much of the system prompt is client-side? | Trace prompt construction in bundles; intercept outbound request payload (debug proxy) | F7 verdict: customizable / read-only viewer / cut |
| S2 Theme & verbs | Where are colors, spinners, thinking verbs defined? | String-table search in TUI chunk (React/Ink confirmed) | F8 verdict + candidate patch points |
| S3 Flag catalog | Full list of `QF("...")` runtime flags + defaults | Static extraction across chunks | `flags.json` seed for F6 |
| S4 Platform matrix | Do needles hold on darwin-x64, linux-x64/arm64? | Download/compare bundles per platform; hash variance report | Registry multi-platform schema |
| S5 Install variants | npm-installed cursor-agent? homebrew? paths? | Survey + docs review | Detector requirements |
| S6 Server re-enforcement | Which capability toggles does the server override? | Apply toggles in a throwaway env, observe API behavior | Honest labeling per F5 flag |

**Exit gate:** feasibility matrix reviewed; F7/F8 scoped (full / viewer / cut).

## Phase 1 — Core engine (no TUI)

Milestone: `tweakcursor apply/restore/status/doctor` working on 2 cursor-agent
versions (current + one prior, if obtainable).

1. Repo scaffold: pnpm + TypeScript + vitest; npm pkg skeleton with `bin`.
2. `detector` — symlink resolution, versions enumeration, platform/channel.
3. `backups` + `patcher` — transaction model per SPEC §6 (one backup per file
   per txn, content-addressed, anchor-based state detection, auto-rollback).
   **Unit tests must include the two failure modes from the 2026-10-29 PoC:**
   two patches sharing one file; `replace`-string appearing in unrelated scopes.
4. `verifier` — `node --check` + boot-smoke helper.
5. `registry` + built-in defs for F1–F5 (Tier A) against 2026.10.22.
6. `configmgr` (F9) — schema-aware `cli-config.json` editor, dry-run by default.
7. CI: lint/typecheck/unit; bundle-fixture tests with **synthetic** webpack
   chunks (never commit Cursor code — legal, SPEC §9).

## Phase 2 — TUI (Ink)

Milestone: `npx tweakcursor` full interactive loop.

1. Dashboard + feature toggles w/ risk badges (SPEC §8 screens 1–2).
2. Diff preview (screen 3). 3. Backups/transactions browser (screen 4).
4. Flag explorer consuming S3 catalog (screen 5).
5. Update flow: new-version detection → needle validation → reapply prompt (screen 6, F10).
6. Non-interactive parity: every TUI action has a CLI flag equivalent (CI-friendly).

## Phase 3 — Tier B features (per Phase 0 verdicts)

1. F7 prompts (scope per S1). 2. F8 themes/verbs (scope per S2).
3. F11 adhoc patches — sandboxed script API: `{ find, replace, expectCount, fileGrep }`; no fs/net; dry-run mandatory.
4. F12 remote config — URL-fetched tweak profiles, consent prompt, signature allowlist.

## Phase 4 — Hardening & 1.0

1. Release-tracker CI: poll Cursor versions, download, validate all needles,
   open issue/PR on drift.
2. e2e matrix (macOS arm64/x64, linux x64) in disposable envs.
3. Docs: usage, patch-authoring guide, safety model, disclaimer.
4. npm 1.0 with provenance; security policy; CoC.

## Cross-cutting

- **Testing:** synthetic fixtures for unit/e2e; real bundles only in CI runners
  (license-permitting) or local dev, never in repo.
- **Versioning:** semver; patch defs versioned independently via
  `known-versions.json` (opt-in remote refresh).
- **Comms:** each phase ends with demo + updated feasibility/risk sections in SPEC.

## Effort sketch (1 eng, indicative)

| Phase | Estimate |
|---|---|
| 0 Spikes | 5 d |
| 1 Core | 8–10 d |
| 2 TUI | 6–8 d |
| 3 Tier B | 5–10 d (S1/S2 dependent) |
| 4 Hardening | 5 d + ongoing release tracking |

## First actions when authorized

1. Scaffold repo + npm name check (`tweakcursor`).
2. Land transaction engine with the two PoC failure-mode tests first (TDD).
3. Register F1–F5 defs; `apply --dry-run` demo on 2026.10.22-27dcf5f.
