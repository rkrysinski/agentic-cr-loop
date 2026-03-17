import type { ReviewComment } from "./types.js";

export type ReviewExportFile = {
  path: string;
  comments: Array<{
    comment: ReviewComment;
    status: "current" | "outdated";
  }>;
};

type ReviewExportHeader = {
  repoName: string;
  baseRef: string;
  date: string;
};

export function renderReviewCommentsText(
  files: ReviewExportFile[],
  options: {
    header?: ReviewExportHeader;
  } = {}
): string {
  const lines: string[] = [];

  if (options.header) {
    lines.push(
      `CODE REVIEW  ·  ${options.header.repoName}  ·  branch: ${options.header.baseRef}  ·  ${options.header.date}`,
      "━".repeat(50),
      ""
    );
  }

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const comments = [...file.comments].sort(compareCommentExportOrder);

    if (comments.length === 0) {
      continue;
    }

    lines.push(`REVIEW ${file.path}`);
    lines.push("");

    for (const { comment, status } of comments) {
      lines.push(`NOTE ${comment.commentId} SIDE ${comment.side} LINE ${comment.lineNumber} STATUS ${status}`);
      lines.push(comment.body);
      lines.push("END NOTE");
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function compareCommentExportOrder(
  left: { comment: ReviewComment },
  right: { comment: ReviewComment }
): number {
  return (
    left.comment.lineNumber - right.comment.lineNumber ||
    left.comment.side.localeCompare(right.comment.side) ||
    left.comment.commentId.localeCompare(right.comment.commentId)
  );
}
