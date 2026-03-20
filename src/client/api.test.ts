import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, getRepos, registerRepo } from "./api.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ── helpers ──────────────────────────────────────────────────

function jsonFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body
  } as Response);
}

function textFetch(body: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/plain" : null) },
    text: async () => body
  } as Response);
}

function emptyFetch(status = 204) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => undefined
  } as Response);
}

function errorFetch(status: number, errorBody: unknown) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => errorBody
  } as Response);
}

// ── getRepos ─────────────────────────────────────────────────

describe("getRepos", () => {
  it("calls GET /api/repos and returns the repo list", async () => {
    const stub = jsonFetch([{ id: "my-repo", path: "/repos/my-repo" }]);
    vi.stubGlobal("fetch", stub);

    const repos = await getRepos();
    expect(repos).toEqual([{ id: "my-repo", path: "/repos/my-repo" }]);
    expect(stub).toHaveBeenCalledWith("/api/repos", undefined);
  });
});

// ── registerRepo ─────────────────────────────────────────────

describe("registerRepo", () => {
  it("calls POST /api/repos with path and optional id", async () => {
    const stub = jsonFetch({ id: "backend", path: "/repos/backend" }, 201);
    vi.stubGlobal("fetch", stub);

    const repo = await registerRepo("/repos/backend", "backend");
    expect(repo).toEqual({ id: "backend", path: "/repos/backend" });
    expect(stub).toHaveBeenCalledWith(
      "/api/repos",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((stub.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ path: "/repos/backend", id: "backend" });
  });

  it("omits id from the body when not supplied", async () => {
    const stub = jsonFetch({ id: "backend", path: "/repos/backend" }, 201);
    vi.stubGlobal("fetch", stub);

    await registerRepo("/repos/backend");
    const body = JSON.parse((stub.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ path: "/repos/backend" });
    expect(body.id).toBeUndefined();
  });
});

// ── request error handling ───────────────────────────────────

describe("request error handling", () => {
  it("throws an Error with the server error message on non-ok JSON responses", async () => {
    vi.stubGlobal("fetch", errorFetch(400, { error: "Not a git repository" }));
    await expect(getRepos()).rejects.toThrow("Not a git repository");
  });

  it("throws an Error with a fallback message when the error body is unrecognisable", async () => {
    vi.stubGlobal("fetch", errorFetch(500, null));
    await expect(getRepos()).rejects.toThrow("Request failed with 500");
  });
});

// ── parseResponseBody — 204 ───────────────────────────────────

describe("204 response handling", () => {
  it("returns undefined for a 204 No Content response", async () => {
    vi.stubGlobal("fetch", emptyFetch(204));
    const client = createApiClient("my-repo");
    const result = await client.deleteComment("cmt-1");
    expect(result).toBeUndefined();
  });
});

// ── parseResponseBody — text/plain ───────────────────────────

describe("text/plain response handling", () => {
  it("returns the raw text for text/plain content-type", async () => {
    vi.stubGlobal("fetch", textFetch("hello export"));
    const client = createApiClient("my-repo");
    const result = await client.exportComments();
    expect(result).toBe("hello export");
  });
});

// ── createApiClient ───────────────────────────────────────────

describe("createApiClient", () => {
  const client = createApiClient("test-repo");

  it("getRepo calls the correct URL", async () => {
    const stub = jsonFetch({ id: "test-repo", path: "/r", baseRef: "HEAD", changeCount: 0 });
    vi.stubGlobal("fetch", stub);
    await client.getRepo();
    expect(stub).toHaveBeenCalledWith("/api/repos/test-repo/repo", undefined);
  });

  it("getChanges calls the correct URL", async () => {
    const stub = jsonFetch([]);
    vi.stubGlobal("fetch", stub);
    await client.getChanges();
    expect(stub).toHaveBeenCalledWith("/api/repos/test-repo/changes", undefined);
  });

  it("getChange encodes changeId and context", async () => {
    const stub = jsonFetch({});
    vi.stubGlobal("fetch", stub);
    await client.getChange("change/1", "full");
    expect(stub).toHaveBeenCalledWith(
      "/api/repos/test-repo/changes/change%2F1?context=full",
      undefined
    );
  });

  it("getComments encodes changeId as a query param", async () => {
    const stub = jsonFetch({ current: [], outdated: [] });
    vi.stubGlobal("fetch", stub);
    await client.getComments("change/1");
    expect(stub).toHaveBeenCalledWith(
      "/api/repos/test-repo/comments?changeId=change%2F1",
      undefined
    );
  });

  it("createComment sends POST with JSON body", async () => {
    const stub = jsonFetch({}, 201);
    vi.stubGlobal("fetch", stub);
    await client.createComment({ changeId: "c1", side: "new", lineNumber: 5, body: "note" });
    expect(stub).toHaveBeenCalledWith(
      "/api/repos/test-repo/comments",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((stub.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ changeId: "c1", side: "new", lineNumber: 5, body: "note" });
  });

  it("updateComment sends PATCH with JSON body", async () => {
    const stub = jsonFetch({});
    vi.stubGlobal("fetch", stub);
    await client.updateComment("cmt-1", { body: "updated" });
    expect(stub).toHaveBeenCalledWith(
      "/api/repos/test-repo/comments/cmt-1",
      expect.objectContaining({ method: "PATCH" })
    );
    const body = JSON.parse((stub.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ body: "updated" });
  });

  it("deleteComment sends DELETE", async () => {
    vi.stubGlobal("fetch", emptyFetch(204));
    await client.deleteComment("cmt-1");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/repos/test-repo/comments/cmt-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
