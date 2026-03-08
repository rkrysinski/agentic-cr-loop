import { describe, expect, it } from "vitest";
import { renderCommentsMarkdown } from "./exporter.js";

describe("renderCommentsMarkdown", () => {
  it("renders comments in stable file and line order", () => {
    const markdown = renderCommentsMarkdown("/repo", [
      {
        change: null,
        path: "b.ts",
        current: [
          {
            commentId: "2",
            fileId: "b",
            side: "new",
            oldLineNumber: null,
            newLineNumber: 10,
            hunkHeader: "@@ -1,1 +1,1 @@",
            body: "Second",
            createdAt: "2026-03-10T10:00:00.000Z",
            diffFingerprint: "fp"
          }
        ],
        outdated: []
      },
      {
        change: null,
        path: "a.ts",
        current: [
          {
            commentId: "1",
            fileId: "a",
            side: "old",
            oldLineNumber: 3,
            newLineNumber: null,
            hunkHeader: "@@ -3,1 +3,0 @@",
            body: "First",
            createdAt: "2026-03-10T09:00:00.000Z",
            diffFingerprint: "fp"
          }
        ],
        outdated: []
      }
    ]);

    expect(markdown.indexOf("REVIEW a.ts")).toBeLessThan(markdown.indexOf("REVIEW b.ts"));
    expect(markdown).toContain("NOTE 1 LINE 3\nFirst\nEND NOTE");
    expect(markdown).toContain("NOTE 2 LINE 10\nSecond\nEND NOTE");
  });
});
