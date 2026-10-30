import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Anchor, DiffHunk, FileChange, Patch, PerPatchReport } from "../types.js";
import type { Installation } from "./discovery.js";
import { parseGate } from "./parseGate.js";
import { isVerified } from "./versionGate.js";

interface MatchRange {
  start: number;
  end: number;
  replacement: string;
}

/** File pattern meaning "every top-level .js file in the install dir". */
export const SCAN_FILTER_WILDCARD = "*.js";

/**
 * Scan-list literals name the skill/plugin dirs the CLI scans at startup.
 * Webpack duplicates the same literal into the main bundle (tuple form:
 * [".x","sub"],...) and hash-named chunks (path-string form: ".x/sub/",...),
 * so detection is by SHAPE — never by file name, and never by the names of
 * the third-party dirs being filtered out.
 *
 * Safety gate: a candidate run only counts as a scan list when it contains at
 * least one first-party (.cursor) entry, so lookalike arrays stay untouched.
 */
const FIRST_PARTY_ROOT = ".cursor";
const TUPLE_RUN = /(?:\["\.[^"\s]+","[^"]*"\],?){2,}/g;
const TUPLE_ENTRY = /\["(\.[^"\s]+)","[^"]*"\]/g;
const PATH_RUN = /(?:"\.[^"\s/]+\/[^"]*",?){2,}/g;
const PATH_ENTRY = /"(\.[^"\s/]+)\/[^"]*"/g;

interface ScanRun {
  start: number;
  end: number;
  text: string;
  entryRe: RegExp;
}

/** All candidate scan-list runs in both serializations, overlaps dropped. */
function findScanRuns(content: string): ScanRun[] {
  const runs: ScanRun[] = [];
  for (const [runRe, entryRe] of [
    [TUPLE_RUN, TUPLE_ENTRY],
    [PATH_RUN, PATH_ENTRY],
  ] as const) {
    for (const m of content.matchAll(runRe)) {
      runs.push({ start: m.index, end: m.index + m[0].length, text: m[0], entryRe });
    }
  }
  // The two shapes are disjoint in practice; if they ever overlap, the
  // earlier-starting (then longer) run wins deterministically.
  runs.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: ScanRun[] = [];
  let lastEnd = -1;
  for (const r of runs) {
    if (r.start < lastEnd) continue;
    out.push(r);
    lastEnd = r.end;
  }
  return out;
}

/**
 * Ranges that filter every scan-list literal in content down to the keep set.
 * `detections` counts literals found (first-party gated) even when they are
 * already filtered — that is what makes re-apply an idempotent no-op success
 * instead of a "not found" failure.
 */
function scanListFilterRanges(
  content: string,
  keep: string[],
): { ranges: MatchRange[]; detections: number } {
  const ranges: MatchRange[] = [];
  let detections = 0;
  for (const run of findScanRuns(content)) {
    const entries = Array.from(run.text.matchAll(run.entryRe));
    if (!entries.some((e) => e[1] === FIRST_PARTY_ROOT)) continue;
    detections++;
    const kept = entries.filter((e) => keep.includes(e[1] as string));
    const replacement = kept.map((e) => e[0]).join(",");
    if (replacement === run.text) continue; // already filtered
    ranges.push({ start: run.start, end: run.end, replacement });
  }
  return { ranges, detections };
}

/** Top-level .js files in the install dir (webpack chunks included), sorted. */
function listTopLevelJs(installPath: string): string[] {
  try {
    return readdirSync(installPath, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".js"))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Resolves patch file entries to concrete relative paths (wildcards expanded).
 * Unsupported wildcards are skipped here — applyPatches fails them loudly.
 */
export function resolvePatchFiles(install: Installation, patches: Patch[]): string[] {
  const out = new Set<string>();
  for (const p of patches) {
    for (const f of p.files) {
      if (f.file === SCAN_FILTER_WILDCARD) {
        for (const rel of listTopLevelJs(install.path)) out.add(rel);
      } else if (!f.file.includes("*")) {
        out.add(f.file);
      }
    }
  }
  return [...out];
}

function findStringPositions(content: string, find: string): number[] {
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const i = content.indexOf(find, from);
    if (i === -1) break;
    positions.push(i);
    from = i + find.length;
  }
  return positions;
}

function substituteDollars(replacement: string, match: RegExpMatchArray): string {
  return replacement.replace(/\$(\d+)/g, (whole, n: string) => {
    const group = match[Number(n)];
    return group === undefined ? whole : group;
  });
}

/** Returns ranges, or a failure reason string. */
function anchorRanges(content: string, anchor: Anchor): MatchRange[] | string {
  if (anchor.kind === "scan-list-filter") {
    const { ranges, detections } = scanListFilterRanges(content, anchor.keep);
    // Zero detections means upstream restructured the literal — fail loudly
    // rather than "succeed" while leaving the live copy untouched.
    if (detections === 0) return "no scan-list literal found";
    return ranges;
  }
  if (anchor.kind === "string") {
    const positions = findStringPositions(content, anchor.find);
    if (positions.length === 0) {
      return `no occurrence of string anchor (${anchor.find.length} chars)`;
    }
    if (anchor.index !== undefined) {
      const p = positions[anchor.index - 1];
      if (p === undefined) {
        return `occurrence #${anchor.index} not found (have ${positions.length})`;
      }
      return [{ start: p, end: p + anchor.find.length, replacement: anchor.replace }];
    }
    return positions.map((p) => ({
      start: p,
      end: p + anchor.find.length,
      replacement: anchor.replace,
    }));
  }
  const flags = anchor.find.flags.includes("g") ? anchor.find.flags : `${anchor.find.flags}g`;
  const re = new RegExp(anchor.find.source, flags);
  const matches = Array.from(content.matchAll(re));
  if (matches.length === 0) return `no match for /${anchor.find.source}/`;
  if (anchor.index !== undefined) {
    const m = matches[anchor.index - 1];
    if (!m) return `occurrence #${anchor.index} not found (have ${matches.length})`;
    return [
      {
        start: m.index,
        end: m.index + m[0].length,
        replacement: substituteDollars(anchor.replace, m),
      },
    ];
  }
  return matches.map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    replacement: substituteDollars(anchor.replace, m),
  }));
}

