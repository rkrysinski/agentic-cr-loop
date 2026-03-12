import { startTransition, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createComment, deleteComment, getChange, getChanges, getComments, getRepo, updateComment } from "./api.js";
import { DiffViewer } from "./diffView.js";
import type { ChangeSummary, CommentsResponse, DiffContextValue, RepoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment, ViewMode } from "../shared/types.js";

type PendingAnchor = {
  side: "old" | "new";
  lineNumber: number;
};

const EMPTY_COMMENTS: CommentsResponse = {
  current: [],
  outdated: []
};

const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 360;
const MAX_SIDEBAR_WIDTH = 920;
const KEYBOARD_RESIZE_STEP = 32;
const DEFAULT_DIFF_CONTEXT: DiffContextValue = "full";

const DIFF_CONTEXT_OPTIONS: Array<{ value: DiffContextValue; label: string }> = [
  { value: "0", label: "No Context" },
  { value: "3", label: "3 lines" },
  { value: "20", label: "20 lines" },
  { value: "100", label: "100 lines" },
  { value: "full", label: "Full Context" }
];

type ChangeTreeFileNode = {
  kind: "file";
  key: string;
  name: string;
  path: string;
  change: ChangeSummary;
};

type ChangeTreeDirectoryNode = {
  kind: "directory";
  key: string;
  name: string;
  path: string;
  children: ChangeTreeNode[];
};

type ChangeTreeNode = ChangeTreeDirectoryNode | ChangeTreeFileNode;

type MutableChangeTreeDirectory = {
  name: string;
  path: string;
  directories: Map<string, MutableChangeTreeDirectory>;
  files: ChangeTreeFileNode[];
};

function getChangePath(change: ChangeSummary): string {
  return change.newPath ?? change.oldPath ?? "(unknown)";
}

function buildChangeTree(changes: ChangeSummary[]): ChangeTreeDirectoryNode {
  const root: MutableChangeTreeDirectory = {
    name: "",
    path: "",
    directories: new Map(),
    files: []
  };

  for (const change of changes) {
    const path = getChangePath(change);
    const segments = path.split("/").filter((segment) => segment.length > 0);

    if (segments.length === 0) {
      root.files.push({
        kind: "file",
        key: path,
        name: path,
        path,
        change
      });
      continue;
    }

    let currentDirectory = root;

    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      let nextDirectory = currentDirectory.directories.get(segment);
      if (!nextDirectory) {
        nextDirectory = {
          name: segment,
          path: nextPath,
          directories: new Map(),
          files: []
        };
        currentDirectory.directories.set(segment, nextDirectory);
      }
      currentDirectory = nextDirectory;
    }

    const fileName = segments.at(-1) ?? path;
    currentDirectory.files.push({
      kind: "file",
      key: path,
      name: fileName,
      path,
      change
    });
  }

  return finalizeDirectory(root);
}

function finalizeDirectory(directory: MutableChangeTreeDirectory): ChangeTreeDirectoryNode {
  const directories = Array.from(directory.directories.values())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((child) => finalizeDirectory(child));
  const files = [...directory.files].sort((left, right) => left.name.localeCompare(right.name));

  return {
    kind: "directory",
    key: directory.path || "__root__",
    name: directory.name,
    path: directory.path,
    children: [...directories, ...files]
  };
}

function collectDirectoryKeys(node: ChangeTreeDirectoryNode): string[] {
  const keys: string[] = [];

  for (const child of node.children) {
    if (child.kind !== "directory") {
      continue;
    }
    keys.push(child.key, ...collectDirectoryKeys(child));
  }

  return keys;
}

function getAncestorDirectoryKeys(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const keys: string[] = [];

  for (let index = 0; index < segments.length - 1; index += 1) {
    keys.push(segments.slice(0, index + 1).join("/"));
  }

  return keys;
}

