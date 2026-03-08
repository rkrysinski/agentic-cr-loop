import { describe, expect, it } from "vitest";
import { createBinaryUntrackedChange, createUntrackedChange, parseTrackedDiff } from "./diffParser.js";

describe("parseTrackedDiff", () => {
  it("parses tracked text diffs with stable line numbers and commentable sides", () => {
    const patch = [
      "diff --git a/tracked.txt b/tracked.txt",
      "index 83db48f..bf8a6f4 100644",
      "--- a/tracked.txt",
      "+++ b/tracked.txt",
      "@@ -1,2 +1,2 @@",
      "-before",
      "+after",
      " stay"
    ].join("\n");

    const [change] = parseTrackedDiff(patch);

    expect(change.changeType).toBe("modified");
    expect(change.hunks).toHaveLength(1);
    expect(change.hunks[0].lines).toEqual([
      {
        kind: "removed",
        oldLineNumber: 1,
        newLineNumber: null,
        text: "before",
        commentableSide: "old"
      },
      {
        kind: "added",
        oldLineNumber: null,
        newLineNumber: 1,
        text: "after",
        commentableSide: "new"
      },
      {
        kind: "context",
        oldLineNumber: 2,
        newLineNumber: 2,
        text: "stay",
        commentableSide: null
      }
    ]);
  });

  it("marks binary tracked diffs as non-commentable", () => {
    const patch = [
      "diff --git a/image.png b/image.png",
      "index 1111111..2222222 100644",
      "Binary files a/image.png and b/image.png differ"
    ].join("\n");

    const [change] = parseTrackedDiff(patch);

    expect(change.isBinary).toBe(true);
    expect(change.hunks).toEqual([]);
  });
});

describe("untracked changes", () => {
  it("creates text hunks for untracked files", () => {
    const change = createUntrackedChange("notes.txt", "first\nsecond\n");

    expect(change.changeType).toBe("untracked");
    expect(change.hunks[0].header).toBe("@@ -0,0 +1,2 @@");
    expect(change.hunks[0].lines[1]).toEqual({
      kind: "added",
      oldLineNumber: null,
      newLineNumber: 2,
      text: "second",
      commentableSide: "new"
    });
  });

  it("creates non-commentable binary untracked changes", () => {
    const change = createBinaryUntrackedChange("blob.bin", Buffer.from([0, 1, 2]));

    expect(change.isBinary).toBe(true);
    expect(change.hunks).toEqual([]);
  });
});
