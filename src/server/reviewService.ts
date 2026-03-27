import fs from "node:fs/promises";
import path from "node:path";
import { getChangePath } from "../shared/changePaths.js";
import type { ChangeSummary, CommentsResponse, CreateCommentRequest, DiffContextValue, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment } from "../shared/types.js";
import { CommentStore, REVIEW_STORAGE_DIRECTORY, getReviewSessionFileName } from "./commentStore.js";
import { createBinaryUntrackedChange, createUntrackedChange, parseTrackedDiff } from "./diffParser.js";
import { renderReviewCommentsText } from "../shared/export.js";
import { resolveNativePath, runGit } from "./git.js";
import { ClientError } from "./errors.js";
import { readSession, resetSession as resetSessionStore, transitionSession as transitionSessionStore } from "./sessionStore.js";
import type { SessionState, SessionStatus } from "./sessionStore.js";

const SUMMARY_CONTEXT: DiffContextValue = "0";
const FULL_CONTEXT_LINES = 1_000_000;

export class ReviewService {
  repoPath: string;
  commentStore: CommentStore;
  private headShortId = "";

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.commentStore = new CommentStore(repoPath);
  }

  async validateRepository(): Promise<void> {
    await this.syncReviewSession();
  }

  async getRepoInfo(): Promise<RepoResponse> {
    await this.syncReviewSession();

    return {
      path: this.repoPath,
      baseRef: "HEAD",
      headShortId: this.headShortId
    };
  }

  async getChangeSummaries(): Promise<ChangeSummary[]> {
    await this.syncReviewSession();
    const [changes, comments] = await Promise.all([this.getChanges(), this.commentStore.list()]);

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
    const [changes, comments] = await Promise.all([
      this.getChanges(SUMMARY_CONTEXT),
      this.commentStore.list()
    ]);
    const change = changes.find((c) => c.changeId === changeId);
    if (!change) {
      throw new ClientError("Unknown changeId");
    }

    return classifyCommentsForChange(comments, change);
  }

  async createComment(request: CreateCommentRequest): Promise<ReviewComment> {
    await this.syncReviewSession();
    const changes = await this.getChanges("full");
    const change = changes.find((c) => c.changeId === request.changeId);
    if (!change) {
      throw new ClientError("Unknown changeId");
    }

    const isValidAnchor = change.hunks.some((hunk) =>
      hunk.lines.some(
        (line) =>
          (line.commentableSide === request.side || (line.kind === "context" && (request.side === "old" || request.side === "new"))) &&
          getLineNumberForSide(line, request.side) === request.lineNumber
      )
    );

    if (!isValidAnchor) {
      throw new ClientError("Comment anchor is not commentable in the current diff");
    }

    return this.commentStore.create({
      path: getChangePath(change),
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

  async getSession(): Promise<SessionState> {
    await this.syncReviewSession();
    return readSession(this.repoPath);
  }

  async transitionSession(targetStatus: SessionStatus): Promise<SessionState> {
    await this.syncReviewSession();
    return transitionSessionStore(this.repoPath, targetStatus);
  }

  async resetSession(): Promise<void> {
    await this.syncReviewSession();
    await resetSessionStore(this.repoPath);
  }

  async exportComments(options?: { skipOutdated?: boolean }): Promise<string> {
    const skipOutdated = options?.skipOutdated ?? true;
    await this.syncReviewSession();
    const [changes, comments] = await Promise.all([this.getChanges(), this.commentStore.list()]);
    const matchedFileIds = new Set<string>();
    const files = changes
      .map((change) => ({
        path: getChangePath(change),
        comments: comments
          .filter((comment) => comment.path === getChangePath(change))
          .map((comment) => ({
            comment,
            status: comment.diffFingerprint === change.diffFingerprint ? ("current" as const) : ("outdated" as const)
          }))
          .filter((entry) => !skipOutdated || entry.status !== "outdated")
      }))
      .filter((file) => {
        const hasComments = file.comments.length > 0;
        if (hasComments) {
          matchedFileIds.add(file.path);
        }
        return hasComments;
      });

    const orphanedFiles = skipOutdated
      ? []
      : Array.from(groupCommentsByFilePath(comments).entries())
          .filter(([fileId]) => !matchedFileIds.has(fileId))
          .map(([fileId, groupedComments]) => ({
            path: fileId,
            comments: groupedComments.map((comment) => ({
              comment,
              status: "outdated" as const
            }))
          }));

    return renderReviewCommentsText([...files, ...orphanedFiles]);
  }

  private async syncReviewSession(): Promise<void> {
    const topLevel = await normalizeGitTopLevel((await runGit(this.repoPath, ["rev-parse", "--show-toplevel"])).trim());
    if (!topLevel) {
      throw new Error("Invalid Git repository");
    }

    const headShortId = (await runGit(topLevel, ["rev-parse", "--short=12", "HEAD"])).trim();
    if (!headShortId) {
      throw new Error("Invalid Git repository");
    }

    this.repoPath = topLevel;
    this.headShortId = headShortId;
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

    return [...tracked, ...untracked].sort((left, right) => getChangePath(left).localeCompare(getChangePath(right)));
  }

  private async readUntrackedChanges(): Promise<FileChange[]> {
    const statusOutput = await runGit(this.repoPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const untrackedPaths = statusOutput
      .split("\0")
      .filter((entry) => entry.startsWith("?? "))
      .map((entry) => entry.slice(3))
      .filter((relativePath) => !isInternalReviewPath(relativePath) && !relativePath.endsWith("/"));

    return Promise.all(
      untrackedPaths.map(async (relativePath) => {
        const absolutePath = path.join(this.repoPath, relativePath);
        const content = await fs.readFile(absolutePath);
        return isBinaryBuffer(content)
          ? createBinaryUntrackedChange(relativePath, content)
          : createUntrackedChange(relativePath, content.toString("utf8"));
      })
    );
  }
}

function getGitUnifiedContext(context: DiffContextValue): number {
  return context === "full" ? FULL_CONTEXT_LINES : Number(context);
}

function classifyCommentsForChange(comments: ReviewComment[], change: FileChange): CommentsResponse {
  const filtered = comments.filter((comment) => comment.path === getChangePath(change));
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

function isInternalReviewChange(change: Pick<FileChange, "newPath" | "oldPath">): boolean {
  return isInternalReviewPath(change.newPath) || isInternalReviewPath(change.oldPath);
}

function isInternalReviewPath(filePath: string | null): boolean {
  if (typeof filePath !== "string") return false;
  // Normalize backslashes for Windows where git may return mixed separators
  const normalized = filePath.replace(/\\/g, "/");
  return normalized === REVIEW_STORAGE_DIRECTORY || normalized.startsWith(`${REVIEW_STORAGE_DIRECTORY}/`);
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

/** Normalize git's --show-toplevel output to a native absolute path, handling MSYS-style /c/... and Cygwin paths on Windows. */
async function normalizeGitTopLevel(raw: string): Promise<string> {
  if (process.platform === "win32") {
    const msys = /^\/([a-zA-Z])(\/|$)/.exec(raw);
    if (msys) return path.resolve(`${msys[1].toUpperCase()}:${raw.slice(2)}`);
    return resolveNativePath(raw);
  }
  return path.resolve(raw);
}
