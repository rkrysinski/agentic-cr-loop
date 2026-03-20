import { useEffect, useRef, useState } from "react";
import type { RepoEntry } from "../shared/api.js";
import { registerRepo } from "./api.js";
import { IconChevronDown, IconPlus } from "./icons.js";
import { useRepo } from "./RepoContext.js";

// ── Add-repo modal ────────────────────────────────────────────

function AddRepoModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => Promise<void> }) {
  const [repoPath, setRepoPath] = useState("");
  const [repoId, setRepoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    if (!repoPath.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerRepo(repoPath.trim(), repoId.trim() || undefined);
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repository");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      data-testid="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add repository"
    >
      <div className="modal-panel">
        <div className="modal-header">
          <span className="modal-title">Add Repository</span>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-field">
            <span className="modal-label">Repository path</span>
            <input
              ref={inputRef}
              type="text"
              className="modal-input"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              placeholder="/path/to/repo"
              aria-label="Repository path"
            />
            {error ? <span className="modal-error">{error}</span> : null}
          </label>
          <label className="modal-field">
            <span className="modal-label">ID (optional)</span>
            <input
              type="text"
              className="modal-input"
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
              placeholder="derived from basename"
              aria-label="ID (optional)"
            />
          </label>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="modal-add-btn"
            onClick={() => void handleSubmit()}
            disabled={submitting || !repoPath.trim()}
          >
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getPinnedRepos(repos: RepoEntry[], lruOrder: string[], limit: number): RepoEntry[] {
  const repoById = new Map(repos.map((repo) => [repo.id, repo]));
  const orderedIds = [...lruOrder, ...repos.map((repo) => repo.id)];
  const pinned: RepoEntry[] = [];
  const seen = new Set<string>();

  for (const repoId of orderedIds) {
    if (seen.has(repoId)) {
      continue;
    }

    seen.add(repoId);
    const repo = repoById.get(repoId);
    if (!repo) {
      continue;
    }

    pinned.push(repo);
    if (pinned.length === limit) {
      break;
    }
  }

  return pinned;
}

// ── RepoSelector ──────────────────────────────────────────────

export function RepoSelector() {
  const { repos, activeRepoId, setActiveRepoId, refreshRepos } = useRepo();
  const [showModal, setShowModal] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  // LRU: tracks the two most recently active repo ids (index 0 = most recent)
  const [lruOrder, setLruOrder] = useState<string[]>(() =>
    activeRepoId ? [activeRepoId] : []
  );
  const pillRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update LRU when active repo changes
  useEffect(() => {
    if (!activeRepoId) {
      return;
    }

    setLruOrder((prev) => {
      const next = [activeRepoId, ...prev.filter((id) => id !== activeRepoId)];
      return next.slice(0, 2);
    });
  }, [activeRepoId]);

  // Close overflow dropdown on outside click
  useEffect(() => {
    if (!showOverflow) {
      return;
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      const insidePill = pillRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insidePill && !insideDropdown) {
        setShowOverflow(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showOverflow]);

  function handleSelectRepo(id: string) {
    setActiveRepoId(id);
    setShowOverflow(false);
  }

  // ── Single repo — hide selector (FR-34) ─────────────────────
  if (repos.length === 1) {
    return null;
  }

  // ── Zero repos ──────────────────────────────────────────────
  if (repos.length === 0) {
    return (
      <div className="repo-selector-empty">
        <p className="repo-selector-empty-text">No repositories loaded.</p>
        <p className="repo-selector-empty-hint">
          <code>crloop add-repo &lt;path&gt;</code>
          {" "}or click{" "}
          <button
            type="button"
            className="repo-selector-add-inline"
            onClick={() => setShowModal(true)}
            aria-label="Add repository"
          >
            [+]
          </button>{" "}
          to add one.
        </p>
        {showModal ? (
          <AddRepoModal onClose={() => setShowModal(false)} onAdded={refreshRepos} />
        ) : null}
      </div>
    );
  }

  // ── Shared: tab renderer ─────────────────────────────────────
  function renderTab(repoId: string) {
    const isActive = repoId === activeRepoId;
    return (
      <button
        key={repoId}
        type="button"
        role="tab"
        aria-selected={isActive}
        className={`repo-tab${isActive ? " repo-tab-active" : ""}`}
        onClick={() => handleSelectRepo(repoId)}
      >
        {repoId}
      </button>
    );
  }

  const visibleRepos = repos.length > 2 ? getPinnedRepos(repos, lruOrder, 2) : repos;
  const visibleRepoIds = new Set(visibleRepos.map((repo) => repo.id));
  const overflowRepos = repos.filter((repo) => !visibleRepoIds.has(repo.id));

  return (
    <>
      <div className="repo-selector-divider" />
      <div className="repo-selector-tabs-wrapper">
        <div className="repo-selector-tabs" role="tablist" aria-label="Active repository">
          {visibleRepos.map((repo) => renderTab(repo.id))}

          {overflowRepos.length > 0 ? (
            <button
              ref={pillRef}
              type="button"
              className="repo-overflow-pill"
              aria-haspopup="listbox"
              aria-expanded={showOverflow}
              onClick={() => setShowOverflow((v) => !v)}
            >
              +{overflowRepos.length}
              <span className="repo-overflow-chevron">
                <IconChevronDown />
              </span>
            </button>
          ) : null}

          <div className="repo-selector-spacer" />
          <button
            type="button"
            className="repo-selector-add-btn"
            aria-label="Add repository"
            onClick={() => setShowModal(true)}
          >
            <IconPlus />
          </button>
        </div>
        {showOverflow && overflowRepos.length > 0 ? (
          <div ref={dropdownRef} className="repo-overflow-dropdown" role="listbox" aria-label="More repositories">
            {overflowRepos.map((repo) => (
              <button
                key={repo.id}
                type="button"
                role="option"
                aria-selected={repo.id === activeRepoId}
                className="repo-overflow-item"
                onClick={() => handleSelectRepo(repo.id)}
              >
                {repo.id}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {showModal ? (
        <AddRepoModal onClose={() => setShowModal(false)} onAdded={refreshRepos} />
      ) : null}
    </>
  );
}
