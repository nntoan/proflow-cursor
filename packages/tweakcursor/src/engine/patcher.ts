import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

    for (const fp of patch.files) {
      const abs = path.resolve(install.path, fp.file);
      if (!abs.startsWith(installRoot)) {
        failure = { file: fp.file, reason: "path escapes install dir" };
        break;
      }
      if (!existsSync(abs)) {
        failure = { file: fp.file, reason: "file not found" };
        break;
      }
      const content = readFileSync(abs, "utf8");
      originals.set(fp.file, content);
      let current = content;
      const hunks: DiffHunk[] = [];
      for (const anchor of fp.anchors) {
        const ranges = anchorRanges(current, anchor);
        if (typeof ranges === "string") {
          failure = { file: fp.file, reason: ranges };
          break;
        }
        for (const r of ranges) {
          hunks.push({ offset: r.start, before: current.slice(r.start, r.end), after: r.replacement });
        }
        current = applyRanges(current, ranges);
      }
      if (failure) break;
      if (current !== content) {
        modified.set(fp.file, current);
        changes.push({ file: fp.file, hunks });
      }
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
