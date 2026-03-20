import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_STORAGE_DIRECTORY, getReviewSessionFileName } from "./commentStore.js";
import { startServer } from "./server.js";
import { createTempGitRepo, runGit } from "./testUtils.js";

let repoPath: string;

beforeEach(async () => {
  repoPath = await createTempGitRepo();
});

afterEach(async () => {
  await fs.rm(repoPath, { recursive: true, force: true });
});

describe("server API", () => {
  it("lists tracked and untracked changes and supports editing and deleting comments", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const headShortId = runGit(repoPath, ["rev-parse", "--short=12", "HEAD"]).trim();
    const sessionFileName = getReviewSessionFileName(headShortId);

    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    expect(changesResponse.statusCode).toBe(200);
    expect(changesResponse.body.some((change: { changeType: string; newPath: string | null }) => change.changeType === "modified")).toBe(true);
    expect(changesResponse.body.some((change: { changeType: string; newPath: string | null }) => change.newPath === "untracked.txt")).toBe(true);

    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    expect(detailResponse.statusCode).toBe(200);
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    const createResponse = await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        lineNumber: line.newLineNumber,
        body: "Check wording"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect((createResponse.body as { body: string }).body).toBe("Check wording");

    const updateResponse = await invokeRoute(app, "patch", "/api/repos/test/comments/:commentId", {
      params: { commentId: (createResponse.body as { commentId: string }).commentId },
      body: { body: "Updated wording" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect((updateResponse.body as { body: string }).body).toBe("Updated wording");

    const commentsResponse = await invokeRoute(app, "get", "/api/repos/test/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(commentsResponse.statusCode).toBe(200);
    expect(commentsResponse.body.current).toHaveLength(1);
    expect(commentsResponse.body.current[0].body).toBe("Updated wording");
    expect(commentsResponse.body.outdated).toHaveLength(0);

    const storedSession = JSON.parse(
      await fs.readFile(path.join(repoPath, REVIEW_STORAGE_DIRECTORY, sessionFileName), "utf8")
    ) as Record<string, Array<{ id: string; body: string; line: number; side: string }>>;
    expect(storedSession["tracked.txt"]).toHaveLength(1);
    expect(storedSession["tracked.txt"]?.[0]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{12}$/),
      body: "Updated wording",
      line: 1,
      side: "new"
    });

    const refreshedChangesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    expect(refreshedChangesResponse.statusCode).toBe(200);
    expect(
      refreshedChangesResponse.body.some((change: { newPath: string | null; oldPath: string | null }) =>
        [change.newPath, change.oldPath].includes(`${REVIEW_STORAGE_DIRECTORY}/${sessionFileName}`)
      )
    ).toBe(false);

    const deleteResponse = await invokeRoute(app, "delete", "/api/repos/test/comments/:commentId", {
      params: { commentId: (createResponse.body as { commentId: string }).commentId }
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDeleteResponse = await invokeRoute(app, "get", "/api/repos/test/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(afterDeleteResponse.statusCode).toBe(200);
    expect(afterDeleteResponse.body.current).toHaveLength(0);
    expect(afterDeleteResponse.body.outdated).toHaveLength(0);
  });

  it("marks comments outdated when the diff fingerprint changes", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });

    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    const createResponse = await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        lineNumber: line.newLineNumber,
        body: "Will go stale"
      }
    });
    expect(createResponse.statusCode).toBe(201);

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "another\nstay\n", "utf8");

    const staleResponse = await invokeRoute(app, "get", "/api/repos/test/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(staleResponse.statusCode).toBe(200);
    expect(staleResponse.body.current).toHaveLength(0);
    expect(staleResponse.body.outdated).toHaveLength(1);
  });

  it("returns different detail context without changing comment currency", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });

    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const fullDetailResponse = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: trackedChange.changeId },
      query: { context: "full" }
    });
    const noContextResponse = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: trackedChange.changeId },
      query: { context: "0" }
    });

    expect(fullDetailResponse.statusCode).toBe(200);
    expect(noContextResponse.statusCode).toBe(200);
    expect(fullDetailResponse.body.hunks[0].lines.length).toBeGreaterThan(noContextResponse.body.hunks[0].lines.length);

    const line = fullDetailResponse.body.hunks[0].lines.find((entry: { kind: string }) => entry.kind === "context");
    const createResponse = await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        lineNumber: line.newLineNumber,
        body: "Still current"
      }
    });

    expect(createResponse.statusCode).toBe(201);

    const commentsResponse = await invokeRoute(app, "get", "/api/repos/test/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(commentsResponse.statusCode).toBe(200);
    expect(commentsResponse.body.current).toHaveLength(1);
    expect(commentsResponse.body.outdated).toHaveLength(0);
  });

  it("exports orphaned stale comments even after a file leaves the diff", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        lineNumber: line.newLineNumber,
        body: "Persist in export"
      }
    });

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "before\nstay\n", "utf8");

    const exportResponse = await invokeRoute(app, "get", "/api/repos/test/export/comments.txt");
    expect(exportResponse.headers["content-type"]).toBe("text/plain");
    expect(exportResponse.body).toContain("REVIEW tracked.txt");
    expect(exportResponse.body).toContain("NOTE");
    expect(exportResponse.body).toContain("SIDE new LINE 1 STATUS outdated");
    expect(exportResponse.body).toContain("Persist in export");
    expect(exportResponse.body).toContain("END NOTE");
  });

  it("GET /api/repos returns array with registered repo", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "get", "/api/repos");
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: "test" })]));
  });

  it("returns 404 for unknown repoId", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "get", "/api/repos/nonexistent/changes");
    expect(response.statusCode).toBe(404);
  });

  it("POST /api/repos with a valid second repo path returns 201 and repo appears in GET /api/repos", async () => {
    const secondRepoPath = await createTempGitRepo();
    try {
      const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
      const postResponse = await invokeRoute(app, "post", "/api/repos", {
        body: { path: secondRepoPath, id: "second" }
      });
      expect(postResponse.statusCode).toBe(201);
      expect(postResponse.body).toMatchObject({ id: "second", path: secondRepoPath });

      const listResponse = await invokeRoute(app, "get", "/api/repos");
      expect(listResponse.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "test" }),
          expect.objectContaining({ id: "second" })
        ])
      );
    } finally {
      await fs.rm(secondRepoPath, { recursive: true, force: true });
    }
  });

  it("POST /api/repos with already-registered id returns 409", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "post", "/api/repos", {
      body: { path: repoPath, id: "test" }
    });
    expect(response.statusCode).toBe(409);
  });

  it("POST /api/repos with a non-git path returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "post", "/api/repos", {
      body: { path: "/tmp", id: "notgit" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("DELETE /api/repos/:repoId removes repo; subsequent request returns 404", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const deleteResponse = await invokeRoute(app, "delete", "/api/repos/:repoId", {
      params: { repoId: "test" }
    });
    expect(deleteResponse.statusCode).toBe(204);

    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    expect(changesResponse.statusCode).toBe(404);
  });

  it("DELETE /api/repos/:repoId with nonexistent id returns 404", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "delete", "/api/repos/:repoId", {
      params: { repoId: "nonexistent" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST /api/server/stop returns 204 and schedules process exit", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      const response = await invokeRoute(app, "post", "/api/server/stop");
      expect(response.statusCode).toBe(204);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("GET /api/repos/:repoId/repo returns repo info with changeCount", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "get", "/api/repos/test/repo");
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      id: "test",
      baseRef: "HEAD"
    });
    expect(typeof (response.body as { changeCount: number }).changeCount).toBe("number");
  });

  it("GET /api/repos/:repoId/changes/:changeId with invalid context returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    const trackedChange = (changesResponse.body as Array<{ newPath: string | null; changeId: string }>).find(
      (c) => c.newPath === "tracked.txt"
    );

    try {
      await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
        params: { changeId: trackedChange!.changeId },
        query: { context: "invalid" }
      });
      expect.fail("Expected route to throw");
    } catch (error: unknown) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain("Invalid diff context");
    }
  });

  it("GET /api/repos/:repoId/changes/:changeId with unknown changeId returns 404", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "get", "/api/repos/test/changes/:changeId", {
      params: { changeId: "nonexistent" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("GET /api/repos/:repoId/comments without changeId returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "get", "/api/repos/test/comments");
    expect(response.statusCode).toBe(400);
  });

  it("POST /api/repos/:repoId/comments with invalid body returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: { changeId: "c1", side: "bad-side", lineNumber: 1, body: "note" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /api/repos/:repoId/comments with empty body returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const changesResponse = await invokeRoute(app, "get", "/api/repos/test/changes");
    const trackedChange = (changesResponse.body as Array<{ newPath: string | null; changeId: string }>).find(
      (c) => c.newPath === "tracked.txt"
    );
    const response = await invokeRoute(app, "post", "/api/repos/test/comments", {
      body: { changeId: trackedChange!.changeId, side: "new", lineNumber: 1, body: "   " }
    });
    expect(response.statusCode).toBe(400);
  });

  it("PATCH /api/repos/:repoId/comments/:commentId with nonexistent id returns 404", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "patch", "/api/repos/test/comments/:commentId", {
      params: { commentId: "does-not-exist" },
      body: { body: "new text" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("PATCH /api/repos/:repoId/comments/:commentId with empty body returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "patch", "/api/repos/test/comments/:commentId", {
      params: { commentId: "any" },
      body: { body: "   " }
    });
    expect(response.statusCode).toBe(400);
  });

  it("DELETE /api/repos/:repoId/comments/:commentId with nonexistent id returns 404", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "delete", "/api/repos/test/comments/:commentId", {
      params: { commentId: "does-not-exist" }
    });
    expect(response.statusCode).toBe(404);
  });

  it("POST /api/repos with missing path returns 400", async () => {
    const { app } = await startServer({ repos: [{ id: "test", path: repoPath }], port: 3000 }, { dev: true });
    const response = await invokeRoute(app, "post", "/api/repos", {
      body: { id: "noop" }
    });
    expect(response.statusCode).toBe(400);
  });
});

