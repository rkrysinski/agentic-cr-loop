import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "./server.js";
import { createTempGitRepo } from "./testUtils.js";

let homeDir: string;
let repoPath: string;

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "review-home-"));
  process.env.HOME = homeDir;
  process.env.XDG_DATA_HOME = path.join(homeDir, ".local", "share");
  repoPath = await createTempGitRepo();
});

afterEach(async () => {
  await fs.rm(homeDir, { recursive: true, force: true });
  await fs.rm(repoPath, { recursive: true, force: true });
});

describe("server API", () => {
  it("lists tracked and untracked changes and supports editing and deleting comments", async () => {
    const { app } = await startServer({ repoPath, port: 3000 }, { dev: true });

    const changesResponse = await invokeRoute(app, "get", "/api/changes");
    expect(changesResponse.statusCode).toBe(200);
    expect(changesResponse.body.some((change: { changeType: string; newPath: string | null }) => change.changeType === "modified")).toBe(true);
    expect(changesResponse.body.some((change: { changeType: string; newPath: string | null }) => change.newPath === "untracked.txt")).toBe(true);

    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    expect(detailResponse.statusCode).toBe(200);
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    const createResponse = await invokeRoute(app, "post", "/api/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        oldLineNumber: line.oldLineNumber,
        newLineNumber: line.newLineNumber,
        hunkHeader: detailResponse.body.hunks[0].header,
        body: "Check wording"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    expect((createResponse.body as { body: string }).body).toBe("Check wording");

    const updateResponse = await invokeRoute(app, "patch", "/api/comments/:commentId", {
      params: { commentId: (createResponse.body as { commentId: string }).commentId },
      body: { body: "Updated wording" }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect((updateResponse.body as { body: string }).body).toBe("Updated wording");

    const commentsResponse = await invokeRoute(app, "get", "/api/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(commentsResponse.statusCode).toBe(200);
    expect(commentsResponse.body.current).toHaveLength(1);
    expect(commentsResponse.body.current[0].body).toBe("Updated wording");
    expect(commentsResponse.body.outdated).toHaveLength(0);

    const deleteResponse = await invokeRoute(app, "delete", "/api/comments/:commentId", {
      params: { commentId: (createResponse.body as { commentId: string }).commentId }
    });
    expect(deleteResponse.statusCode).toBe(204);

    const afterDeleteResponse = await invokeRoute(app, "get", "/api/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(afterDeleteResponse.statusCode).toBe(200);
    expect(afterDeleteResponse.body.current).toHaveLength(0);
    expect(afterDeleteResponse.body.outdated).toHaveLength(0);
  });

  it("marks comments outdated when the diff fingerprint changes", async () => {
    const { app } = await startServer({ repoPath, port: 3000 }, { dev: true });

    const changesResponse = await invokeRoute(app, "get", "/api/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    const createResponse = await invokeRoute(app, "post", "/api/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        oldLineNumber: line.oldLineNumber,
        newLineNumber: line.newLineNumber,
        hunkHeader: detailResponse.body.hunks[0].header,
        body: "Will go stale"
      }
    });
    expect(createResponse.statusCode).toBe(201);

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "another\nstay\n", "utf8");

    const staleResponse = await invokeRoute(app, "get", "/api/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(staleResponse.statusCode).toBe(200);
    expect(staleResponse.body.current).toHaveLength(0);
    expect(staleResponse.body.outdated).toHaveLength(1);
  });

  it("returns different detail context without changing comment currency", async () => {
    const { app } = await startServer({ repoPath, port: 3000 }, { dev: true });

    const changesResponse = await invokeRoute(app, "get", "/api/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const fullDetailResponse = await invokeRoute(app, "get", "/api/changes/:changeId", {
      params: { changeId: trackedChange.changeId },
      query: { context: "full" }
    });
    const noContextResponse = await invokeRoute(app, "get", "/api/changes/:changeId", {
      params: { changeId: trackedChange.changeId },
      query: { context: "0" }
    });

    expect(fullDetailResponse.statusCode).toBe(200);
    expect(noContextResponse.statusCode).toBe(200);
    expect(fullDetailResponse.body.hunks[0].lines.length).toBeGreaterThan(noContextResponse.body.hunks[0].lines.length);

    const line = fullDetailResponse.body.hunks[0].lines.find((entry: { kind: string }) => entry.kind === "context");
    const createResponse = await invokeRoute(app, "post", "/api/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        oldLineNumber: line.oldLineNumber,
        newLineNumber: line.newLineNumber,
        hunkHeader: fullDetailResponse.body.hunks[0].header,
        body: "Still current"
      }
    });

    expect(createResponse.statusCode).toBe(201);

    const commentsResponse = await invokeRoute(app, "get", "/api/comments", {
      query: { changeId: trackedChange.changeId }
    });
    expect(commentsResponse.statusCode).toBe(200);
    expect(commentsResponse.body.current).toHaveLength(1);
    expect(commentsResponse.body.outdated).toHaveLength(0);
  });

  it("exports orphaned stale comments even after a file leaves the diff", async () => {
    const { app } = await startServer({ repoPath, port: 3000 }, { dev: true });
    const changesResponse = await invokeRoute(app, "get", "/api/changes");
    const trackedChange = changesResponse.body.find((change: { newPath: string | null }) => change.newPath === "tracked.txt");
    const detailResponse = await invokeRoute(app, "get", "/api/changes/:changeId", {
      params: { changeId: trackedChange.changeId }
    });
    const line = detailResponse.body.hunks[0].lines.find((entry: { commentableSide: string | null }) => entry.commentableSide === "new");

    await invokeRoute(app, "post", "/api/comments", {
      body: {
        changeId: trackedChange.changeId,
        side: "new",
        oldLineNumber: line.oldLineNumber,
        newLineNumber: line.newLineNumber,
        hunkHeader: detailResponse.body.hunks[0].header,
        body: "Persist in export"
      }
    });

    await fs.writeFile(path.join(repoPath, "tracked.txt"), "before\nstay\n", "utf8");

    const exportResponse = await invokeRoute(app, "get", "/api/export/comments.md");
    expect(exportResponse.headers["content-type"]).toBe("text/markdown");
    expect(exportResponse.body).toContain("REVIEW tracked.txt");
    expect(exportResponse.body).toContain("NOTE");
    expect(exportResponse.body).toContain("Persist in export");
    expect(exportResponse.body).toContain("END NOTE");
  });
});

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
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean>; stack: Array<{ handle: Function }> } }) =>
      entry.route?.path === pathPattern && entry.route.methods?.[method]
  );

  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${pathPattern}`);
  }

  let statusCode = 200;
  let body: unknown;
  const headers: Record<string, string> = {};
  let nextError: unknown;

  const response = {
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

  await layer.route.stack[0].handle(
    {
      params: options.params ?? {},
      query: options.query ?? {},
      body: options.body ?? {}
    },
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
