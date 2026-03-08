import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("keeps outdated comments out of inline markers while showing them in the panel", async () => {
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
        return jsonResponse({
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
        });
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

      throw new Error(`Unhandled fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByText("tracked.txt")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Old note")).toBeInTheDocument());
    expect(screen.getByText("Current note")).toBeInTheDocument();
    expect(container.querySelectorAll(".comment-badge")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByText("Old note")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Comment" })).toHaveLength(2);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}
