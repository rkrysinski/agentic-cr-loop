import fs from "node:fs/promises";
import path from "node:path";
import { CommentStore } from "./commentStore.js";
import { createBinaryUntrackedChange, createUntrackedChange, parseTrackedDiff } from "./diffParser.js";
import { renderCommentsMarkdown } from "./exporter.js";
import { runGit } from "./git.js";
import type { ChangeSummary, CommentsResponse, CreateCommentRequest, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment } from "../shared/types.js";

export class ReviewService {
  readonly commentStore: CommentStore;

  constructor(readonly repoPath: string) {
    this.commentStore = new CommentStore(repoPath);
  }

  async validateRepository(): Promise<void> {
    const topLevel = (await runGit(this.repoPath, ["rev-parse", "--show-toplevel"])).trim();
    if (!topLevel) {
      throw new Error("Invalid Git repository");
    }
    await runGit(this.repoPath, ["rev-parse", "--verify", "HEAD"]);
  }

  async getRepoInfo(): Promise<RepoResponse> {
    const changes = await this.getChanges();

    return {
      repoPath: this.repoPath,
      baseRef: "HEAD",
      changeCount: changes.length,
      viewModeDefault: "unified"
    };
  }

  async getChangeSummaries(): Promise<ChangeSummary[]> {
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

  async getChange(changeId: string): Promise<FileChange | null> {
    const changes = await this.getChanges();
    return changes.find((change) => change.changeId === changeId) ?? null;
  }

  async getComments(changeId: string): Promise<CommentsResponse> {
    const change = await this.getChange(changeId);
    if (!change) {
      throw new Error("Unknown changeId");
    }

    const comments = await this.commentStore.list();
    return classifyCommentsForChange(comments, change);
  }

  async createComment(request: CreateCommentRequest): Promise<ReviewComment> {
    const change = await this.getChange(request.changeId);
    if (!change) {
      throw new Error("Unknown changeId");
    }

    const isValidAnchor = change.hunks.some((hunk) =>
      hunk.header === request.hunkHeader &&
      hunk.lines.some(
        (line) =>
          line.commentableSide === request.side &&
          line.oldLineNumber === request.oldLineNumber &&
          line.newLineNumber === request.newLineNumber
      )
    );

    if (!isValidAnchor) {
      throw new Error("Comment anchor is not commentable in the current diff");
    }

    return this.commentStore.create({
      fileId: fileIdentity(change),
      side: request.side,
      oldLineNumber: request.oldLineNumber,
      newLineNumber: request.newLineNumber,
      hunkHeader: request.hunkHeader,
      body: request.body.trim(),
      diffFingerprint: change.diffFingerprint
    });
  }

  async exportMarkdown(): Promise<string> {
    const changes = await this.getChanges();
    const comments = await this.commentStore.list();
    const matchedFileIds = new Set<string>();
    const files = changes
      .map((change) => ({
        change,
        path: change.newPath ?? change.oldPath ?? "(unknown)",
        ...classifyCommentsForChange(comments, change)
      }))
      .filter((file) => {
        const hasComments = file.current.length > 0 || file.outdated.length > 0;
        if (hasComments) {
          matchedFileIds.add(fileIdentity(file.change));
        }
        return hasComments;
      });

    const orphanedFiles = Array.from(groupCommentsByFileId(comments).entries())
      .filter(([fileId]) => !matchedFileIds.has(fileId))
      .map(([fileId, groupedComments]) => ({
        change: null,
        path: fileId,
        current: [],
        outdated: groupedComments
      }));

    return renderCommentsMarkdown(this.repoPath, [...files, ...orphanedFiles]);
  }

  private async getChanges(): Promise<FileChange[]> {
    const trackedPatch = await runGit(this.repoPath, ["diff", "HEAD", "--find-renames", "--patch", "--binary", "--no-color"]);
    const tracked = parseTrackedDiff(trackedPatch);
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

function classifyCommentsForChange(comments: ReviewComment[], change: FileChange): CommentsResponse {
  const filtered = comments.filter((comment) => comment.fileId === fileIdentity(change));
  return {
    current: filtered.filter((comment) => comment.diffFingerprint === change.diffFingerprint),
    outdated: filtered.filter((comment) => comment.diffFingerprint !== change.diffFingerprint)
  };
}

function groupCommentsByFileId(comments: ReviewComment[]): Map<string, ReviewComment[]> {
  const grouped = new Map<string, ReviewComment[]>();

  for (const comment of comments) {
    const list = grouped.get(comment.fileId) ?? [];
    list.push(comment);
    grouped.set(comment.fileId, list);
  }

  return grouped;
}

function displayPath(change: Pick<FileChange, "newPath" | "oldPath">): string {
  return change.newPath ?? change.oldPath ?? "(unknown)";
}

function fileIdentity(change: Pick<FileChange, "newPath" | "oldPath">): string {
  return displayPath(change);
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}
