import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REVIEW_STORAGE_DIRECTORY } from "./commentStore.js";
import { readSession, resetSession, transitionSession, writeSession } from "./sessionStore.js";
import type { SessionState } from "./sessionStore.js";

let repoPath: string;

beforeEach(async () => {
  repoPath = await fs.mkdtemp(path.join(import.meta.dirname ?? "/tmp", "session-test-"));
});

afterEach(async () => {
  await fs.rm(repoPath, { recursive: true, force: true });
});

describe("sessionStore", () => {
  it("returns default agent-review state when session file is absent", async () => {
    const session = await readSession(repoPath);
    expect(session.status).toBe("agent-review");
    expect(session.iteration).toBe(1);
  });

  it("writeSession creates the file and readSession reads it back", async () => {
    const state: SessionState = {
      status: "human-review",
      iteration: 2,
      headId: "abc123",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    await writeSession(repoPath, state);

    const filePath = path.join(repoPath, REVIEW_STORAGE_DIRECTORY, "session.json");
    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content)).toMatchObject({ status: "human-review", iteration: 2 });

    const read = await readSession(repoPath);
    expect(read).toMatchObject(state);
  });

  it("transitionSession: agent-review → human-review succeeds", async () => {
    await writeSession(repoPath, {
      status: "agent-review",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = await transitionSession(repoPath, "human-review");
    expect(updated.status).toBe("human-review");
    expect(updated.iteration).toBe(1);
  });

  it("transitionSession: human-review → agent-addressing succeeds", async () => {
    await writeSession(repoPath, {
      status: "human-review",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = await transitionSession(repoPath, "agent-addressing");
    expect(updated.status).toBe("agent-addressing");
  });

  it("transitionSession: human-review → complete succeeds", async () => {
    await writeSession(repoPath, {
      status: "human-review",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = await transitionSession(repoPath, "complete");
    expect(updated.status).toBe("complete");
  });

  it("transitionSession: agent-addressing → agent-review increments iteration", async () => {
    await writeSession(repoPath, {
      status: "agent-addressing",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const updated = await transitionSession(repoPath, "agent-review");
    expect(updated.status).toBe("agent-review");
    expect(updated.iteration).toBe(2);
  });

  it("transitionSession: rejects invalid transitions", async () => {
    await writeSession(repoPath, {
      status: "agent-review",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(transitionSession(repoPath, "agent-addressing")).rejects.toThrow("Invalid transition");
    await expect(transitionSession(repoPath, "complete")).rejects.toThrow("Invalid transition");
  });

  it("transitionSession: rejects transition from complete", async () => {
    await writeSession(repoPath, {
      status: "complete",
      iteration: 1,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(transitionSession(repoPath, "agent-review")).rejects.toThrow("Invalid transition");
  });

  it("readSession returns default state when session file contains corrupted JSON", async () => {
    const filePath = path.join(repoPath, REVIEW_STORAGE_DIRECTORY, "session.json");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{"status":"comple', "utf8");

    const session = await readSession(repoPath);
    expect(session.status).toBe("agent-review");
    expect(session.iteration).toBe(1);
  });

  it("resetSession deletes session file and readSession returns default", async () => {
    await writeSession(repoPath, {
      status: "complete",
      iteration: 3,
      headId: "abc",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await resetSession(repoPath);

    const session = await readSession(repoPath);
    expect(session.status).toBe("agent-review");
    expect(session.iteration).toBe(1);
  });

  it("resetSession is a no-op when session file does not exist", async () => {
    await expect(resetSession(repoPath)).resolves.toBeUndefined();
  });
});
