import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("opens inline comments from line clicks while supporting edit and delete actions", async () => {
    let commentsState = {
      current: [
        {
          commentId: "current",
          fileId: "change-1",
          side: "new",
          oldLineNumber: null,
          newLineNumber: 1,
          hunkHeader: "@@ -1,2 +1,2 @@",
          body: "Current note",
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
          body: "Old note",
          createdAt: "2026-03-10T09:00:00.000Z",
          diffFingerprint: "stale"
        }
      ]
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 1,
          viewModeDefault: "unified"
        });
      }

      if (url === "/api/changes") {
        return jsonResponse([
          {
            changeId: "change-1",
            changeType: "modified",
            oldPath: "tracked.txt",
            newPath: "tracked.txt",
            isBinary: false,
            commentCounts: {
              current: 1,
              outdated: 1
            }
          }
        ]);
      }

      if (url === "/api/changes/change-1") {
        return jsonResponse({
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
                { kind: "removed", oldLineNumber: 1, newLineNumber: null, text: "before", commentableSide: "old" },
                { kind: "added", oldLineNumber: null, newLineNumber: 1, text: "after", commentableSide: "new" },
                { kind: "context", oldLineNumber: 2, newLineNumber: 2, text: "stay", commentableSide: null }
              ]
            }
          ]
        });
      }

      if (url === "/api/comments?changeId=change-1") {
        return jsonResponse(commentsState);
      }

      if (url === "/api/comments" && init?.method === "POST") {
        return jsonResponse({
          commentId: "created",
          fileId: "change-1",
          side: "new",
          oldLineNumber: null,
          newLineNumber: 1,
          hunkHeader: "@@ -1,2 +1,2 @@",
          body: "saved",
          createdAt: "2026-03-10T11:00:00.000Z",
          diffFingerprint: "fp"
        }, 201);
      }

      if (url === "/api/comments/current" && init?.method === "PATCH") {
        commentsState = {
          ...commentsState,
          current: commentsState.current.map((comment) =>
            comment.commentId === "current"
              ? {
                  ...comment,
                  body: "Updated note"
                }
              : comment
          )
        };
        return jsonResponse(commentsState.current[0]);
      }

      if (url === "/api/comments/outdated" && init?.method === "DELETE") {
        commentsState = {
          ...commentsState,
          outdated: []
        };
        return emptyResponse(204);
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByText("tracked.txt")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Old note")).toBeInTheDocument());
    expect(screen.getByText("Current note")).toBeInTheDocument();
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Comments" })).not.toBeInTheDocument();

    const sidebarToggle = screen.getByRole("button", { name: "Hide changed files" });
    fireEvent.click(sidebarToggle);
    expect(screen.getByRole("button", { name: "Show changed files" })).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".layout-sidebar-collapsed")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show changed files" }));
    expect(screen.getByRole("button", { name: "Hide changed files" })).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".layout-sidebar-collapsed")).toBeNull();

    fireEvent.click(screen.getByText("after"));
    expect(screen.getByLabelText("Add comment for new line 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByText("Old note")).toBeInTheDocument();
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(6);

    const currentCard = screen.getByText("Current note").closest("article");
    if (!currentCard) {
      throw new Error("Current comment card not found");
    }

    fireEvent.click(within(currentCard).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit comment current"), { target: { value: "Updated note" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Updated note")).toBeInTheDocument());
    expect(screen.queryByText("Current note")).not.toBeInTheDocument();

    const outdatedCard = screen.getByText("Old note").closest("article");
    if (!outdatedCard) {
      throw new Error("Outdated comment card not found");
    }

    fireEvent.click(within(outdatedCard).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Old note")).not.toBeInTheDocument());
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => undefined
  } as Response;
}
