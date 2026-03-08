import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommentStore } from "./commentStore.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("CommentStore", () => {
  it("persists comments in a deterministic session file", async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(storageDir);

    const store = new CommentStore("/tmp/repo", storageDir);
    const created = await store.create({
      fileId: "change-1",
      side: "new",
      oldLineNumber: null,
      newLineNumber: 4,
      hunkHeader: "@@ -1,1 +1,2 @@",
      body: "Looks good",
      diffFingerprint: "fingerprint-1"
    });

    const comments = await store.list();
    const sessionFiles = await fs.readdir(storageDir);

    expect(sessionFiles).toHaveLength(1);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      commentId: created.commentId,
      body: "Looks good",
      createdAt: created.createdAt
    });
  });

  it("updates and deletes stored comments", async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(storageDir);

    const store = new CommentStore("/tmp/repo", storageDir);
    const created = await store.create({
      fileId: "change-1",
      side: "new",
      oldLineNumber: null,
      newLineNumber: 4,
      hunkHeader: "@@ -1,1 +1,2 @@",
      body: "Looks good",
      diffFingerprint: "fingerprint-1"
    });

    const updated = await store.update(created.commentId, "Needs work");
    const deleted = await store.delete(created.commentId);

    expect(updated).toMatchObject({
      commentId: created.commentId,
      body: "Needs work"
    });
    expect(deleted).toBe(true);
    await expect(store.list()).resolves.toHaveLength(0);
  });
});
