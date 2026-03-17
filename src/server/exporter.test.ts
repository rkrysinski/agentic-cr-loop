import { describe, expect, it } from "vitest";
import { renderCommentsMarkdown } from "./exporter.js";

describe("renderCommentsMarkdown", () => {
  it("renders comments in stable file and line order", () => {
    const markdown = renderCommentsMarkdown([
      {
        path: "b.ts",
        comments: [
          {
            status: "current",
            comment: {
              commentId: "2",
              path: "b.ts",
              side: "new",
              lineNumber: 10,
              body: "Second",
              diffFingerprint: "fp"
            }
          }
        ]
      },
      {
        path: "a.ts",
        comments: [
          {
            status: "current",
            comment: {
              commentId: "1",
              path: "a.ts",
              side: "old",
              lineNumber: 3,
              body: "First",
              diffFingerprint: "fp"
            }
          }
        ]
      }
    ]);

    expect(markdown.indexOf("REVIEW a.ts")).toBeLessThan(markdown.indexOf("REVIEW b.ts"));
    expect(markdown).toContain("NOTE 1 SIDE old LINE 3 STATUS current\nFirst\nEND NOTE");
    expect(markdown).toContain("NOTE 2 SIDE new LINE 10 STATUS current\nSecond\nEND NOTE");
  });
});
