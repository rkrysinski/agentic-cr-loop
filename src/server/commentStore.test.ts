import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommentStore, REVIEW_STORAGE_DIRECTORY, getReviewSessionFileName } from "./commentStore.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("CommentStore", () => {
  it("persists comments in the repository-local review directory using the review base file name", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(repoPath);
    const sessionFileName = getReviewSessionFileName("b58557fe1d0");

    const store = new CommentStore(repoPath, sessionFileName);
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
    const storageDir = path.join(repoPath, REVIEW_STORAGE_DIRECTORY);
    const sessionFiles = await fs.readdir(storageDir);

    expect(sessionFiles).toHaveLength(1);
    expect(sessionFiles).toEqual([sessionFileName]);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      commentId: created.commentId,
      body: "Looks good",
      createdAt: created.createdAt
    });
  });

  it("updates and deletes stored comments", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(repoPath);
    const sessionFileName = getReviewSessionFileName("b58557fe1d0");

    const store = new CommentStore(repoPath, sessionFileName);
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
