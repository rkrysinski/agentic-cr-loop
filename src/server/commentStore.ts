import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ReviewComment } from "../shared/types.js";

type SessionFile = {
  repoPath: string;
  comments: ReviewComment[];
};

export const REVIEW_STORAGE_DIRECTORY = ".local-code-review";
const SESSION_FILE_NAME = "comments.json";

export class CommentStore {
  constructor(private readonly repoPath: string, private readonly storageDir = path.join(repoPath, REVIEW_STORAGE_DIRECTORY)) {}

  async list(): Promise<ReviewComment[]> {
    const session = await this.read();
    return session.comments;
  }

  async create(
    input: Omit<ReviewComment, "commentId" | "createdAt">
  ): Promise<ReviewComment> {
    const session = await this.read();
    const comment: ReviewComment = {
      ...input,
      commentId: randomUUID(),
      createdAt: new Date().toISOString()
    };

    session.comments.push(comment);
    await this.write(session);
    return comment;
  }

  async update(commentId: string, body: string): Promise<ReviewComment | null> {
    const session = await this.read();
    const index = session.comments.findIndex((comment) => comment.commentId === commentId);

    if (index === -1) {
      return null;
    }

    const updated = {
      ...session.comments[index],
      body
    };
    session.comments[index] = updated;
    await this.write(session);
    return updated;
  }

  async delete(commentId: string): Promise<boolean> {
    const session = await this.read();
    const nextComments = session.comments.filter((comment) => comment.commentId !== commentId);

    if (nextComments.length === session.comments.length) {
      return false;
    }

    session.comments = nextComments;
    await this.write(session);
    return true;
  }

  private async getSessionFilePath(): Promise<string> {
    await fs.mkdir(this.storageDir, { recursive: true });
    return path.join(this.storageDir, SESSION_FILE_NAME);
  }

  private async read(): Promise<SessionFile> {
    const sessionPath = await this.getSessionFilePath();

    try {
      const content = await fs.readFile(sessionPath, "utf8");
      return JSON.parse(content) as SessionFile;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          repoPath: this.repoPath,
          comments: []
        };
      }

      throw error;
    }
  }

  private async write(session: SessionFile): Promise<void> {
    const sessionPath = await this.getSessionFilePath();
    await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }
}
