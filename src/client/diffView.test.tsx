import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer, getAnchorKey, pairHunkLines } from "./diffView.js";
import type { CommentsResponse } from "../shared/api.js";
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

const comments: CommentsResponse = {
  current: [
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
  ],
  outdated: [
    {
      commentId: "outdated",
      fileId: "change-1",
      side: "new",
      oldLineNumber: null,
      newLineNumber: 1,
      hunkHeader: "@@ -1,2 +1,2 @@",
      body: "Outdated",
      createdAt: "2026-03-10T09:00:00.000Z",
      diffFingerprint: "stale"
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
  it("opens the inline composer from line clicks and renders existing inline threads", () => {
    const onSelectLine = vi.fn();
    const selectedAnchorKey = getAnchorKey(change.hunks[0].header, change.hunks[0].lines[1]);
    const { container, rerender } = render(
      <DiffViewer
        change={change}
        comments={comments}
        mode="unified"
        hideRemovedCode={false}
        selectedAnchorKey={selectedAnchorKey}
        draftComment="Draft comment"
        editingCommentId={null}
        editingBody=""
        submitting={false}
        pendingCommentActionId={null}
        onSelectLine={onSelectLine}
        onDraftCommentChange={vi.fn()}
        onSubmitComment={vi.fn()}
        onCancelNewComment={vi.fn()}
        onBeginEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onChangeEditingBody={vi.fn()}
        onSaveEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(container.querySelectorAll(".diff-row-clickable")).toHaveLength(2);
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(0);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Outdated", { selector: ".comment-status" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add comment for new line 1")).toHaveValue("Draft comment");

    fireEvent.click(screen.getByText("before"));
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "old",
      oldLineNumber: 1,
      newLineNumber: null,
      hunkHeader: "@@ -1,2 +1,2 @@"
    });

    rerender(
      <DiffViewer
        change={change}
        comments={comments}
        mode="side-by-side"
        hideRemovedCode={false}
        selectedAnchorKey={selectedAnchorKey}
        draftComment="Draft comment"
        editingCommentId={null}
        editingBody=""
        submitting={false}
        pendingCommentActionId={null}
        onSelectLine={onSelectLine}
        onDraftCommentChange={vi.fn()}
        onSubmitComment={vi.fn()}
        onCancelNewComment={vi.fn()}
        onBeginEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onChangeEditingBody={vi.fn()}
        onSaveEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(container.querySelectorAll(".diff-row-clickable")).toHaveLength(0);
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(6);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Outdated", { selector: ".comment-status" })).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll(".side-table .diff-row")).every((row) => row.querySelectorAll("td").length === 6)
    ).toBe(true);

    const sideThreadCells = container.querySelectorAll(".side-inline-thread-row td");
    expect(sideThreadCells).toHaveLength(6);
    expect(Array.from(sideThreadCells).map((cell) => cell.getAttribute("colspan"))).toEqual([null, null, null, null, null, null]);

    fireEvent.click(screen.getByText("after"));
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "new",
      oldLineNumber: null,
      newLineNumber: 1,
      hunkHeader: "@@ -1,2 +1,2 @@"
    });
  });

  it("hides removed rows in unified mode while preserving existing threads", () => {
    const selectedAnchorKey = getAnchorKey(change.hunks[0].header, change.hunks[0].lines[0]);
    const commentsWithRemovedThread: CommentsResponse = {
      current: [
        {
          commentId: "removed-current",
          fileId: "change-1",
          side: "old",
          oldLineNumber: 1,
          newLineNumber: null,
          hunkHeader: "@@ -1,2 +1,2 @@",
          body: "Removed note",
          createdAt: "2026-03-10T10:00:00.000Z",
          diffFingerprint: "fp"
        }
      ],
      outdated: []
    };

    const { container } = render(
      <DiffViewer
        change={change}
        comments={commentsWithRemovedThread}
        mode="unified"
        hideRemovedCode
        selectedAnchorKey={selectedAnchorKey}
        draftComment=""
        editingCommentId={null}
        editingBody=""
        submitting={false}
        pendingCommentActionId={null}
        onSelectLine={vi.fn()}
        onDraftCommentChange={vi.fn()}
        onSubmitComment={vi.fn()}
        onCancelNewComment={vi.fn()}
        onBeginEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onChangeEditingBody={vi.fn()}
        onSaveEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByText("before")).not.toBeInTheDocument();
    expect(screen.getByText("Removed note")).toBeInTheDocument();
    expect(container.querySelectorAll(".diff-row-removed")).toHaveLength(0);
  });
});
