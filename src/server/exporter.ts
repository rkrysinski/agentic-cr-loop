import { renderReviewCommentsText, type ReviewExportFile } from "../shared/export.js";

export function renderCommentsMarkdown(files: ReviewExportFile[]): string {
  return renderReviewCommentsText(files);
}
