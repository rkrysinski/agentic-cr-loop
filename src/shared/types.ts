export type ChangeType = "added" | "modified" | "deleted" | "renamed" | "untracked";

export type DiffLine = {
  kind: "context" | "added" | "removed";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
  commentableSide: "old" | "new" | null;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type FileChange = {
  changeId: string;
  changeType: ChangeType;
  oldPath: string | null;
  newPath: string | null;
  isBinary: boolean;
  diffFingerprint: string;
  hunks: DiffHunk[];
};

export type ReviewComment = {
  commentId: string;
  fileId: string;
  side: "old" | "new";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkHeader: string;
  body: string;
  createdAt: string;
  diffFingerprint: string;
};

export type ViewMode = "unified" | "side-by-side";
