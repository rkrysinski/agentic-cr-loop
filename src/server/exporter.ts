import type { ReviewComment } from "../shared/types.js";

type ExportFile = {
  path: string;
  comments: Array<{
    comment: ReviewComment;
    status: "current" | "outdated";
  }>;
};

export function renderCommentsMarkdown(files: ExportFile[]): string {
  const lines: string[] = [];

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const comments = [...file.comments].sort(compareCommentExportOrder);

    if (comments.length === 0) {
      continue;
    }

    lines.push(`REVIEW ${file.path}`);
    lines.push("");

    for (const { comment, status } of comments) {
      void status;
      lines.push(`NOTE ${comment.commentId} LINE ${comment.lineNumber}`);
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

  return 0;
}

function exportLineNumber(comment: ReviewComment): number {
  return comment.lineNumber;
}
