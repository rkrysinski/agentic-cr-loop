import http from "node:http";
import path from "node:path";
import express from "express";
import { DIFF_CONTEXT_VALUES } from "../shared/api.js";
import type { CreateCommentRequest, DiffContextValue, RepoEntry, RepoInfoResponse, UpdateCommentRequest } from "../shared/api.js";
import { deriveRepoId } from "./args.js";
import { resolveClientDistDirectory } from "./assetPaths.js";
import { ClientError } from "./errors.js";
import { ReviewService } from "./reviewService.js";

type StartOptions = {
  dev?: boolean;
  verbose?: boolean;
};

function getRepoService(response: express.Response): ReviewService {
  return response.locals.service as ReviewService;
}

function getRepoId(response: express.Response): string {
  return response.locals.repoId as string;
}

export async function startServer(
  { repos, port }: { repos: Array<{ id: string; path: string }>; port: number },
  options: StartOptions = {}
): Promise<{ app: express.Express; server: http.Server; port: number }> {
  const services = new Map<string, ReviewService>();

  for (const repo of repos) {
    const svc = new ReviewService(repo.path);
    await svc.validateRepository();
    services.set(repo.id, svc);
  }

  const app = express();
  app.use(express.json());

  if (options.verbose) {
    app.use((request, response, next) => {
      const start = Date.now();
      response.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`${request.method} ${request.url} ${response.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  // ── Flat repo-management endpoints ──────────────────────────

  app.get("/api/repos", (_request, response) => {
    const result: RepoEntry[] = [...services.entries()].map(([id, svc]) => ({ id, path: svc.repoPath }));
    response.json(result);
  });

  app.post("/api/repos", async (request, response, next) => {
    try {
      const body = request.body as Partial<{ path: string; id: string }>;
      if (typeof body.path !== "string" || body.path.trim().length === 0) {
        response.status(400).json({ error: "Missing path" });
        return;
      }

      const resolvedPath = path.resolve(body.path);
      const id = typeof body.id === "string" && body.id.trim().length > 0 ? body.id : deriveRepoId(resolvedPath);

      if (services.has(id)) {
        response.status(409).json({ error: `Repo id already in use: ${id}` });
        return;
      }

      const svc = new ReviewService(resolvedPath);
      try {
        await svc.validateRepository();
      } catch {
        response.status(400).json({ error: "Not a git repository" });
        return;
      }

      services.set(id, svc);
      response.status(201).json({ id, path: resolvedPath } satisfies RepoEntry);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/server/stop", (_request, response) => {
    response.status(204).send();
    setImmediate(() => process.exit(0));
  });

  app.delete("/api/repos/:repoId", (request, response) => {
    const { repoId } = request.params;
    if (!services.has(repoId)) {
      response.status(404).json({ error: `Repo not found: ${repoId}` });
      return;
    }
    services.delete(repoId);
    response.status(204).send();
  });

  // ── Per-repo router ──────────────────────────────────────────

  const repoRouter = express.Router({ mergeParams: true });

  repoRouter.use((request, response, next) => {
    const repoId = (request.params as Record<string, string>).repoId;
    const svc = services.get(repoId);
    if (!svc) {
      response.status(404).json({ error: `Repo not found: ${repoId}` });
      return;
    }
    response.locals.repoId = repoId;
    response.locals.service = svc;
    next();
  });

  repoRouter.get("/repo", async (_request, response, next) => {
    try {
      const svc = getRepoService(response);
      const [info, changes] = await Promise.all([svc.getRepoInfo(), svc.getChangeSummaries()]);
      response.json({
        id: getRepoId(response),
        path: info.path,
        baseRef: info.baseRef,
        changeCount: changes.length,
        headShortId: info.headShortId
      } satisfies RepoInfoResponse);
    } catch (error) {
      next(error);
    }
  });

  repoRouter.get("/changes", async (_request, response, next) => {
    try {
      const svc = getRepoService(response);
      response.json(await svc.getChangeSummaries());
    } catch (error) {
      next(error);
    }
  });

  repoRouter.get("/changes/:changeId", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const change = await svc.getChange(request.params.changeId, parseDiffContext(request.query.context));
      if (!change) {
        response.status(404).json({ error: "Change not found" });
        return;
      }
      response.json(change);
    } catch (error) {
      next(error);
    }
  });

  repoRouter.get("/comments", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const changeId = request.query.changeId;
      if (typeof changeId !== "string") {
        response.status(400).json({ error: "Missing changeId" });
        return;
      }
      response.json(await svc.getComments(changeId));
    } catch (error) {
      next(error);
    }
  });

  repoRouter.post("/comments", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const body = request.body as Partial<CreateCommentRequest>;

      if (
        typeof body.changeId !== "string" ||
        (body.side !== "old" && body.side !== "new") ||
        typeof body.lineNumber !== "number" ||
        !Number.isInteger(body.lineNumber) ||
        body.lineNumber <= 0 ||
        typeof body.body !== "string" ||
        body.body.trim().length === 0
      ) {
        response.status(400).json({ error: "Invalid comment payload" });
        return;
      }

      response.status(201).json(
        await svc.createComment({
          changeId: body.changeId,
          side: body.side,
          lineNumber: body.lineNumber,
          body: body.body
        })
      );
    } catch (error) {
      next(error);
    }
  });

  repoRouter.patch("/comments/:commentId", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const { commentId } = request.params;
      const body = request.body as Partial<UpdateCommentRequest>;

      if (typeof commentId !== "string" || typeof body.body !== "string" || body.body.trim().length === 0) {
        response.status(400).json({ error: "Invalid comment payload" });
        return;
      }

      const updated = await svc.updateComment(commentId, body.body);
      if (!updated) {
        response.status(404).json({ error: "Comment not found" });
        return;
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  repoRouter.delete("/comments/:commentId", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const { commentId } = request.params;
      if (typeof commentId !== "string") {
        response.status(400).json({ error: "Missing commentId" });
        return;
      }

      const deleted = await svc.deleteComment(commentId);
      if (!deleted) {
        response.status(404).json({ error: "Comment not found" });
        return;
      }

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  repoRouter.get("/session", async (_request, response, next) => {
    try {
      const svc = getRepoService(response);
      const [session, changes] = await Promise.all([svc.getSession(), svc.getChangeSummaries()]);
      const commentCounts = changes.reduce(
        (acc, c) => ({
          current: acc.current + c.commentCounts.current,
          outdated: acc.outdated + c.commentCounts.outdated,
        }),
        { current: 0, outdated: 0 }
      );
      response.json({ ...session, commentCounts });
    } catch (error) {
      next(error);
    }
  });

  repoRouter.post("/session/transition", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const body = request.body as Partial<{ status: string }>;
      if (typeof body.status !== "string") {
        response.status(400).json({ error: "Missing status" });
        return;
      }
      const updated = await svc.transitionSession(body.status as import("./sessionStore.js").SessionStatus);
      response.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid transition")) {
        response.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  repoRouter.post("/session/reset", async (_request, response, next) => {
    try {
      const svc = getRepoService(response);
      await svc.resetSession();
      const session = await svc.getSession();
      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  repoRouter.get("/export/comments.txt", async (request, response, next) => {
    try {
      const svc = getRepoService(response);
      const skipOutdated = request.query.includeOutdated !== "true";
      response.type("text/plain").send(await svc.exportComments({ skipOutdated }));
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/repos/:repoId", repoRouter);

  app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const status = error instanceof ClientError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    if (status === 500) {
      console.error(`[ERROR] ${request.method} ${request.url}:`, error);
    }
    response.status(status).json({ error: message });
  });

  if (!options.dev) {
    const clientDir = resolveClientDistDirectory(import.meta.url);
    app.use(express.static(clientDir));
    app.get("/{*path}", (_request, response) => {
      response.sendFile("index.html", { root: clientDir });
    });
  }

  return {
    app,
    server: http.createServer(app),
    port
  };
}

function parseDiffContext(rawValue: unknown): DiffContextValue {
  if (rawValue === undefined) {
    return "full";
  }

  if (typeof rawValue !== "string" || !DIFF_CONTEXT_VALUES.includes(rawValue as DiffContextValue)) {
    throw new ClientError("Invalid diff context");
  }

  return rawValue as DiffContextValue;
}
