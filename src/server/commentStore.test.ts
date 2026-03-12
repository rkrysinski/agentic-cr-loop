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
      path: "tracked.txt",
      side: "new",
      lineNumber: 4,
      body: "Looks good",
      diffFingerprint: "fingerprint-1"
    });

    const comments = await store.list();
    const storageDir = path.join(repoPath, REVIEW_STORAGE_DIRECTORY);
    const sessionFiles = await fs.readdir(storageDir);
    const storedFile = JSON.parse(await fs.readFile(path.join(storageDir, sessionFileName), "utf8")) as Record<
      string,
      Array<{ side: string; line: number; body: string; diffFingerprint: string }>
    >;

    expect(sessionFiles).toHaveLength(1);
    expect(sessionFiles).toEqual([sessionFileName]);
    expect(storedFile).toEqual({
      "tracked.txt": [
        {
          side: "new",
          line: 4,
          body: "Looks good",
          diffFingerprint: "fingerprint-1"
        }
      ]
    });
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      commentId: created.commentId,
      path: "tracked.txt",
      lineNumber: 4,
      body: "Looks good"
    });
  });

  it("updates and deletes stored comments", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(repoPath);
    const sessionFileName = getReviewSessionFileName("b58557fe1d0");

    const store = new CommentStore(repoPath, sessionFileName);
    const created = await store.create({
      path: "tracked.txt",
      side: "new",
      lineNumber: 4,
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

  it("reads legacy comment files and normalizes them to the simplified schema", async () => {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "comment-store-"));
    createdDirectories.push(repoPath);
    const sessionFileName = getReviewSessionFileName("b58557fe1d0");
    const storageDir = path.join(repoPath, REVIEW_STORAGE_DIRECTORY);

    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(
      path.join(storageDir, sessionFileName),
      `${JSON.stringify({
        repoPath,
        comments: [
          {
            commentId: "legacy-id",
            fileId: "tracked.txt",
            side: "new",
            oldLineNumber: null,
            newLineNumber: 4,
            hunkHeader: "@@ -1,1 +1,2 @@",
            body: "Looks good",
            createdAt: "2026-03-10T10:00:00.000Z",
            diffFingerprint: "fingerprint-1"
          }
        ]
      })}\n`,
      "utf8"
    );

    const store = new CommentStore(repoPath, sessionFileName);

    await expect(store.list()).resolves.toMatchObject([
      {
        path: "tracked.txt",
        side: "new",
        lineNumber: 4,
        body: "Looks good",
        diffFingerprint: "fingerprint-1"
      }
    ]);
  });
});
