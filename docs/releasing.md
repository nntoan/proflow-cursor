# Releasing a package from `packages/` — deployment checklist

Runbook for the **initial release** of any workspace package to npm. Follow top to
bottom; check boxes in a tracking issue or the release notes. For subsequent
releases of an already-published package, skip to [Phase C](#phase-c--ship).

Current state of this repo: fully operational. `nntoan/proflow-cursor` (public),
trusted publisher working (0.1.1 published over OIDC with provenance),
`tweakcursor` live on npm (0.1.0, 0.1.1), GitHub releases `v0.1.0` and `v0.1.1`
created with generated notes. For the next release go straight to
[Phase C](#phase-c--ship).

---

## Phase 0 — one-time repo setup

- [x] **Create the git remote** and push `main` — done: `nntoan/proflow-cursor`
      (public).
- [x] **Configure the npm trusted publisher** (OIDC — there is deliberately no
      `NPM_TOKEN` in this repo) — done; proven by the 0.1.1 CI publish with
      sigstore provenance. For future packages, on npmjs.com: package →
      Settings → **Trusted publishing** → GitHub Actions:

  | Field | Value |
  | --- | --- |
  | Organization or user | `nntoan` |
  | Repository | `proflow-cursor` |
  | Workflow filename | `release.yml` (filename only; must exist in `.github/workflows/`) |
  | Allowed actions | tick **Allow npm publish** |

  Two things to know: since 2026-09-03 new trusted-publisher configs are created
  **stage-only** unless *Allow npm publish* is ticked (unticked → `ENEEDAUTH` at
  publish time), and a config **cannot be edited** after creation — delete and
  re-add to change it. All fields are case-sensitive and unvalidated at save.
- [ ] **Protect `main`** (optional but recommended): require the `ci` matrix
      (macOS/Linux × Node 20/22/24) before merge.

## Phase A — package readiness

Run for the package being released (`{pkg}` = workspace name, e.g. `tweakcursor`).

- [ ] **Name is available** (record the check date — names get squatted):
  ```bash
  npm view {pkg}          # 404 = free
  ```
- [ ] **`package.json` is publish-complete**:
  - `name`, `version` (`0.1.0` for initial), `description`, `license`
  - `repository` with `directory: "packages/{pkg}"` (monorepo requirement)
  - `keywords`, `engines.node`
  - `bin` → `dist/...` with a `#!/usr/bin/env node` first line (CLIs)
  - `files` whitelist (`["dist"]`) — **never** rely on `.npmignore` alone
  - `publishConfig.access` (`public` unless deliberately scoped-private)
- [ ] **LICENSE and README exist** at the package root (npm includes them
      automatically). README carries any project-required disclaimer.
- [ ] **Green locally, in order**:
  ```bash
  npm ci
  npm run typecheck -w {pkg}
  npm run build -w {pkg}
  npm test -w {pkg}
  ```
- [ ] **Tarball audit** — this is the artifact users get; inspect it:
  ```bash
  npm pack -w {pkg}
  tar -tzf {pkg}-*.tgz    # expect: dist/, package.json, README.md, LICENSE only
  ```
  Then grep the payload for anything that must never ship (secrets, fixtures,
  upstream/proprietary code — see project appendix).
- [ ] **Install smoke from the tarball** (proves `bin`, deps, and `files`):
  ```bash
  npm i -g --prefix "$(mktemp -d)" ./{pkg}-*.tgz
  {prefix}/bin/{pkg} --help    # exit 0
  ```
- [ ] **Publish dry-run**:
  ```bash
  npm publish -w {pkg} --dry-run
  ```

## Phase B — name protection (new names, recommended)

- [x] **Squat early** — done 2026-10-30: `tweakcursor` published by hand
      (`0.0.0-stage`, then `0.1.0`; maintainer `nntoan`). The package page now
      exists, so the OIDC trusted publisher can be configured.
- [ ] If using OIDC: finish trusted-publisher setup on the package page now
      (Phase 0 table). Note: tagging `v0.1.0` later is safe — the workflow will
      create the GitHub release and notes, and skip the already-published
      `0.1.0` on npm.

## Phase C — ship

- [ ] **CI green on `main`** (push/PR first; `gh run watch`).
- [ ] **Preview the release notes** — generated from the conventional commits
      since the previous tag (no previous tag → everything up to the release):
  ```bash
  node scripts/changelog.mjs --to HEAD
  ```
- [ ] **Bump and tag** — the tag MUST equal `packages/{pkg}/package.json`
      `version`; a mismatch creates the GitHub release but skips publishing
      (that path exists for retroactive tags). Convention here: `v{version}`
      while one package exists; switch to `{pkg}@{version}` tags when a second
      package ships (and update `release.yml` accordingly):
  ```bash
  npm version 0.1.0 -w {pkg} --no-git-tag-version
  git add -A && git commit -m "chore(release): 0.1.0"
  git tag -a v0.1.0 -m "{pkg} 0.1.0"
  git push origin main --follow-tags
  ```
- [ ] **Release workflow runs both jobs** — `release` (generated notes + GitHub
      release), then `publish` (npm over OIDC, only when the tag matches the
      version; `--provenance` is passed explicitly so a release **fails** rather
      than ship unsigned):
  ```bash
  gh run watch               # release.yml
  ```
- [ ] **Verify the registry artifact** in a clean environment:
  ```bash
  npm view {pkg}             # version, provenance badge fields
  npm i -g --prefix "$(mktemp -d)" {pkg}@{version}
  {prefix}/bin/{pkg} --version
  ```

## Phase D — after

- [ ] The GitHub release is auto-created with generated notes; record any
      curated deep-dive in `docs/releases/v{version}.md` (see `v0.1.0.md`).
- [ ] Close/label the tracking issue; note follow-ups for the next milestone.

## Troubleshooting

- **Retroactive tag on a pre-mechanism tree**: a tag push runs the workflow
  file *from the tagged commit*. Tagging a commit older than the two-job
  `release.yml` executes whatever release workflow that tree contains (the old
  one fails with "cannot publish over the previously published versions" and
  creates no GitHub release). The tag itself is still correct — create the
  GitHub release by hand:
  ```bash
  node scripts/changelog.mjs --to v{version} --output /tmp/notes.md
  gh release create v{version} --title "v{version}" --notes-file /tmp/notes.md --verify-tag
  ```
- **`npm view` 404 right after a CI publish**: the registry accepted the
  tarball (`+ {pkg}@{version}` in the publish log) but post-publish processing
  holds it for minutes, and the CDN caches the early miss. Rule out a
  stage-only trusted publisher with `npm stage list {pkg}` — empty means it is
  just processing.

## Kill switch

- **`npm unpublish {pkg}@{version}`** works within 72 hours of publish, only if no
  one depends on it — prefer a fast patch release + `npm deprecate` for anything
  older or downloaded:
  ```bash
  npm deprecate {pkg}@{version} "broken; use {other-version}"
  ```

---

## Appendix — tweakcursor-specific gates (do not skip)

This package patches a proprietary binary; the legal posture is part of the
release gate:

- [ ] `! grep -rq "Anysphere" packages/tweakcursor/dist/` — no upstream strings in
      the artifact
- [ ] `grep -q "not affiliated" packages/tweakcursor/README.md` — disclaimer
      present
- [ ] Fixtures are synthetic and tiny (`du -sh test/fixtures/*` ≈ KBs);
      `test/.local-fixtures/` is gitignored and untracked
- [ ] Anchor verification re-run against the current cursor-agent install and
      `verifiedVersions` bumped if anchors drifted
