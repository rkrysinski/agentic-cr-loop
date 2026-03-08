import type { FileChange, ReviewComment, ViewMode } from "./types.js";

export type RepoResponse = {
  repoPath: string;
  baseRef: "HEAD";
  changeCount: number;
  viewModeDefault: Extract<ViewMode, "unified">;
};

export type ChangeSummary = {
  changeId: string;
  changeType: FileChange["changeType"];
  oldPath: string | null;
  newPath: string | null;
  isBinary: boolean;
  commentCounts: {
    current: number;
    outdated: number;
  };
};

export type CommentsResponse = {
  current: ReviewComment[];
  outdated: ReviewComment[];
};

export type CreateCommentRequest = {
  changeId: string;
  side: ReviewComment["side"];
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkHeader: string;
  body: string;
};
