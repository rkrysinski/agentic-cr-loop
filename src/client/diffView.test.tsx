import { render, screen } from "@testing-library/react";
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
  it("renders comments inline while keeping outdated comments out of badges", () => {
    const selectedAnchorKey = getAnchorKey(change.hunks[0].header, change.hunks[0].lines[1]);
    const { container, rerender } = render(
      <DiffViewer
        change={change}
        comments={comments}
        mode="unified"
        selectedAnchorKey={selectedAnchorKey}
        draftComment="Draft comment"
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

    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(2);
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(1);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Outdated", { selector: ".comment-status" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add comment for new line 1")).toHaveValue("Draft comment");

    rerender(
      <DiffViewer
        change={change}
        comments={comments}
        mode="side-by-side"
        selectedAnchorKey={selectedAnchorKey}
        draftComment="Draft comment"
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

    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(2);
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(1);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Outdated", { selector: ".comment-status" })).toBeInTheDocument();
  });
});
