# Releasing a package from `packages/` — deployment checklist

Runbook for the **initial release** of any workspace package to npm. Follow top to
bottom; check boxes in a tracking issue or the release notes. For subsequent
releases of an already-published package, skip to [Phase C](#phase-c--ship).

Current state of this repo: CI (`.github/workflows/ci.yml`) and a tag-triggered
OIDC release workflow (`.github/workflows/release.yml`) exist but have never run —
**there is no git remote yet**. Phase 0 is therefore mandatory here.

---

## Phase 0 — one-time repo setup

- [ ] **Create the git remote** and push `main` (workflows, provenance, and the
      `repository` field all depend on it):
  ```bash
  gh repo create {org}/{repo} --private --source . --push   # or --public
  ```
- [ ] **Decide npm auth** (pick one):
  - **OIDC trusted publisher (recommended)** — no long-lived token. On npmjs.com:
    package → Settings → Trusted Publisher → GitHub Actions → repo +
    `.github/workflows/release.yml`. Requires one manual first publish to create
    the package (see Phase B), then provenance publishes work tokenlessly.
  - **NPM_TOKEN secret** — granular access token (automation, 2FA-bypass) stored
    as the `NPM_TOKEN` repo secret; the release workflow picks it up via
    `registry-url`.
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

- [ ] **Squat early**: publish a minimal `0.0.1` as soon as the name check passes,
      before the full release is ready. This also creates the npm package page so
      the OIDC trusted publisher can be configured.
- [ ] If using OIDC: finish trusted-publisher setup on the new package page now.

## Phase C — ship

- [ ] **CI green on `main`** (push/PR first; `gh run watch`).
- [ ] **Bump the version** in `packages/{pkg}/package.json` (semver; initial
      release stays `0.1.0` unless a `0.0.x` squat exists — then `0.1.0` anyway).
- [ ] **Commit and tag.** Convention here: `v{version}` while one package exists;
      switch to `{pkg}@{version}` tags when a second package ships (and update
      `release.yml`'s `on.push.tags` and `-w {pkg}` target accordingly — it is
      currently wired for `tweakcursor` only):
  ```bash
  git add -A && git commit -m "release: {pkg} v0.1.0"
  git tag v0.1.0 && git push origin main --tags
  ```
- [ ] **Release workflow publishes** (`npm publish --provenance`):
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

- [ ] Record release notes in `docs/releases/v{version}.md` (see `v0.1.0.md`).
- [ ] Close/label the tracking issue; note follow-ups for the next milestone.

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
