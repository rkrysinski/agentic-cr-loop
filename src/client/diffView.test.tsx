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

const syntaxChange: FileChange = {
  ...change,
  oldPath: "src/App.tsx",
  newPath: "src/App.tsx",
  hunks: [
    {
      header: "@@ -1,1 +1,1 @@",
      lines: [
        {
          kind: "removed",
          oldLineNumber: 1,
          newLineNumber: null,
          text: "const before = 1;",
          commentableSide: "old"
        },
        {
          kind: "added",
          oldLineNumber: null,
          newLineNumber: 1,
          text: "const after = 2;",
          commentableSide: "new"
        }
      ]
    }
  ]
};

const comments: CommentsResponse = {
  current: [
    {
      commentId: "current",
      path: "tracked.txt",
      side: "new",
      lineNumber: 1,
      body: "Current",
      diffFingerprint: "fp"
    }
  ],
  outdated: [
    {
      commentId: "outdated",
      path: "tracked.txt",
      side: "new",
      lineNumber: 1,
      body: "Outdated",
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
    const selectedAnchorKey = getAnchorKey(change.hunks[0].lines[1], "new");
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

    expect(container.querySelectorAll(".diff-row-clickable")).toHaveLength(3);
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(0);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Outdated", { selector: ".comment-status" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add comment for new line 1")).toHaveValue("Draft comment");

    fireEvent.click(screen.getByText("before"));
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "old",
      lineNumber: 1
    });

    fireEvent.click(screen.getByText("stay"));
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "new",
      lineNumber: 2
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
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(12);
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
      lineNumber: 1
    });

    fireEvent.click(screen.getAllByText("stay")[0]);
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "old",
      lineNumber: 2
    });
  });

  it("renders syntax tokens for supported file types while keeping line selection working", () => {
    const onSelectLine = vi.fn();
    const selectedAnchorKey = getAnchorKey(syntaxChange.hunks[0].lines[1], "new");
    const { container, rerender } = render(
      <DiffViewer
        change={syntaxChange}
        comments={comments}
        mode="unified"
        hideRemovedCode={false}
        selectedAnchorKey={selectedAnchorKey}
        draftComment=""
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

    expect(container.querySelector(".diff-syntax")).not.toBeNull();
    expect(container.querySelectorAll(".token.keyword").length).toBeGreaterThan(0);
    expect(screen.getAllByText("const").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("const")[0]);
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "old",
      lineNumber: 1
    });

    rerender(
      <DiffViewer
        change={syntaxChange}
        comments={comments}
        mode="side-by-side"
        hideRemovedCode={false}
        selectedAnchorKey={selectedAnchorKey}
        draftComment=""
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

    fireEvent.click(screen.getAllByText("const")[1]);
    expect(onSelectLine).toHaveBeenCalledWith({
      side: "new",
      lineNumber: 1
    });
  });

  it("falls back to plain text for unsupported file types", () => {
    const { container } = render(
      <DiffViewer
        change={change}
        comments={{ current: [], outdated: [] }}
        mode="unified"
        hideRemovedCode={false}
        selectedAnchorKey={null}
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

    expect(screen.getByText("before")).toBeInTheDocument();
    expect(container.querySelector(".diff-syntax")).toBeNull();
  });

  it("hides removed rows in unified mode while preserving existing threads", () => {
    const selectedAnchorKey = getAnchorKey(change.hunks[0].lines[0], "old");
    const commentsWithRemovedThread: CommentsResponse = {
      current: [
        {
          commentId: "removed-current",
          path: "tracked.txt",
          side: "old",
          lineNumber: 1,
          body: "Removed note",
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
