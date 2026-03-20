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

  it("renders the header block when provided", () => {
    const output = renderReviewCommentsText([], {
      header: { repoName: "my-repo", baseRef: "HEAD", date: "2026-03-20" }
    });

    expect(output).toContain("CODE REVIEW  ·  my-repo  ·  branch: HEAD  ·  2026-03-20");
    expect(output).toContain("━".repeat(50));
  });

  it("omits the header block when not provided", () => {
    const output = renderReviewCommentsText([]);
    expect(output).not.toContain("CODE REVIEW");
  });

  it("skips files that have no comments", () => {
    const output = renderReviewCommentsText([
      { path: "empty.ts", comments: [] },
      {
        path: "has-note.ts",
        comments: [
          {
            status: "outdated",
            comment: {
              commentId: "x",
              path: "has-note.ts",
              side: "new",
              lineNumber: 1,
              body: "note",
              diffFingerprint: "fp"
            }
          }
        ]
      }
    ]);

    expect(output).not.toContain("REVIEW empty.ts");
    expect(output).toContain("REVIEW has-note.ts");
  });

  it("sorts multiple comments within a file by line number then side", () => {
    const output = renderReviewCommentsText([
      {
        path: "file.ts",
        comments: [
          {
            status: "current",
            comment: { commentId: "b", path: "file.ts", side: "old", lineNumber: 5, body: "B", diffFingerprint: "fp" }
          },
          {
            status: "current",
            comment: { commentId: "a", path: "file.ts", side: "new", lineNumber: 2, body: "A", diffFingerprint: "fp" }
          },
          {
            status: "current",
            comment: { commentId: "c", path: "file.ts", side: "new", lineNumber: 5, body: "C", diffFingerprint: "fp" }
          }
        ]
      }
    ]);

    const posA = output.indexOf("NOTE a");
    const posB = output.indexOf("NOTE b");
    const posC = output.indexOf("NOTE c");
    // line 2 (a) comes before line 5
    expect(posA).toBeLessThan(posB);
    expect(posA).toBeLessThan(posC);
    // at line 5: "new" < "old" lexicographically, so c (new) sorts before b (old)
    expect(posC).toBeLessThan(posB);
  });

  it("marks outdated comments with STATUS outdated", () => {
    const output = renderReviewCommentsText([
      {
        path: "f.ts",
        comments: [
          {
            status: "outdated",
            comment: { commentId: "z", path: "f.ts", side: "new", lineNumber: 1, body: "stale", diffFingerprint: "old" }
          }
        ]
      }
    ]);

    expect(output).toContain("STATUS outdated");
  });

  it("ends with a single trailing newline", () => {
    const output = renderReviewCommentsText([
      {
        path: "f.ts",
        comments: [
          {
            status: "current",
            comment: { commentId: "1", path: "f.ts", side: "new", lineNumber: 1, body: "hi", diffFingerprint: "fp" }
          }
        ]
      }
    ]);

    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });
});