function collapseDirectory(directory: ChangeTreeDirectoryNode): { key: string; label: string; node: ChangeTreeDirectoryNode } {
  const parts = [directory.name];
  let currentDirectory = directory;

  while (currentDirectory.children.length === 1 && currentDirectory.children[0]?.kind === "directory") {
    currentDirectory = currentDirectory.children[0];
    parts.push(currentDirectory.name);
  }

  return {
    key: currentDirectory.key,
    label: parts.join("/"),
    node: currentDirectory
  };
}

export function App() {
  const layoutRef = useRef<HTMLElement | null>(null);
  const [repo, setRepo] = useState<RepoResponse | null>(null);
  const [changes, setChanges] = useState<ChangeSummary[]>([]);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [comments, setComments] = useState<CommentsResponse>(EMPTY_COMMENTS);
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [hideRemovedCode, setHideRemovedCode] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCommentActionId, setPendingCommentActionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedDirectoryKeys, setExpandedDirectoryKeys] = useState<Record<string, boolean>>({});
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [diffContext, setDiffContext] = useState<DiffContextValue>(DEFAULT_DIFF_CONTEXT);

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

    Promise.all([getChange(selectedChangeId, diffContext), getComments(selectedChangeId)])
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
  }, [selectedChangeId, diffContext]);

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
      resetNewComment();
      resetEditingComment();
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
        lineNumber: pendingAnchor.lineNumber,
        body: draftComment
      });
      resetNewComment();
      startTransition(() => {
        void refreshCommentsAndCounts(selectedChange.changeId);
      });
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshCommentsAndCounts(changeId: string) {
    const [nextChanges, nextComments] = await Promise.all([getChanges(), getComments(changeId)]);
    setChanges(nextChanges);
    setComments(nextComments);
  }

  async function submitCommentEdit() {
    if (!editingCommentId || editingBody.trim().length === 0 || !selectedChangeId) {
      return;
    }

    try {
      setPendingCommentActionId(editingCommentId);
      await updateComment(editingCommentId, { body: editingBody });
      const nextComments = await getComments(selectedChangeId);
      setComments(nextComments);
      resetEditingComment();
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPendingCommentActionId(null);
    }
  }

  async function removeComment(commentId: string) {
    if (!selectedChangeId) {
      return;
    }

    try {
      setPendingCommentActionId(commentId);
      await deleteComment(commentId);
      if (editingCommentId === commentId) {
        resetEditingComment();
      }
      startTransition(() => {
        void refreshCommentsAndCounts(selectedChangeId);
      });
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPendingCommentActionId(null);
    }
  }

  function beginEditingComment(comment: ReviewComment) {
    resetNewComment();
    setEditingCommentId(comment.commentId);
    setEditingBody(comment.body);
  }

  function resetEditingComment() {
    setEditingCommentId(null);
    setEditingBody("");
  }

  function resetNewComment() {
    setPendingAnchor(null);
    setDraftComment("");
  }

  const selectedAnchorKey = pendingAnchor
    ? `${pendingAnchor.side}:${pendingAnchor.lineNumber}`
    : null;
  const changeTree = buildChangeTree(changes);
  const layoutStyle = { "--sidebar-width": `${sidebarWidth}px` } as CSSProperties;

  function clampSidebarWidth(nextWidth: number): number {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width ?? 0;
    const maxWidth = layoutWidth > 0 ? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, layoutWidth - 320)) : MAX_SIDEBAR_WIDTH;
    return Math.min(Math.max(nextWidth, MIN_SIDEBAR_WIDTH), maxWidth);
  }

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const layoutBounds = layoutRef.current?.getBoundingClientRect();
      if (!layoutBounds) {
        return;
      }
      setSidebarWidth(clampSidebarWidth(event.clientX - layoutBounds.left));
    }

    function handlePointerUp() {
      setIsResizingSidebar(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    const nextDirectoryKeys = collectDirectoryKeys(changeTree);
    if (nextDirectoryKeys.length === 0) {
      return;
    }

    setExpandedDirectoryKeys((current) => {
      const nextState = { ...current };
      let changed = false;

      for (const key of nextDirectoryKeys) {
        if (key in nextState) {
          continue;
        }
        nextState[key] = true;
        changed = true;
      }

      return changed ? nextState : current;
    });
  }, [changes]);

  useEffect(() => {
    if (!selectedChangeId) {
      return;
    }

    const selectedChangeSummary = changes.find((change) => change.changeId === selectedChangeId);
    if (!selectedChangeSummary) {
      return;
    }

    const ancestorKeys = getAncestorDirectoryKeys(getChangePath(selectedChangeSummary));
    if (ancestorKeys.length === 0) {
      return;
    }

    setExpandedDirectoryKeys((current) => {
      const nextState = { ...current };
      let changed = false;

      for (const key of ancestorKeys) {
        if (nextState[key]) {
          continue;
        }
        nextState[key] = true;
        changed = true;
      }

      return changed ? nextState : current;
    });
  }, [changes, selectedChangeId]);

  function renderChangeTree(nodes: ChangeTreeNode[], depth = 0) {
    return nodes.map((node) => {
      if (node.kind === "directory") {
        const collapsedDirectory = collapseDirectory(node);
        const isExpanded = expandedDirectoryKeys[collapsedDirectory.key] ?? true;
        const treeDepthStyle = { "--tree-depth": depth } as CSSProperties;

        return (
          <li key={collapsedDirectory.key} className="change-tree-node">
            <button
              type="button"
              className="change-tree-directory"
              style={treeDepthStyle}
              aria-expanded={isExpanded}
              onClick={() =>
                setExpandedDirectoryKeys((current) => ({
                  ...current,
                  [collapsedDirectory.key]: !isExpanded
                }))
              }
            >
              <span
                className={`change-tree-chevron ${isExpanded ? "change-tree-chevron-expanded" : ""}`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 16 16" focusable="false">
                  <path d="M6 3.5L10.5 8L6 12.5" />
                </svg>
              </span>
              <span className="change-tree-folder-icon" aria-hidden="true">
                <svg viewBox="0 0 20 16" focusable="false">
                  <path d="M1.5 4.5A2.5 2.5 0 0 1 4 2h3.2l1.6 1.8H16A2.5 2.5 0 0 1 18.5 6.3v5.2A2.5 2.5 0 0 1 16 14H4A2.5 2.5 0 0 1 1.5 11.5z" />
                </svg>
              </span>
              <span className="change-tree-label">{collapsedDirectory.label}</span>
            </button>
            {isExpanded ? <ul className="change-tree-children">{renderChangeTree(collapsedDirectory.node.children, depth + 1)}</ul> : null}
          </li>
        );
      }

      const treeDepthStyle = { "--tree-depth": depth } as CSSProperties;

      return (
        <li key={node.key} className="change-tree-node">
          <button
            type="button"
            className={`change-item change-tree-file ${selectedChangeId === node.change.changeId ? "selected" : ""}`}
            style={treeDepthStyle}
            onClick={() =>
              startTransition(() => {
                setSelectedChangeId(node.change.changeId);
                resetNewComment();
                resetEditingComment();
              })
            }
          >
            <span className="change-tree-file-row">
              <span className="change-tree-file-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path d="M4 1.5h5l3 3V14a.5.5 0 0 1-.5.5h-7A1.5 1.5 0 0 1 3 13V3A1.5 1.5 0 0 1 4.5 1.5z" />
                  <path d="M9 1.5V5h3" />
                </svg>
              </span>
              <span className="path-text">{node.name}</span>
              {node.change.commentCounts.current > 0 ? (
                <span className="change-comment-count" aria-label={`${node.change.commentCounts.current} comments`}>
                  {node.change.commentCounts.current}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      );
    });
  }

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
        <div className="topbar-controls">
          <div className="topbar-actions">
            <button type="button" onClick={() => void refreshAll()}>
              Refresh
            </button>
            <label className="context-select">
              <span>Context</span>
              <select
                aria-label="Diff context"
                value={diffContext}
                onChange={(event) => {
                  resetNewComment();
                  resetEditingComment();
                  setDiffContext(event.target.value as DiffContextValue);
                }}
              >
                {DIFF_CONTEXT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <a className="button-link" href="/api/export/comments.md" target="_blank" rel="noreferrer">
              Export Comments
            </a>
          </div>
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

      <main ref={layoutRef} className={`layout ${isSidebarCollapsed ? "layout-sidebar-collapsed" : ""}`} style={layoutStyle}>
        <aside className={`sidebar-widget ${isSidebarCollapsed ? "sidebar-widget-collapsed" : ""}`}>
          <div className="sidebar-header">
            {!isSidebarCollapsed ? <h2>Changed files</h2> : <span className="sidebar-header-spacer" aria-hidden="true" />}
            <button
              type="button"
              className="sidebar-header-toggle"
              aria-controls="changed-files-panel"
              aria-expanded={!isSidebarCollapsed}
              aria-label={isSidebarCollapsed ? "Show changed files" : "Hide changed files"}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              <span aria-hidden="true">{isSidebarCollapsed ? ">" : "<"}</span>
            </button>
          </div>
          <div id="changed-files-panel" className="sidebar-body" aria-hidden={isSidebarCollapsed}>
            <ul className="change-list change-tree">{renderChangeTree(changeTree.children)}</ul>
          </div>
        </aside>
        <div
          className={`sidebar-resizer ${isResizingSidebar ? "sidebar-resizer-active" : ""}`}
          role="separator"
          aria-label="Resize changed files panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={isSidebarCollapsed ? -1 : 0}
          onPointerDown={(event) => {
            if (isSidebarCollapsed) {
              return;
            }
            event.preventDefault();
            setIsResizingSidebar(true);
          }}
          onKeyDown={(event) => {
            if (isSidebarCollapsed) {
              return;
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSidebarWidth((current) => clampSidebarWidth(current - KEYBOARD_RESIZE_STEP));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setSidebarWidth((current) => clampSidebarWidth(current + KEYBOARD_RESIZE_STEP));
            } else if (event.key === "Home") {
              event.preventDefault();
              setSidebarWidth(MIN_SIDEBAR_WIDTH);
            } else if (event.key === "End") {
              event.preventDefault();
              setSidebarWidth(clampSidebarWidth(MAX_SIDEBAR_WIDTH));
            }
          }}
        />

        <section className="review-pane">
          {loading ? <div className="empty-state">Loading review data…</div> : null}
          {!loading && selectedChange ? (
            <>
              <div className="file-header">
                <div className="file-header-main">
                  <h2>{selectedChange.newPath ?? selectedChange.oldPath ?? "(unknown)"}</h2>
                  {viewMode === "unified" ? (
                    <div className="review-controls">
                      <label className="filter-toggle">
                        <input
                          type="checkbox"
                          checked={hideRemovedCode}
                          onChange={(event) => setHideRemovedCode(event.target.checked)}
                        />
                        <span>Hide removed code</span>
                      </label>
                    </div>
                  ) : null}
                </div>
                <p>
                  {selectedChange.changeType}
                  {selectedChange.isBinary ? " · binary" : ""}
                </p>
              </div>
              <DiffViewer
                change={selectedChange}
                comments={comments}
                mode={viewMode}
                hideRemovedCode={hideRemovedCode}
                selectedAnchorKey={selectedAnchorKey}
                draftComment={draftComment}
                editingCommentId={editingCommentId}
                editingBody={editingBody}
                submitting={submitting}
                pendingCommentActionId={pendingCommentActionId}
                onSelectLine={(anchor) => {
                  resetEditingComment();
                  setPendingAnchor(anchor);
                }}
                onDraftCommentChange={setDraftComment}
                onSubmitComment={() => void submitComment()}
                onCancelNewComment={resetNewComment}
                onBeginEdit={beginEditingComment}
                onCancelEdit={resetEditingComment}
                onChangeEditingBody={setEditingBody}
                onSaveEdit={() => void submitCommentEdit()}
                onDelete={(commentId) => void removeComment(commentId)}
              />
            </>
          ) : null}
          {!loading && !selectedChange ? <div className="empty-state">No changed files were found.</div> : null}
        </section>
      </main>
    </div>
  );
}
