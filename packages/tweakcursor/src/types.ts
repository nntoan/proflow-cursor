export type Anchor =
  | { kind: "string"; find: string; replace: string; index?: number }
  | { kind: "regex"; find: RegExp; replace: string; index?: number };

export interface FilePatch {
  /** Path relative to the installation root. */
  file: string;
  anchors: Anchor[];
}

export interface Patch {
  id: string;
  description: string;
  files: FilePatch[];
  verifiedVersions: string[];
}

export interface AnchorFailure {
  file: string;
  reason: string;
}

export interface DiffHunk {
  offset: number;
  before: string;
  after: string;
}

export interface FileChange {
  file: string;
  hunks: DiffHunk[];
}

export interface PerPatchReport {
  id: string;
  status: "applied" | "failed";
  /** True when install version is in the patch's verifiedVersions (posture B: attempt regardless). */
  verified: boolean;
  failures: AnchorFailure[];
  changes: FileChange[];
}
