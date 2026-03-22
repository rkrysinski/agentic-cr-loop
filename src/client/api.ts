import type {
  ChangeSummary,
  CommentsResponse,
  CreateCommentRequest,
  DiffContextValue,
  RepoEntry,
  RepoInfoResponse,
  UpdateCommentRequest
} from "../shared/api.js";
import type { FileChange, ReviewComment } from "../shared/types.js";

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  const shouldReadJson =
    contentType.includes("application/json") ||
    (!contentType && typeof response.json === "function" && typeof response.text !== "function");

  if (shouldReadJson) {
    return response.json();
  }

  return response.text();
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = await parseResponseBody(response).catch(() => null);
    const message =
      typeof payload === "string"
        ? payload.trim()
        : (payload as { error?: string } | null)?.error;
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return (await parseResponseBody(response)) as T;
}

// ── Top-level repo management ────────────────────────────────

export function getRepos(): Promise<RepoEntry[]> {
  return request<RepoEntry[]>("/api/repos");
}

export function registerRepo(path: string, id?: string): Promise<RepoEntry> {
  return request<RepoEntry>("/api/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { path, id } : { path })
  });
}

// ── Per-repo API client factory ──────────────────────────────

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(repoId: string) {
  const base = `/api/repos/${encodeURIComponent(repoId)}`;

  return {
    getRepo(): Promise<RepoInfoResponse> {
      return request<RepoInfoResponse>(`${base}/repo`);
    },

    getChanges(): Promise<ChangeSummary[]> {
      return request<ChangeSummary[]>(`${base}/changes`);
    },

    getChange(changeId: string, context: DiffContextValue): Promise<FileChange> {
      return request<FileChange>(`${base}/changes/${encodeURIComponent(changeId)}?context=${encodeURIComponent(context)}`);
    },

    getComments(changeId: string): Promise<CommentsResponse> {
      return request<CommentsResponse>(`${base}/comments?changeId=${encodeURIComponent(changeId)}`);
    },

    createComment(input: CreateCommentRequest): Promise<ReviewComment> {
      return request<ReviewComment>(`${base}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
    },

    updateComment(commentId: string, input: UpdateCommentRequest): Promise<ReviewComment> {
      return request<ReviewComment>(`${base}/comments/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
    },

    deleteComment(commentId: string): Promise<void> {
      return request<void>(`${base}/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
    },

    exportComments(): Promise<string> {
      return request<string>(`${base}/export/comments.txt`);
    },

    getSession(): Promise<{ status: string; iteration: number; headId: string; startedAt: string; updatedAt: string; commentCounts: { current: number; outdated: number } }> {
      return request(`${base}/session`);
    },

    transitionSession(status: string): Promise<{ status: string; iteration: number }> {
      return request(`${base}/session/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
    }
  };
}
