import fs from "node:fs/promises";
import path from "node:path";
import { CommentStore, REVIEW_STORAGE_DIRECTORY, getReviewSessionFileName } from "./commentStore.js";
import { createBinaryUntrackedChange, createUntrackedChange, parseTrackedDiff } from "./diffParser.js";
import { renderCommentsMarkdown } from "./exporter.js";
import { runGit } from "./git.js";
import type { ChangeSummary, CommentsResponse, CreateCommentRequest, DiffContextValue, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment } from "../shared/types.js";

const SUMMARY_CONTEXT: DiffContextValue = "0";
const FULL_CONTEXT_LINES = 1_000_000;

export class ReviewService {
  repoPath: string;
  commentStore: CommentStore;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.commentStore = new CommentStore(repoPath);
  }

  async validateRepository(): Promise<void> {
    await this.syncReviewSession();
  }

  async getRepoInfo(): Promise<RepoResponse> {
    await this.syncReviewSession();
    const changes = await this.getChanges();

    return {
      repoPath: this.repoPath,
      baseRef: "HEAD",
      changeCount: changes.length,
      viewModeDefault: "unified"
    };
  }

  async getChangeSummaries(): Promise<ChangeSummary[]> {
    await this.syncReviewSession();
    const changes = await this.getChanges();
    const comments = await this.commentStore.list();

    return changes.map((change) => {
      const classified = classifyCommentsForChange(comments, change);
      return {
        changeId: change.changeId,
        changeType: change.changeType,
        oldPath: change.oldPath,
        newPath: change.newPath,
        isBinary: change.isBinary,
        commentCounts: {
          current: classified.current.length,
          outdated: classified.outdated.length
        }
      };
    });
  }

  async getChange(changeId: string, context: DiffContextValue = SUMMARY_CONTEXT): Promise<FileChange | null> {
    await this.syncReviewSession();
    const changes = await this.getChanges(context);
    return changes.find((change) => change.changeId === changeId) ?? null;
  }

  async getComments(changeId: string): Promise<CommentsResponse> {
    await this.syncReviewSession();
    const change = await this.getChange(changeId, SUMMARY_CONTEXT);
    if (!change) {
      throw new Error("Unknown changeId");
    }

    const comments = await this.commentStore.list();
    return classifyCommentsForChange(comments, change);
  }

  async createComment(request: CreateCommentRequest): Promise<ReviewComment> {
    await this.syncReviewSession();
    const change = await this.getChange(request.changeId, "full");
    if (!change) {
      throw new Error("Unknown changeId");
    }

    const isValidAnchor = change.hunks.some((hunk) =>
      hunk.lines.some(
        (line) =>
          (line.commentableSide === request.side || (line.kind === "context" && (request.side === "old" || request.side === "new"))) &&
          getLineNumberForSide(line, request.side) === request.lineNumber
      )
    );

    if (!isValidAnchor) {
      throw new Error("Comment anchor is not commentable in the current diff");
    }

    return this.commentStore.create({
      path: fileIdentity(change),
      side: request.side,
      lineNumber: request.lineNumber,
      body: request.body.trim(),
      diffFingerprint: change.diffFingerprint
    });
  }

  async updateComment(commentId: string, body: string): Promise<ReviewComment | null> {
    await this.syncReviewSession();
    return this.commentStore.update(commentId, body.trim());
  }

  async deleteComment(commentId: string): Promise<boolean> {
    await this.syncReviewSession();
    return this.commentStore.delete(commentId);
  }

  async exportMarkdown(): Promise<string> {
    await this.syncReviewSession();
    const changes = await this.getChanges();
    const comments = await this.commentStore.list();
    const matchedFileIds = new Set<string>();
    const files = changes
      .map((change) => ({
        path: change.newPath ?? change.oldPath ?? "(unknown)",
        comments: comments
          .filter((comment) => comment.path === fileIdentity(change))
          .map((comment) => ({
            comment,
            status: comment.diffFingerprint === change.diffFingerprint ? ("current" as const) : ("outdated" as const)
          }))
      }))
      .filter((file) => {
        const hasComments = file.comments.length > 0;
        if (hasComments) {
          matchedFileIds.add(file.path);
        }
        return hasComments;
      });

    const orphanedFiles = Array.from(groupCommentsByFilePath(comments).entries())
      .filter(([fileId]) => !matchedFileIds.has(fileId))
      .map(([fileId, groupedComments]) => ({
        path: fileId,
        comments: groupedComments.map((comment) => ({
          comment,
          status: "outdated" as const
        }))
      }));

    return renderCommentsMarkdown([...files, ...orphanedFiles]);
  }

  private async syncReviewSession(): Promise<void> {
    const topLevel = (await runGit(this.repoPath, ["rev-parse", "--show-toplevel"])).trim();
    if (!topLevel) {
      throw new Error("Invalid Git repository");
    }

    await runGit(topLevel, ["rev-parse", "--verify", "HEAD"]);
    const headShortId = (await runGit(topLevel, ["rev-parse", "--short=12", "HEAD"])).trim();
    if (!headShortId) {
      throw new Error("Invalid Git repository");
    }

    this.repoPath = topLevel;
    this.commentStore = new CommentStore(topLevel, getReviewSessionFileName(headShortId));
  }

  private async getChanges(context: DiffContextValue = SUMMARY_CONTEXT): Promise<FileChange[]> {
    const trackedPatch = await runGit(this.repoPath, [
      "diff",
      `--unified=${getGitUnifiedContext(context)}`,
      "HEAD",
      "--find-renames",
      "--patch",
      "--binary",
      "--no-color"
    ]);
    const tracked = parseTrackedDiff(trackedPatch).filter((change) => !isInternalReviewChange(change));
    const untracked = await this.readUntrackedChanges();

    return [...tracked, ...untracked].sort((left, right) => displayPath(left).localeCompare(displayPath(right)));
  }

  private async readUntrackedChanges(): Promise<FileChange[]> {
    const statusOutput = await runGit(this.repoPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const entries = statusOutput.split("\0").filter(Boolean);
    const changes: FileChange[] = [];

    for (const entry of entries) {
      if (!entry.startsWith("?? ")) {
        continue;
      }

      const relativePath = entry.slice(3);
      if (isInternalReviewPath(relativePath)) {
        continue;
      }
      const absolutePath = path.join(this.repoPath, relativePath);
      const content = await fs.readFile(absolutePath);

      if (isBinaryBuffer(content)) {
        changes.push(createBinaryUntrackedChange(relativePath, content));
      } else {
        changes.push(createUntrackedChange(relativePath, content.toString("utf8")));
      }
    }

    return changes;
  }
}

