import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffViewer, pairHunkLines } from "./diffView.js";
import type { FileChange } from "../shared/types.js";

const change: FileChange = {
  changeId: "change-1",
  changeType: "modified",
  oldPath: "tracked.txt",
  newPath: "tracked.txt",
  isBinary: false,
  diffFingerprint: "fp",
  hunks: [
    {
      header: "@@ -1,2 +1,2 @@",
      lines: [
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
      ]
    }
  ]
};

describe("pairHunkLines", () => {
  it("pairs removals and additions into stable side-by-side rows", () => {
    const rows = pairHunkLines(change.hunks[0]);

    expect(rows[0].left?.text).toBe("before");
    expect(rows[0].right?.text).toBe("after");
    expect(rows[1].left?.text).toBe("stay");
    expect(rows[1].right?.text).toBe("stay");
  });
});

describe("DiffViewer", () => {
  it("shows comment actions only on changed lines and hides outdated inline markers", () => {
    const { container, rerender } = render(
      <DiffViewer
        change={change}
        comments={[
          {
            commentId: "current",
            fileId: "change-1",
            side: "new",
            oldLineNumber: null,
            newLineNumber: 1,
            hunkHeader: "@@ -1,2 +1,2 @@",
            body: "Current",
            createdAt: "2026-03-10T10:00:00.000Z",
            diffFingerprint: "fp"
          }
        ]}
        mode="unified"
        selectedAnchorKey={null}
        onSelectLine={() => undefined}
      />
    );

    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(2);
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(1);

    rerender(
      <DiffViewer change={change} comments={[]} mode="side-by-side" selectedAnchorKey={null} onSelectLine={() => undefined} />
    );

    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(2);
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(0);
  });
});
