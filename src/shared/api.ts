import type { FileChange, ReviewComment } from "./types.js";

export const DIFF_CONTEXT_VALUES = ["0", "3", "20", "100", "full"] as const;

export type DiffContextValue = (typeof DIFF_CONTEXT_VALUES)[number];

export type RepoEntry = {
  id: string;
  path: string;
};

export type RepoInfoResponse = {
  id: string;
  path: string;
  baseRef: string;
  changeCount: number;
  headShortId: string;
};

export type RepoResponse = {
  path: string;
  baseRef: "HEAD";
  headShortId: string;
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
