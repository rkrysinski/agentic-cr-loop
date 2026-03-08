import type { FileChange, ReviewComment } from "../shared/types.js";

type ExportFile = {
  change: FileChange | null;
  path: string;
  current: ReviewComment[];
  outdated: ReviewComment[];
};

export function renderCommentsMarkdown(repoPath: string, files: ExportFile[]): string {
  void repoPath;
  const lines: string[] = [];

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const comments = [
      ...file.current.map((comment) => ({ comment, status: "current" as const })),
      ...file.outdated.map((comment) => ({ comment, status: "outdated" as const }))
    ].sort(compareCommentExportOrder);

    if (comments.length === 0) {
      continue;
    }

    lines.push(`REVIEW ${file.path}`);
    lines.push("");

    for (const { comment, status } of comments) {
      void status;
      const lineNumber = comment.side === "old" ? comment.oldLineNumber : comment.newLineNumber;
      lines.push(`NOTE ${comment.commentId} LINE ${lineNumber ?? "n/a"}`);
      lines.push(comment.body);
      lines.push("END NOTE");
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function compareCommentExportOrder(
  left: { comment: ReviewComment; status: "current" | "outdated" },
  right: { comment: ReviewComment; status: "current" | "outdated" }
): number {
  const leftLine = exportLineNumber(left.comment);
  const rightLine = exportLineNumber(right.comment);

  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }

  if (left.comment.createdAt !== right.comment.createdAt) {
    return left.comment.createdAt.localeCompare(right.comment.createdAt);
  }

  return left.comment.commentId.localeCompare(right.comment.commentId);
}

function exportLineNumber(comment: ReviewComment): number {
  return comment.side === "old" ? comment.oldLineNumber ?? Number.MAX_SAFE_INTEGER : comment.newLineNumber ?? Number.MAX_SAFE_INTEGER;
}
