export type Anchor =
  | { kind: "string"; find: string; replace: string; index?: number }
  | { kind: "regex"; find: RegExp; replace: string; index?: number }
  | {
      kind: "scan-list-filter";
      /**
       * Root segments to keep (e.g. [".cursor", ".agents"]). Every other entry
       * in a detected skill/plugin scan-list literal is dropped, whatever its
       * name — the policy is a keep-list, never a blocklist of specific names.
       */
      keep: string[];
    };

export interface FilePatch {
  /**
   * Path relative to the installation root, or the wildcard "*.js" meaning all
   * top-level JS files in the install dir (scan-list-filter anchors only —
   * webpack duplicates literals into hash-named chunks, so they must be found
   * by shape, not addressed by file name).
   */
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
