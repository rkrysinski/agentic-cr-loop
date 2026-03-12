import fs from "node:fs/promises";
import path from "node:path";
import type { ReviewComment } from "../shared/types.js";
import { sha256 } from "./hash.js";

type StoredComment = {
  side: ReviewComment["side"];
  line: number;
  body: string;
  diffFingerprint: string;
};

type StoredCommentsFile = Record<string, StoredComment[]>;

type LegacySessionFile = {
  comments: Array<{
    fileId: string;
    side: ReviewComment["side"];
    oldLineNumber: number | null;
    newLineNumber: number | null;
    body: string;
    diffFingerprint: string;
  }>;
};

export const REVIEW_STORAGE_DIRECTORY = ".local-code-review";

export function getReviewSessionFileName(reviewBaseShortId: string): string {
  return `${reviewBaseShortId}.json`;
}

export class CommentStore {
  constructor(
    private readonly repoPath: string,
    private readonly sessionFileName = getReviewSessionFileName("HEAD"),
    private readonly storageDir = path.join(repoPath, REVIEW_STORAGE_DIRECTORY)
  ) {}

  async list(): Promise<ReviewComment[]> {
    const storedComments = await this.read();
    return flattenStoredComments(storedComments).map(toReviewComment);
  }

  async create(
    input: Omit<ReviewComment, "commentId">
  ): Promise<ReviewComment> {
    const storedComments = await this.read();
    const commentsForPath = storedComments[input.path] ?? [];
    const storedComment: StoredComment = {
      side: input.side,
      line: input.lineNumber,
      body: input.body,
      diffFingerprint: input.diffFingerprint
    };

    commentsForPath.push(storedComment);
    storedComments[input.path] = commentsForPath;
    await this.write(storedComments);

    return toReviewComment({
      path: input.path,
      index: commentsForPath.length - 1,
      comment: storedComment
    });
  }

  async update(commentId: string, body: string): Promise<ReviewComment | null> {
    const storedComments = await this.read();
    const record = findStoredComment(storedComments, commentId);

    if (!record) {
      return null;
    }

    const updated: StoredComment = {
      ...record.comment,
      body
    };
    storedComments[record.path]![record.index] = updated;
    await this.write(storedComments);
    return toReviewComment({
      path: record.path,
      index: record.index,
      comment: updated
    });
  }

  async delete(commentId: string): Promise<boolean> {
    const storedComments = await this.read();
    const record = findStoredComment(storedComments, commentId);

    if (!record) {
      return false;
    }

    const nextComments = storedComments[record.path]!.filter((_comment, index) => index !== record.index);
    if (nextComments.length === 0) {
      delete storedComments[record.path];
    } else {
      storedComments[record.path] = nextComments;
    }

    await this.write(storedComments);
    return true;
  }

  private async getSessionFilePath(): Promise<string> {
    await fs.mkdir(this.storageDir, { recursive: true });
    return path.join(this.storageDir, this.sessionFileName);
  }

  private async read(): Promise<StoredCommentsFile> {
    const sessionPath = await this.getSessionFilePath();

    try {
      const content = await fs.readFile(sessionPath, "utf8");
      return normalizeStoredComments(JSON.parse(content) as unknown);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  private async write(storedComments: StoredCommentsFile): Promise<void> {
    const sessionPath = await this.getSessionFilePath();
    const sortedEntries = Object.entries(storedComments).sort(([left], [right]) => left.localeCompare(right));
    const normalizedComments: StoredCommentsFile = Object.fromEntries(sortedEntries);
    await fs.writeFile(sessionPath, `${JSON.stringify(normalizedComments, null, 2)}\n`, "utf8");
  }
}

function flattenStoredComments(storedComments: StoredCommentsFile): Array<{ path: string; index: number; comment: StoredComment }> {
  return Object.entries(storedComments).flatMap(([path, comments]) =>
    comments.map((comment, index) => ({
      path,
      index,
      comment
    }))
  );
}

function toReviewComment(entry: { path: string; index: number; comment: StoredComment }): ReviewComment {
  return {
    commentId: getCommentId(entry.path, entry.index),
    path: entry.path,
    side: entry.comment.side,
    lineNumber: entry.comment.line,
    body: entry.comment.body,
    diffFingerprint: entry.comment.diffFingerprint
  };
}

function getCommentId(filePath: string, index: number): string {
  return sha256(`${filePath}\n${index}`).slice(0, 12);
}

function findStoredComment(
  storedComments: StoredCommentsFile,
  commentId: string
): { path: string; index: number; comment: StoredComment } | null {
  for (const [filePath, comments] of Object.entries(storedComments)) {
    for (const [index, comment] of comments.entries()) {
      if (getCommentId(filePath, index) === commentId) {
        return {
          path: filePath,
          index,
          comment
        };
      }
    }
  }

  return null;
}

function normalizeStoredComments(value: unknown): StoredCommentsFile {
  if (isLegacySessionFile(value)) {
    return value.comments.reduce<StoredCommentsFile>((accumulator, comment) => {
      const lineNumber = comment.side === "old" ? comment.oldLineNumber : comment.newLineNumber;
      if (typeof lineNumber !== "number") {
        return accumulator;
      }

      const commentsForPath = accumulator[comment.fileId] ?? [];
      commentsForPath.push({
        side: comment.side,
        line: lineNumber,
        body: comment.body,
        diffFingerprint: comment.diffFingerprint
      });
      accumulator[comment.fileId] = commentsForPath;
      return accumulator;
    }, {});
  }

  if (!isStoredCommentsFile(value)) {
    throw new Error("Invalid comments file");
  }

  return value;
}

function isLegacySessionFile(value: unknown): value is LegacySessionFile {
  return typeof value === "object" && value !== null && Array.isArray((value as { comments?: unknown }).comments);
}

function isStoredCommentsFile(value: unknown): value is StoredCommentsFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (comments) =>
      Array.isArray(comments) &&
      comments.every(
        (comment) =>
          typeof comment === "object" &&
          comment !== null &&
          ((comment as { side?: unknown }).side === "old" || (comment as { side?: unknown }).side === "new") &&
          typeof (comment as { line?: unknown }).line === "number" &&
          typeof (comment as { body?: unknown }).body === "string" &&
          typeof (comment as { diffFingerprint?: unknown }).diffFingerprint === "string"
      )
  );
}
