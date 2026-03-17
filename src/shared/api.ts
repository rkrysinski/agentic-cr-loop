import type { FileChange, ReviewComment, ViewMode } from "./types.js";

export const DIFF_CONTEXT_VALUES = ["0", "3", "20", "100", "full"] as const;

export type DiffContextValue = (typeof DIFF_CONTEXT_VALUES)[number];

export type RepoResponse = {
  repoPath: string;
  baseRef: "HEAD";
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
  lineNumber: number;
  body: string;
};

export type UpdateCommentRequest = {
  body: string;
};
