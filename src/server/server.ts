import http from "node:http";
import path from "node:path";
import express from "express";
import type { CreateCommentRequest, UpdateCommentRequest } from "../shared/api.js";
import { ReviewService } from "./reviewService.js";

type StartOptions = {
  dev?: boolean;
};

export async function startServer(
  { repoPath, port }: { repoPath: string; port: number },
  options: StartOptions = {}
): Promise<{ app: express.Express; server: http.Server; port: number }> {
  const reviewService = new ReviewService(repoPath);
  await reviewService.validateRepository();

  const app = express();
  app.use(express.json());

  app.get("/api/repo", async (_request, response, next) => {
    try {
      response.json(await reviewService.getRepoInfo());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/changes", async (_request, response, next) => {
    try {
      response.json(await reviewService.getChangeSummaries());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/changes/:changeId", async (request, response, next) => {
    try {
      const change = await reviewService.getChange(request.params.changeId);
      if (!change) {
        response.status(404).json({ error: "Change not found" });
        return;
      }

      response.json(change);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/comments", async (request, response, next) => {
    try {
      const changeId = request.query.changeId;
      if (typeof changeId !== "string") {
        response.status(400).json({ error: "Missing changeId" });
        return;
      }

      response.json(await reviewService.getComments(changeId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/comments", async (request, response, next) => {
    try {
      const body = request.body as Partial<CreateCommentRequest>;

      if (
        typeof body.changeId !== "string" ||
        (body.side !== "old" && body.side !== "new") ||
        typeof body.hunkHeader !== "string" ||
        typeof body.body !== "string" ||
        body.body.trim().length === 0
      ) {
        response.status(400).json({ error: "Invalid comment payload" });
        return;
      }

      response.status(201).json(
        await reviewService.createComment({
          changeId: body.changeId,
          side: body.side,
          oldLineNumber: body.oldLineNumber ?? null,
          newLineNumber: body.newLineNumber ?? null,
          hunkHeader: body.hunkHeader,
          body: body.body
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/comments/:commentId", async (request, response, next) => {
    try {
      const { commentId } = request.params;
      const body = request.body as Partial<UpdateCommentRequest>;

      if (typeof commentId !== "string" || typeof body.body !== "string" || body.body.trim().length === 0) {
        response.status(400).json({ error: "Invalid comment payload" });
        return;
      }

      const updated = await reviewService.updateComment(commentId, body.body);
      if (!updated) {
        response.status(404).json({ error: "Comment not found" });
        return;
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/comments/:commentId", async (request, response, next) => {
    try {
      const { commentId } = request.params;
      if (typeof commentId !== "string") {
        response.status(400).json({ error: "Missing commentId" });
        return;
      }

      const deleted = await reviewService.deleteComment(commentId);
      if (!deleted) {
        response.status(404).json({ error: "Comment not found" });
        return;
      }

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/export/comments.md", async (_request, response, next) => {
    try {
      response.type("text/markdown").send(await reviewService.exportMarkdown());
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.startsWith("Unknown changeId") || message.startsWith("Comment anchor") ? 400 : 500;
    response.status(status).json({ error: message });
  });

  if (!options.dev) {
    const clientDir = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientDir));
    app.get("/{*path}", (_request, response) => {
      response.sendFile(path.join(clientDir, "index.html"));
    });
  }

  return {
    app,
    server: http.createServer(app),
    port
  };
}