function getGitUnifiedContext(context: DiffContextValue): number {
  return context === "full" ? FULL_CONTEXT_LINES : Number(context);
}

function classifyCommentsForChange(comments: ReviewComment[], change: FileChange): CommentsResponse {
  const filtered = comments.filter((comment) => comment.path === fileIdentity(change));
  return {
    current: filtered.filter((comment) => comment.diffFingerprint === change.diffFingerprint),
    outdated: filtered.filter((comment) => comment.diffFingerprint !== change.diffFingerprint)
  };
}

function groupCommentsByFilePath(comments: ReviewComment[]): Map<string, ReviewComment[]> {
  const grouped = new Map<string, ReviewComment[]>();

  for (const comment of comments) {
    const list = grouped.get(comment.path) ?? [];
    list.push(comment);
    grouped.set(comment.path, list);
  }

  return grouped;
}

function displayPath(change: Pick<FileChange, "newPath" | "oldPath">): string {
  return change.newPath ?? change.oldPath ?? "(unknown)";
}

function isInternalReviewChange(change: Pick<FileChange, "newPath" | "oldPath">): boolean {
  return isInternalReviewPath(change.newPath) || isInternalReviewPath(change.oldPath);
}

function isInternalReviewPath(filePath: string | null): boolean {
  return typeof filePath === "string" && (filePath === REVIEW_STORAGE_DIRECTORY || filePath.startsWith(`${REVIEW_STORAGE_DIRECTORY}/`));
}

function fileIdentity(change: Pick<FileChange, "newPath" | "oldPath">): string {
  return displayPath(change);
}

function getLineNumberForSide(
  line: Pick<import("../shared/types.js").DiffLine, "oldLineNumber" | "newLineNumber">,
  side: ReviewComment["side"]
): number | null {
  return side === "old" ? line.oldLineNumber : line.newLineNumber;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}
