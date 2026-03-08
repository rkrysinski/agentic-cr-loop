import type { FileChange, ReviewComment } from "../shared/types.js";

type ExportFile = {
  change: FileChange | null;
  path: string;
  current: ReviewComment[];
  outdated: ReviewComment[];
};

export function renderCommentsMarkdown(repoPath: string, files: ExportFile[]): string {
  const lines: string[] = [
    "# Review Comments",
    "",
    `Repository Path: ${repoPath}`,
    "Base Ref: HEAD",
    ""
  ];

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    lines.push(`## File: ${file.path}`);
    lines.push("");

    const comments = [
      ...file.current.map((comment) => ({ comment, status: "current" as const })),
      ...file.outdated.map((comment) => ({ comment, status: "outdated" as const }))
    ].sort(compareCommentExportOrder);

    if (comments.length === 0) {
      lines.push("No comments.");
      lines.push("");
      continue;
    }

    for (const { comment, status } of comments) {
      const lineNumber = comment.side === "old" ? comment.oldLineNumber : comment.newLineNumber;
      lines.push(`### Comment: ${comment.commentId}`);
      lines.push(`Status: ${status}`);
      lines.push(`Anchor Side: ${comment.side}`);
      lines.push(`Line Number: ${lineNumber ?? "n/a"}`);
      lines.push(`Hunk Header: ${comment.hunkHeader}`);
      lines.push(`Created At: ${comment.createdAt}`);
      lines.push("Body:");
      lines.push(comment.body);
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
