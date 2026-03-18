import { describe, expect, it } from "vitest";
import { renderReviewCommentsText } from "../shared/export.js";

describe("renderReviewCommentsText", () => {
  it("renders comments in stable file and line order", () => {
    const output = renderReviewCommentsText([
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

    expect(output.indexOf("REVIEW a.ts")).toBeLessThan(output.indexOf("REVIEW b.ts"));
    expect(output).toContain("NOTE 1 SIDE old LINE 3 STATUS current\nFirst\nEND NOTE");
    expect(output).toContain("NOTE 2 SIDE new LINE 10 STATUS current\nSecond\nEND NOTE");
  });
});