/** Applies ranges back-to-front so earlier offsets stay valid. */
function applyRanges(content: string, ranges: MatchRange[]): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let out = content;
  for (const r of sorted) out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  return out;
}

export interface ApplyOptions {
  /** Compute reports without writing. */
  dryRun?: boolean;
  /** Skip the parse gate (default: gate on). */
  skipGate?: boolean;
}

export type AnchorApplyResult = { content: string; hunks: DiffHunk[] } | { error: string };

/** Applies one anchor to content in memory (used by adhoc-patch). */
export function applySingleAnchor(content: string, anchor: Anchor): AnchorApplyResult {
  const ranges = anchorRanges(content, anchor);
  if (typeof ranges === "string") return { error: ranges };
  const hunks: DiffHunk[] = ranges.map((r) => ({
    offset: r.start,
    before: content.slice(r.start, r.end),
    after: r.replacement,
  }));
  return { content: applyRanges(content, ranges), hunks };
}

/**
 * Applies patches atomically per patch: every anchor in every file must match,
 * and every modified file must pass the parse gate, or the patch is FAILED and
 * no file is written. Other patches proceed (posture B).
 */
export function applyPatches(
  install: Installation,
  patches: Patch[],
  opts: ApplyOptions = {},
): PerPatchReport[] {
  const reports: PerPatchReport[] = [];
  const installRoot = path.resolve(install.path) + path.sep;

  for (const patch of patches) {
    const verified = isVerified(patch, install.version);
    const originals = new Map<string, string>();
    const modified = new Map<string, string>();
    const changes: FileChange[] = [];
    let failure: { file: string; reason: string } | null = null;

    // Wildcard validation: only "*.js", and only with scan-list-filter anchors.
    for (const fp of patch.files) {
      if (!fp.file.includes("*")) continue;
      if (fp.file !== SCAN_FILTER_WILDCARD) {
        failure = { file: fp.file, reason: `unsupported file wildcard (only "${SCAN_FILTER_WILDCARD}")` };
        break;
      }
      if (fp.anchors.some((a) => a.kind !== "scan-list-filter")) {
        failure = {
          file: fp.file,
          reason: `"${SCAN_FILTER_WILDCARD}" files accept only scan-list-filter anchors`,
        };
        break;
      }
    }

    const hasWildcard = patch.files.some((fp) => fp.file === SCAN_FILTER_WILDCARD);
    let wildcardDetections = 0;

    for (const fp of patch.files) {
      if (failure) break;
      const wildcard = fp.file === SCAN_FILTER_WILDCARD;
      const relFiles = wildcard ? listTopLevelJs(install.path) : [fp.file];
      if (wildcard && relFiles.length === 0) {
        failure = { file: fp.file, reason: "no .js files in install dir" };
        break;
      }
      for (const rel of relFiles) {
        const abs = path.resolve(install.path, rel);
        if (!abs.startsWith(installRoot)) {
          failure = { file: rel, reason: "path escapes install dir" };
          break;
        }
        if (!existsSync(abs)) {
          failure = { file: rel, reason: "file not found" };
          break;
        }
        const disk = readFileSync(abs, "utf8");
        if (!originals.has(rel)) originals.set(rel, disk);
        // A file may be targeted by both an explicit entry and the wildcard:
        // writes happen only at the end of the patch, so continue from the
        // in-memory result of earlier anchors, not from pristine disk bytes.
        const content = modified.get(rel) ?? disk;
        let current = content;
        const hunks: DiffHunk[] = [];
        for (const anchor of fp.anchors) {
          const ranges = anchorRanges(current, anchor);
          if (typeof ranges === "string") {
            // Under a wildcard, most files contain no scan list — that is
            // expected, not a failure. The patch-level check below fails the
            // patch when NO file yielded a detection.
            if (wildcard && anchor.kind === "scan-list-filter") continue;
            failure = { file: rel, reason: ranges };
            break;
          }
          if (anchor.kind === "scan-list-filter") wildcardDetections++;
          for (const r of ranges) {
            hunks.push({ offset: r.start, before: current.slice(r.start, r.end), after: r.replacement });
          }
          current = applyRanges(current, ranges);
        }
        if (failure) break;
        if (current !== content) {
          modified.set(rel, current);
          const existing = changes.find((c) => c.file === rel);
          if (existing) existing.hunks.push(...hunks);
          else changes.push({ file: rel, hunks });
        }
      }
      if (failure) break;
    }

    // A scan-list filter that matched NOTHING in the whole bundle means
    // upstream restructured the literal — fail loudly, never silently pass.
    if (!failure && hasWildcard && wildcardDetections === 0) {
      failure = {
        file: SCAN_FILTER_WILDCARD,
        reason: "no scan-list literal found in any bundle file",
      };
    }

    if (!failure && !opts.skipGate) {
      for (const [file, content] of modified) {
        const gate = parseGate(content);
        if (!gate.ok) {
          failure = { file, reason: `parse gate rejected: ${gate.error ?? "invalid JS"}` };
          break;
        }
      }
    }

    if (!failure && !opts.dryRun) {
      const written: string[] = [];
      try {
        for (const [file, content] of modified) {
          const abs = path.resolve(install.path, file);
          const tmp = `${abs}.tweakcursor-tmp`;
          writeFileSync(tmp, content, "utf8");
          renameSync(tmp, abs);
          written.push(file);
        }
      } catch (err) {
        const rollbackErrors: string[] = [];
        for (const file of written) {
          const original = originals.get(file);
          if (original === undefined) continue;
          try {
            writeFileSync(path.resolve(install.path, file), original, "utf8");
          } catch (rbErr) {
            rollbackErrors.push(`${file}: ${String(rbErr)}`);
          }
        }
        failure = {
          file: written[written.length - 1] ?? patch.files[0]?.file ?? "",
          reason:
            `write failed: ${String(err)}` +
            (rollbackErrors.length > 0 ? `; ROLLBACK FAILED: ${rollbackErrors.join("; ")}` : ""),
        };
      }
    }

    reports.push(
      failure
        ? { id: patch.id, status: "failed", verified, failures: [failure], changes: [] }
        : { id: patch.id, status: "applied", verified, failures: [], changes },
    );
  }
  return reports;
}
