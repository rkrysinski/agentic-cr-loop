import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders changed files as a filesystem tree", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = parseRequestUrl(input);

      if (url.pathname === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 3,
          viewModeDefault: "unified"
        });
      }

      if (url.pathname === "/api/changes" && !url.search) {
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

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "full") {
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

      if (url.pathname === "/api/comments" && url.searchParams.get("changeId") === "change-1") {
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
    expect(screen.getByRole("combobox", { name: "Diff context" })).toHaveValue("full");
    const resizeHandle = screen.getByRole("separator", { name: "Resize changed files panel" });
    expect(folderButton).toHaveAttribute("aria-expanded", "true");
    expect(resizeHandle).toHaveAttribute("aria-valuenow", "240");
    expect(screen.getByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /styles\.css/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /README\.md/ })).toBeInTheDocument();
    expect(screen.getByLabelText("2 comments")).toBeInTheDocument();
    expect(screen.queryByText(/modified · 2/)).not.toBeInTheDocument();

    fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });
    expect(screen.getByRole("separator", { name: "Resize changed files panel" })).toHaveAttribute("aria-valuenow", "272");

    fireEvent.click(folderButton);
    expect(screen.getByRole("button", { name: "src/client" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /App\.tsx/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src/client" }));
    expect(await screen.findByRole("button", { name: /App\.tsx/ })).toBeInTheDocument();
  });

  it("opens inline comments from line clicks while supporting edit and delete actions", async () => {
    let commentsState = {
      current: [
        {
          commentId: "current",
          path: "tracked.txt",
          side: "new",
          lineNumber: 1,
          body: "Current note",
          diffFingerprint: "fp"
        }
      ],
      outdated: [
        {
          commentId: "outdated",
          path: "tracked.txt",
          side: "new",
          lineNumber: 1,
          body: "Old note",
          diffFingerprint: "stale"
        }
      ]
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseRequestUrl(input);

      if (url.pathname === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 1,
          viewModeDefault: "unified"
        });
      }

      if (url.pathname === "/api/changes" && !url.search) {
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

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "full") {
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

      if (url.pathname === "/api/comments" && url.searchParams.get("changeId") === "change-1") {
        return jsonResponse(commentsState);
      }

      if (url.pathname === "/api/comments" && init?.method === "POST") {
        return jsonResponse({
          commentId: "created",
          path: "tracked.txt",
          side: "new",
          lineNumber: 1,
          body: "saved",
          diffFingerprint: "fp"
        }, 201);
      }

      if (url.pathname === "/api/comments/current" && init?.method === "PATCH") {
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

      if (url.pathname === "/api/comments/outdated" && init?.method === "DELETE") {
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
    expect(screen.getByLabelText("Add comment for new line 1")).toHaveFocus();

    fireEvent.click(screen.getByText("stay"));
    expect(screen.getByLabelText("Add comment for new line 2")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "side_by_side" }));
    expect(screen.getByText("Old note")).toBeInTheDocument();
    expect(container.querySelectorAll(".line-clickable-cell")).toHaveLength(12);

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

  it("offers a unified-only toggle to hide removed code", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = parseRequestUrl(input);

      if (url.pathname === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 1,
          viewModeDefault: "unified"
        });
      }

      if (url.pathname === "/api/changes" && !url.search) {
        return jsonResponse([
          {
            changeId: "change-1",
            changeType: "modified",
            oldPath: "tracked.txt",
            newPath: "tracked.txt",
            isBinary: false,
            commentCounts: {
              current: 0,
              outdated: 0
            }
          }
        ]);
      }

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "full") {
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

      if (url.pathname === "/api/comments" && url.searchParams.get("changeId") === "change-1") {
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("tracked.txt")).toBeInTheDocument());

    const toggle = await screen.findByRole("button", { name: "hide_removed" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("before")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("before")).not.toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "side_by_side" }));
    expect(screen.queryByRole("button", { name: "hide_removed" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "unified" }));
    const toggleAfterReturn = screen.getByRole("button", { name: "hide_removed" });
    expect(toggleAfterReturn).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("before")).not.toBeInTheDocument();
  });

  it("defaults to full context and reloads the selected diff when the context option changes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = parseRequestUrl(input);

      if (url.pathname === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 1,
          viewModeDefault: "unified"
        });
      }

      if (url.pathname === "/api/changes" && !url.search) {
        return jsonResponse([
          {
            changeId: "change-1",
            changeType: "modified",
            oldPath: "tracked.txt",
            newPath: "tracked.txt",
            isBinary: false,
            commentCounts: {
              current: 0,
              outdated: 0
            }
          }
        ]);
      }

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "full") {
        return jsonResponse({
          changeId: "change-1",
          changeType: "modified",
          oldPath: "tracked.txt",
          newPath: "tracked.txt",
          isBinary: false,
          diffFingerprint: "fp",
          hunks: [
            {
              header: "@@ -1,4 +1,4 @@",
              lines: [
                { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "top", commentableSide: null },
                { kind: "removed", oldLineNumber: 2, newLineNumber: null, text: "before", commentableSide: "old" },
                { kind: "added", oldLineNumber: null, newLineNumber: 2, text: "after", commentableSide: "new" },
                { kind: "context", oldLineNumber: 3, newLineNumber: 3, text: "bottom", commentableSide: null }
              ]
            }
          ]
        });
      }

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "0") {
        return jsonResponse({
          changeId: "change-1",
          changeType: "modified",
          oldPath: "tracked.txt",
          newPath: "tracked.txt",
          isBinary: false,
          diffFingerprint: "fp",
          hunks: [
            {
              header: "@@ -2 +2 @@",
              lines: [
                { kind: "removed", oldLineNumber: 2, newLineNumber: null, text: "before", commentableSide: "old" },
                { kind: "added", oldLineNumber: null, newLineNumber: 2, text: "after", commentableSide: "new" }
              ]
            }
          ]
        });
      }

      if (url.pathname === "/api/comments" && url.searchParams.get("changeId") === "change-1") {
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      throw new Error(`Unhandled fetch: ${url.pathname}${url.search}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("top")).toBeInTheDocument());
    const contextSelect = screen.getByRole("combobox", { name: "Diff context" });
    expect(contextSelect).toHaveValue("full");

    fireEvent.change(contextSelect, { target: { value: "0" } });

    await waitFor(() => expect(screen.queryByText("top")).not.toBeInTheDocument());
    expect(screen.queryByText("bottom")).not.toBeInTheDocument();
    expect(screen.getByText("after")).toBeInTheDocument();
  });

  it("reloads the selected diff when refresh keeps the same file selected", async () => {
    let detailRequestCount = 0;
    let commentsRequestCount = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = parseRequestUrl(input);

      if (url.pathname === "/api/repo") {
        return jsonResponse({
          repoPath: "/repo",
          baseRef: "HEAD",
          changeCount: 1,
          viewModeDefault: "unified"
        });
      }

      if (url.pathname === "/api/changes" && !url.search) {
        return jsonResponse([
          {
            changeId: "change-1",
            changeType: "modified",
            oldPath: "tracked.txt",
            newPath: "tracked.txt",
            isBinary: false,
            commentCounts: {
              current: 0,
              outdated: 0
            }
          }
        ]);
      }

      if (url.pathname === "/api/changes/change-1" && url.searchParams.get("context") === "full") {
        detailRequestCount += 1;
        return jsonResponse({
          changeId: "change-1",
          changeType: "modified",
          oldPath: "tracked.txt",
          newPath: "tracked.txt",
          isBinary: false,
          diffFingerprint: "fp",
          hunks: [
            {
              header: "@@ -1 +1 @@",
              lines: [{ kind: "added", oldLineNumber: null, newLineNumber: 1, text: "after", commentableSide: "new" }]
            }
          ]
        });
      }

      if (url.pathname === "/api/comments" && url.searchParams.get("changeId") === "change-1") {
        commentsRequestCount += 1;
        return jsonResponse({
          current: [],
          outdated: []
        });
      }

      throw new Error(`Unhandled fetch: ${url.pathname}${url.search}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => expect(screen.getByText("after")).toBeInTheDocument());
    expect(detailRequestCount).toBe(1);
    expect(commentsRequestCount).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(detailRequestCount).toBe(2));
    await waitFor(() => expect(commentsRequestCount).toBe(2));
    await waitFor(() => expect(screen.getByText("after")).toBeInTheDocument());
    expect(screen.queryByText("Loading review data…")).not.toBeInTheDocument();
  });
});

function parseRequestUrl(input: RequestInfo | URL): URL {
  return new URL(String(input), "http://localhost");
}

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
