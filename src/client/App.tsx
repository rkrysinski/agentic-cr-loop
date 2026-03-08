import { startTransition, useEffect, useState } from "react";
import { createComment, getChange, getChanges, getComments, getRepo } from "./api.js";
import { DiffViewer, getAnchorKey } from "./diffView.js";
import type { ChangeSummary, CommentsResponse, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment, ViewMode } from "../shared/types.js";

type PendingAnchor = {
  side: "old" | "new";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkHeader: string;
};

const EMPTY_COMMENTS: CommentsResponse = {
  current: [],
  outdated: []
};

export function App() {
  const [repo, setRepo] = useState<RepoResponse | null>(null);
  const [changes, setChanges] = useState<ChangeSummary[]>([]);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [comments, setComments] = useState<CommentsResponse>(EMPTY_COMMENTS);
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (!selectedChangeId) {
      setSelectedChange(null);
      setComments(EMPTY_COMMENTS);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([getChange(selectedChangeId), getComments(selectedChangeId)])
      .then(([change, nextComments]) => {
        if (cancelled) {
          return;
        }
        setSelectedChange(change);
        setComments(nextComments);
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChangeId]);

  async function refreshAll() {
    try {
      setLoading(true);
      setError(null);
      const [repoInfo, nextChanges] = await Promise.all([getRepo(), getChanges()]);
      const nextSelectedChangeId =
        selectedChangeId && nextChanges.some((change) => change.changeId === selectedChangeId)
          ? selectedChangeId
          : nextChanges[0]?.changeId ?? null;
      setRepo(repoInfo);
      setChanges(nextChanges);
      setViewMode(repoInfo.viewModeDefault);
      setSelectedChangeId(nextSelectedChangeId);
      setPendingAnchor(null);
      setDraftComment("");
      if (!nextSelectedChangeId) {
        setSelectedChange(null);
        setComments(EMPTY_COMMENTS);
        setLoading(false);
      }
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setLoading(false);
    }
  }

  async function submitComment() {
    if (!selectedChange || !pendingAnchor || draftComment.trim().length === 0) {
      return;
    }

    try {
      setSubmitting(true);
      await createComment({
        changeId: selectedChange.changeId,
        side: pendingAnchor.side,
        oldLineNumber: pendingAnchor.oldLineNumber,
        newLineNumber: pendingAnchor.newLineNumber,
        hunkHeader: pendingAnchor.hunkHeader,
        body: draftComment
      });
      setDraftComment("");
      setPendingAnchor(null);
      startTransition(() => {
        void Promise.all([getChanges(), getComments(selectedChange.changeId)]).then(([nextChanges, nextComments]) => {
          setChanges(nextChanges);
          setComments(nextComments);
        });
      });
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAnchorKey = pendingAnchor
    ? `${pendingAnchor.hunkHeader}:${pendingAnchor.side}:${pendingAnchor.oldLineNumber ?? "-"}:${pendingAnchor.newLineNumber ?? "-"}`
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local review tool</p>
          <h1>Working tree review</h1>
          <p className="summary">
            {repo ? `${repo.repoPath} · ${repo.changeCount} changed file(s) · base ${repo.baseRef}` : "Loading repository"}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={() => void refreshAll()}>
            Refresh
          </button>
          <a className="button-link" href="/api/export/comments.md" target="_blank" rel="noreferrer">
            Export Markdown
          </a>
          <div className="view-toggle" role="group" aria-label="View mode">
            <button type="button" className={viewMode === "unified" ? "active" : ""} onClick={() => setViewMode("unified")}>
              Unified
            </button>
            <button
              type="button"
              className={viewMode === "side-by-side" ? "active" : ""}
              onClick={() => setViewMode("side-by-side")}
            >
              Side by side
            </button>
          </div>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="layout">
        <aside className="sidebar">
          <h2>Changed files</h2>
          <ul className="change-list">
            {changes.map((change) => {
              const path = change.newPath ?? change.oldPath ?? "(unknown)";
              return (
                <li key={change.changeId}>
                  <button
                    type="button"
                    className={`change-item ${selectedChangeId === change.changeId ? "selected" : ""}`}
                    onClick={() =>
                      startTransition(() => {
                        setSelectedChangeId(change.changeId);
                        setPendingAnchor(null);
                        setDraftComment("");
                      })
                    }
                  >
                    <span className="path-text">{path}</span>
                    <span className="change-meta">
                      {change.changeType} · {change.commentCounts.current}
                      {change.commentCounts.outdated > 0 ? ` + ${change.commentCounts.outdated} outdated` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="review-pane">
          {loading ? <div className="empty-state">Loading review data…</div> : null}
          {!loading && selectedChange ? (
            <>
              <div className="file-header">
                <h2>{selectedChange.newPath ?? selectedChange.oldPath ?? "(unknown)"}</h2>
                <p>
                  {selectedChange.changeType}
                  {selectedChange.isBinary ? " · binary" : ""}
                </p>
              </div>
              <DiffViewer
                change={selectedChange}
                comments={comments.current}
                mode={viewMode}
                selectedAnchorKey={selectedAnchorKey}
                onSelectLine={(anchor) => setPendingAnchor(anchor)}
              />
            </>
          ) : null}
          {!loading && !selectedChange ? <div className="empty-state">No changed files were found.</div> : null}
        </section>

        <aside className="comment-panel">
          <h2>Comments</h2>

          {selectedChange && !selectedChange.isBinary && pendingAnchor ? (
            <section className="comment-card">
              <h3>New comment</h3>
              <p className="comment-anchor">
                {pendingAnchor.side} line {pendingAnchor.side === "old" ? pendingAnchor.oldLineNumber : pendingAnchor.newLineNumber}
              </p>
              <textarea value={draftComment} onChange={(event) => setDraftComment(event.target.value)} rows={6} />
              <div className="comment-actions">
                <button type="button" disabled={submitting || draftComment.trim().length === 0} onClick={() => void submitComment()}>
                  Save comment
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setPendingAnchor(null);
                    setDraftComment("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {!pendingAnchor && selectedChange && !selectedChange.isBinary ? (
            <div className="empty-panel">Select an added or removed line to add a comment.</div>
          ) : null}

          {selectedChange?.isBinary ? <div className="empty-panel">Binary files support metadata-only review in v1.</div> : null}

          <section className="comment-list-section">
            <h3>Current</h3>
            <CommentList comments={comments.current} />
          </section>

          <section className="comment-list-section">
            <h3>Outdated</h3>
            <CommentList comments={comments.outdated} muted />
          </section>
        </aside>
      </main>
    </div>
  );
}

function CommentList({ comments, muted = false }: { comments: ReviewComment[]; muted?: boolean }) {
  if (comments.length === 0) {
    return <div className="empty-panel">No comments.</div>;
  }

  return (
    <ul className="comment-list">
      {comments.map((comment) => {
        const anchorKey = getAnchorKey(comment.hunkHeader, {
          oldLineNumber: comment.oldLineNumber,
          newLineNumber: comment.newLineNumber,
          commentableSide: comment.side
        });

        return (
          <li key={comment.commentId} className={`comment-card ${muted ? "comment-card-muted" : ""}`} data-anchor={anchorKey ?? ""}>
            <p className="comment-anchor">
              {comment.side} line {comment.side === "old" ? comment.oldLineNumber : comment.newLineNumber}
            </p>
            <p className="comment-body">{comment.body}</p>
            <p className="comment-date">{new Date(comment.createdAt).toLocaleString()}</p>
          </li>
        );
      })}
    </ul>
  );
}
