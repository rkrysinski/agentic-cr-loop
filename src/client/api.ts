import type { ChangeSummary, CommentsResponse, CreateCommentRequest, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment } from "../shared/types.js";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getRepo(): Promise<RepoResponse> {
  return request<RepoResponse>("/api/repo");
}

export function getChanges(): Promise<ChangeSummary[]> {
  return request<ChangeSummary[]>("/api/changes");
}

export function getChange(changeId: string): Promise<FileChange> {
  return request<FileChange>(`/api/changes/${encodeURIComponent(changeId)}`);
}

export function getComments(changeId: string): Promise<CommentsResponse> {
  return request<CommentsResponse>(`/api/comments?changeId=${encodeURIComponent(changeId)}`);
}

export function createComment(input: CreateCommentRequest): Promise<ReviewComment> {
  return request<ReviewComment>("/api/comments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}
