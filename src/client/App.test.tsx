import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders changed files as a filesystem tree", async () => {
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 3,
          viewModeDefault: "unified"
        });
      }

      if (url === "/api/changes") {
        return jsonResponse([
          {
            changeId: "change-1",
            changeType: "modified",
            oldPath: "src/client/App.tsx",
            newPath: "src/client/App.tsx",
            isBinary: false,
            commentCounts: {
              current: 2,
              outdated: 0
            }
          },
          {
            changeId: "change-2",
            changeType: "modified",
            oldPath: "src/client/styles.css",
            newPath: "src/client/styles.css",
            isBinary: false,
            commentCounts: {
              current: 0,
              outdated: 0
            }
          },
          {
            changeId: "change-3",
            changeType: "added",
            oldPath: null,
            newPath: "README.md",
            isBinary: false,
            commentCounts: {
              current: 1,
              outdated: 0
            }
          }
        ]);
      }

      if (url === "/api/changes/change-1") {
        return jsonResponse({
          changeId: "change-1",
          changeType: "modified",
          oldPath: "src/client/App.tsx",
          newPath: "src/client/App.tsx",
          isBinary: false,
          diffFingerprint: "fp-1",
          hunks: []
        });
      }

      if (url === "/api/comments?changeId=change-1") {
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      if (url === "/api/changes/change-2") {
        return jsonResponse({
          changeId: "change-2",
          changeType: "modified",
          oldPath: "src/client/styles.css",
          newPath: "src/client/styles.css",
          isBinary: false,
          diffFingerprint: "fp-2",
          hunks: []
        });
      }

      if (url === "/api/comments?changeId=change-2") {
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      if (url === "/api/changes/change-3") {
        return jsonResponse({
          changeId: "change-3",
          changeType: "added",
          oldPath: null,
          newPath: "README.md",
          isBinary: false,
          diffFingerprint: "fp-3",
          hunks: []
        });
      }

      if (url === "/api/comments?changeId=change-3") {
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const folderButton = await screen.findByRole("button", { name: "src/client" });
    await screen.findByRole("heading", { level: 2, name: "src/client/App.tsx" });
    await screen.findByRole("heading", { level: 2, name: "src/client/styles.css" });
    await screen.findByRole("heading", { level: 2, name: "README.md" });
    const resizeHandle = screen.getByRole("separator", { name: "Resize changed files panel" });
    expect(folderButton).toHaveAttribute("aria-expanded", "true");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "448");
    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /styles\.css/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /README\.md/ })).toBeInTheDocument();
    expect(screen.getByLabelText("2 comments")).toBeInTheDocument();
    expect(screen.queryByText(/modified · 2/)).not.toBeInTheDocument();

    fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });
    expect(screen.getByRole("separator", { name: "Resize changed files panel" })).toHaveAttribute("aria-valuenow", "480");

    fireEvent.click(folderButton);
    expect(screen.getByRole("button", { name: "src/client" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src/client" }));
    expect(await screen.findByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();

    scrollIntoViewMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /styles\.css/ }));
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it("opens inline comments from line clicks while supporting edit and delete actions", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });

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

    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "tracked.txt" })).toBeInTheDocument());
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