// ── Route invocation helper ──────────────────────────────────

type AnyLayer = {
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
  handle?: {
    stack?: AnyLayer[];
  };
};

async function invokeRoute(
  app: import("express").Express,
  method: "get" | "post" | "patch" | "delete",
  pathPattern: string,
  options: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  } = {}
): Promise<{ statusCode: number; body: unknown; headers: Record<string, string> }> {
  const allLayers = (app as unknown as { router: { stack: AnyLayer[] } }).router.stack;

  let layer: AnyLayer | undefined;
  let params = { ...options.params };
  let isNestedRoute = false;

  // Try exact match on top-level routes first
  layer = allLayers.find(
    (entry) => entry.route?.path === pathPattern && entry.route.methods?.[method]
  );

  // If not found, try to resolve as /api/repos/{repoId}/{relPath}
  if (!layer) {
    const match = /^\/api\/repos\/([^/:][^/]*)((?:\/[^/]+)*)$/.exec(pathPattern);
    if (match) {
      const repoId = match[1]!;
      const relPath = match[2] || undefined;
      params = { repoId, ...params };

      if (!relPath) {
        // Top-level route like DELETE /api/repos/:repoId
        layer = allLayers.find(
          (entry) => entry.route?.path === "/api/repos/:repoId" && entry.route.methods?.[method]
        );
      } else {
        // Search in nested router stacks for the relative path
        for (const mwLayer of allLayers) {
          if (!mwLayer.route && mwLayer.handle?.stack) {
            const found = mwLayer.handle.stack.find(
              (entry) => entry.route?.path === relPath && entry.route.methods?.[method]
            );
            if (found) {
              layer = found;
              isNestedRoute = true;
              break;
            }
          }
        }
      }
    }
  }

  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${pathPattern}`);
  }

  let statusCode = 200;
  let body: unknown;
  const headers: Record<string, string> = {};
  let nextError: unknown;
  const locals: Record<string, unknown> = {};

  const request = {
    params,
    query: options.query ?? {},
    body: options.body ?? {}
  };

  const response = {
    locals,
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
    send(payload: unknown) {
      body = payload;
      return this;
    },
    type(value: string) {
      headers["content-type"] = value;
      return this;
    }
  };

  // Run nested router middleware (e.g. repo lookup) before the route handler
  if (isNestedRoute) {
    for (const mwLayer of allLayers) {
      if (!mwLayer.route && mwLayer.handle?.stack) {
        for (const subLayer of mwLayer.handle.stack) {
          if (!subLayer.route && typeof (subLayer as { handle?: Function }).handle === "function") {
            let middlewareDone = false;
            await (subLayer as { handle: Function }).handle(
              request,
              response,
              (error?: unknown) => {
                if (error) nextError = error;
                middlewareDone = true;
              }
            );
            if (nextError || !middlewareDone) {
              return { statusCode, body, headers };
            }
          }
        }
      }
    }
  }

  await layer.route.stack[0].handle(
    request,
    response,
    (error?: unknown) => {
      nextError = error;
    }
  );

  if (nextError) {
    throw nextError;
  }

  return {
    statusCode,
    body,
    headers
  };
}
