import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getChangePath } from "../shared/changePaths.js";
import { DiffViewer } from "./diffView.js";
import { DIFF_CONTEXT_VALUES } from "../shared/api.js";
import type { ChangeSummary, CommentsResponse, DiffContextValue, RepoInfoResponse } from "../shared/api.js";
import type { FileChange, ReviewComment, ViewMode } from "../shared/types.js";
import {
  IconChevronDown, IconClipboard, IconColumns2, IconEyeOff, IconExport,
  IconFileCode, IconFileText, IconFolderGit2, IconFolderOpen, IconGitBranch,
  IconGitPullRequest, IconList, IconMoon, IconRefresh, IconSun, IconTerminal, IconX
} from "./icons.js";
import { usePersistedState, useViewedState } from "./hooks.js";
import { useRepo } from "./RepoContext.js";
import { RepoSelector } from "./RepoSelector.js";

type PendingAnchor = {
  side: "old" | "new";
  lineNumber: number;
};

const EMPTY_COMMENTS: CommentsResponse = {
  current: [],
  outdated: []
};

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const KEYBOARD_RESIZE_STEP = 32;
const DEFAULT_DIFF_CONTEXT: DiffContextValue = "full";
const COPY_CONFIRM_DURATION_MS = 1_500;

const DIFF_CONTEXT_OPTIONS: Array<{ value: DiffContextValue; label: string }> = [
  { value: "0", label: "none" },
  { value: "3", label: "3 lines" },
  { value: "20", label: "20 lines" },
  { value: "100", label: "100 lines" },
  { value: "full", label: "full" }
];

type ChangeTreeFileNode = {
  kind: "file";
  key: string;
  name: string;
  change: ChangeSummary;
};

type ChangeTreeDirectoryNode = {
  kind: "directory";
  key: string;
  name: string;
  children: ChangeTreeNode[];
};

type ChangeTreeNode = ChangeTreeDirectoryNode | ChangeTreeFileNode;

type MutableChangeTreeDirectory = {
  name: string;
  path: string;
  directories: Map<string, MutableChangeTreeDirectory>;
  files: ChangeTreeFileNode[];
};

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

// ─── App ──────────────────────────────────────────────────────

export function App({ crloopRepoId }: { crloopRepoId?: string | null }) {
  const { apiClient, activeRepoId } = useRepo();
  const layoutRef = useRef<HTMLElement | null>(null);
  const selectedChangeIdRef = useRef<string | null>(null);
  const [repoData, setRepoData] = useState<{ repoId: string; info: RepoInfoResponse } | null>(null);
  // repo is null whenever the cached data belongs to a different repo, ensuring headShortId
  // is null on the same render that activeRepoId changes — before any effects run.
  const repo = repoData?.repoId === activeRepoId ? repoData.info : null;
  const [changes, setChanges] = useState<ChangeSummary[]>([]);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<FileChange | null>(null);
  const [comments, setComments] = useState<CommentsResponse>(EMPTY_COMMENTS);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>(
    "crloop.ui.viewMode", "unified",
    (raw) => (raw === "unified" || raw === "side-by-side" ? raw : "unified")
  );
  const [hideRemovedCode, setHideRemovedCode] = usePersistedState<boolean>(
    "crloop.ui.hideRemovedCode", false,
    (raw) => raw === "true"
  );
  const [pendingAnchor, setPendingAnchor] = useState<PendingAnchor | null>(null);
  const [draftComment, setDraftComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCommentActionId, setPendingCommentActionId] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = usePersistedState<boolean>(
    "crloop.ui.isSidebarCollapsed", false,
    (raw) => raw === "true"
  );
  const [expandedDirectoryKeys, setExpandedDirectoryKeys] = useState<Record<string, boolean>>({});
  const [sidebarWidth, setSidebarWidth] = usePersistedState<number>(
    "crloop.ui.sidebarWidth", DEFAULT_SIDEBAR_WIDTH,
    (raw) => { const n = Number(raw); return Number.isFinite(n) && n >= MIN_SIDEBAR_WIDTH && n <= MAX_SIDEBAR_WIDTH ? n : DEFAULT_SIDEBAR_WIDTH; }
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [diffContext, setDiffContext] = usePersistedState<DiffContextValue>(
    "crloop.ui.diffContext", DEFAULT_DIFF_CONTEXT,
    (raw) => (DIFF_CONTEXT_VALUES.includes(raw as DiffContextValue) ? (raw as DiffContextValue) : DEFAULT_DIFF_CONTEXT)
  );
  const [selectedChangeRefreshKey, setSelectedChangeRefreshKey] = useState(0);
  const [theme, setTheme] = usePersistedState<"dark" | "light">(
    "crloop.ui.theme", "dark",
    (raw) => (raw === "dark" || raw === "light" ? raw : "dark")
  );
  const [viewedChangeIds, addViewed] = useViewedState(activeRepoId, repo?.headShortId ?? null);

  const [exportMode, setExportMode] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [skipOutdated, setSkipOutdated] = useState(true);

  useEffect(() => {
    selectedChangeIdRef.current = selectedChangeId;
  }, [selectedChangeId]);

  useEffect(() => {
    if (!selectedChangeId || !repo) return;
    addViewed(selectedChangeId);
  }, [selectedChangeId, repo, addViewed]);

  const refreshAll = useCallback(async (preferredChangeId: string | null = selectedChangeIdRef.current) => {
    if (!apiClient) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [repoInfo, nextChanges] = await Promise.all([apiClient.getRepo(), apiClient.getChanges()]);
      const nextSelectedChangeId =
        preferredChangeId && nextChanges.some((change) => change.changeId === preferredChangeId)
          ? preferredChangeId
          : nextChanges[0]?.changeId ?? null;
      const shouldRefreshSelectedChange = nextSelectedChangeId !== null && nextSelectedChangeId === preferredChangeId;
      setRepoData({ repoId: activeRepoId!, info: repoInfo });
      setChanges(nextChanges);
      setSelectedChangeId(nextSelectedChangeId);
      if (shouldRefreshSelectedChange) {
        setSelectedChangeRefreshKey((current) => current + 1);
      }
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
  }, [apiClient, activeRepoId]);

  useEffect(() => {
    setChanges([]);
    setSelectedChangeId(null);
    setSelectedChange(null);
    setComments(EMPTY_COMMENTS);
    void refreshAll(null);
  }, [apiClient, refreshAll]);

  useEffect(() => {
    if (!selectedChangeId) {
      setSelectedChange(null);
      setComments(EMPTY_COMMENTS);
      return;
    }

    let cancelled = false;
    setLoading(true);

    if (!apiClient) {
      setSelectedChange(null);
      setComments(EMPTY_COMMENTS);
      setLoading(false);
      return;
    }

    Promise.all([apiClient.getChange(selectedChangeId, diffContext), apiClient.getComments(selectedChangeId)])
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
  }, [apiClient, selectedChangeId, diffContext, selectedChangeRefreshKey]);

  async function submitComment() {
    if (!selectedChange || !pendingAnchor || draftComment.trim().length === 0 || !apiClient) {
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.createComment({
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
    if (!apiClient) {
      return;
    }

    try {
      const [nextChanges, nextComments] = await Promise.all([apiClient.getChanges(), apiClient.getComments(changeId)]);
      setChanges(nextChanges);
      setComments(nextComments);
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function submitCommentEdit() {
    if (!editingCommentId || editingBody.trim().length === 0 || !selectedChangeId || !apiClient) {
      return;
    }

    try {
      setPendingCommentActionId(editingCommentId);
      await apiClient.updateComment(editingCommentId, { body: editingBody });
      const nextComments = await apiClient.getComments(selectedChangeId);
      setComments(nextComments);
      resetEditingComment();
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setPendingCommentActionId(null);
    }
  }

  async function removeComment(commentId: string) {
    if (!selectedChangeId || !apiClient) {
      return;
    }

    try {
      setPendingCommentActionId(commentId);
      await apiClient.deleteComment(commentId);
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

  async function fetchExport(includeOutdated: boolean) {
    if (!apiClient) return;
    setExportLoading(true);
    try {
      setError(null);
      setExportText(await apiClient.exportComments(includeOutdated ? { includeOutdated: true } : undefined));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setExportLoading(false);
    }
  }

  async function enterExportMode() {
    setExportMode(true);
    setCopyConfirm(false);
    setExportText("");
    setSkipOutdated(true);
    await fetchExport(false);
  }

  function exitExportMode() {
    setExportMode(false);
    setExportText("");
    setCopyConfirm(false);
  }

  function handleToggleSkipOutdated() {
    const next = !skipOutdated;
    setSkipOutdated(next);
    void fetchExport(!next);
  }

  const selectedAnchorKey = pendingAnchor
    ? `${pendingAnchor.side}:${pendingAnchor.lineNumber}`
    : null;
  const changeTree = useMemo(() => buildChangeTree(changes), [changes]);
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

  function renderChangeTree(nodes: ChangeTreeNode[], viewedIds: ReadonlySet<string>, depth = 0) {
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
                <IconChevronDown />
              </span>
              <span className="change-tree-folder-icon" aria-hidden="true">
                <IconFolderOpen />
              </span>
              <span className="change-tree-label">{collapsedDirectory.label}</span>
            </button>
            {isExpanded ? <ul className="change-tree-children">{renderChangeTree(collapsedDirectory.node.children, viewedIds, depth + 1)}</ul> : null}
          </li>
        );
      }

      const treeDepthStyle = { "--tree-depth": depth } as CSSProperties;
      const filePath = getChangePath(node.change);
      const segments = filePath.split("/");
      const isSelected = selectedChangeId === node.change.changeId;
      const isViewed = viewedIds.has(node.change.changeId);

      return (
        <li key={node.key} className="change-tree-node">
          <button
            type="button"
            className={`change-item change-tree-file change-type-${node.change.changeType} ${isSelected ? "selected" : ""}`}
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
              <span className="change-tree-active-dot" aria-hidden="true" style={{ visibility: isSelected ? "visible" : "hidden" }} />
              <span className="change-tree-file-icon" aria-hidden="true">
                <IconFileCode />
              </span>
              <span className={`path-text${!isSelected ? (isViewed ? " change-tree-filename--viewed" : " change-tree-filename--unviewed") : ""}`}>
                {node.change.changeType === "renamed" && node.change.oldPath
                  ? `${node.change.oldPath.split("/").at(-1)} → ${segments.at(-1)}`
                  : segments.at(-1)}
              </span>
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

  // Sidebar derived values
  const repoName = repo?.path ? (repo.path.split("/").filter(Boolean).at(-1) ?? repo.path) : "…";
  const statsAdded = changes.filter((c) => c.changeType === "added" || c.changeType === "untracked").length;
  const statsModified = changes.filter((c) => c.changeType === "modified" || c.changeType === "renamed").length;
  const statsDeleted = changes.filter((c) => c.changeType === "deleted").length;
  const filesWithComments = changes.filter(
    (c) => c.commentCounts.current > 0 || c.commentCounts.outdated > 0
  );
  const totalCommentCount = filesWithComments.reduce(
    (sum, c) => sum + c.commentCounts.current + c.commentCounts.outdated,
    0
  );

  function handleCopy() {
    void navigator.clipboard.writeText(exportText).then(() => {
      setCopyConfirm(true);
      setTimeout(() => setCopyConfirm(false), COPY_CONFIRM_DURATION_MS);
    });
  }

  function handleDownload() {
    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review_comments.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build breadcrumb and line counts from selected file
  const breadcrumbParts = selectedChange ? getChangePath(selectedChange).split("/") : null;
  const breadcrumbLabel = breadcrumbParts
    ? breadcrumbParts.slice(0, -1).join(" / ") + (breadcrumbParts.length > 1 ? " / " : "")
    : null;
  const breadcrumbFileRaw = breadcrumbParts?.at(-1) ?? null;
  const breadcrumbFile =
    selectedChange?.changeType === "renamed" && selectedChange.oldPath && breadcrumbFileRaw
      ? `${selectedChange.oldPath.split("/").at(-1)} → ${breadcrumbFileRaw}`
      : breadcrumbFileRaw;
  const { linesAdded, linesRemoved } = useMemo(() => {
    if (!selectedChange) return { linesAdded: 0, linesRemoved: 0 };
    let added = 0;
    let removed = 0;
    for (const h of selectedChange.hunks) {
      for (const l of h.lines) {
        if (l.kind === "added") added++;
        else if (l.kind === "removed") removed++;
      }
    }
    return { linesAdded: added, linesRemoved: removed };
  }, [selectedChange]);

  return (
    <div className="app-shell" data-theme={theme}>
      <main
        ref={layoutRef}
        className={`layout ${isSidebarCollapsed ? "layout-sidebar-collapsed" : ""}`}
        style={layoutStyle}
      >
        {/* ── Sidebar ── */}
        <aside className={`sidebar-widget ${isSidebarCollapsed ? "sidebar-widget-collapsed" : ""}`}>
          {/* Logo row */}
          <div className="sidebar-brand">
            <span className="sidebar-logo-icon"><IconGitPullRequest /></span>
            {!isSidebarCollapsed ? <span className="sidebar-logo-text">code_review</span> : null}
            <button
              type="button"
              className="sidebar-collapse-btn"
              aria-controls="changed-files-panel"
              aria-expanded={!isSidebarCollapsed}
              aria-label={isSidebarCollapsed ? "Show changed files" : "Hide changed files"}
              onClick={() => setIsSidebarCollapsed((current) => !current)}
            >
              <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
            </button>
          </div>

          {/* Repo selector */}
          {!isSidebarCollapsed && !crloopRepoId ? <RepoSelector /> : null}

          {/* Repo / stats info */}
          {!isSidebarCollapsed ? (
            <div className="sidebar-info">
              <div className="sidebar-repo-row">
                <span className="sidebar-repo-icon"><IconFolderGit2 /></span>
                <span className="sidebar-repo-name">{repoName} /</span>
                <span className="sidebar-branch-icon"><IconGitBranch /></span>
                <span className="sidebar-branch-name">{repo?.baseRef ?? "HEAD"}</span>
              </div>
              {!exportMode ? (
                <div className="sidebar-stats-row">
                  <span className="sidebar-stats-label">// changed_files</span>
                  <div className="sidebar-stats-grp">
                    {statsAdded > 0 ? <span className="sidebar-stat-add">+{statsAdded}</span> : null}
                    {statsModified > 0 ? <span className="sidebar-stat-mod">~{statsModified}</span> : null}
                    {statsDeleted > 0 ? <span className="sidebar-stat-del">-{statsDeleted}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* File tree / export file list */}
          <div id="changed-files-panel" className="sidebar-body" aria-hidden={isSidebarCollapsed}>
            {!apiClient ? null : exportMode ? (
              <ul className="change-list">
                {filesWithComments.map((change) => {
                  const filePath = getChangePath(change);
                  const fileName = filePath.split("/").at(-1) ?? filePath;
                  const totalCount = change.commentCounts.current + change.commentCounts.outdated;
                  return (
                    <li key={change.changeId} className="change-tree-node">
                      <div className="change-item change-tree-file">
                        <span className="change-tree-file-row">
                          <span className="change-tree-file-icon" aria-hidden="true"><IconFileText /></span>
                          <span className="path-text">{fileName}</span>
                          {totalCount > 0 ? (
                            <span className="change-comment-count" aria-label={`${totalCount} comments`}>{totalCount}</span>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="change-list change-tree">{renderChangeTree(changeTree.children, viewedChangeIds)}</ul>
            )}
          </div>

          {/* Footer */}
          {exportMode ? (
            <div className="sidebar-footer">
              <span className="export-total-label">// {totalCommentCount} comment{totalCommentCount !== 1 ? "s" : ""} total</span>
            </div>
          ) : null}
        </aside>

        {/* ── Resizer ── */}
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
            if (isSidebarCollapsed) return;
            event.preventDefault();
            setIsResizingSidebar(true);
          }}
          onKeyDown={(event) => {
            if (isSidebarCollapsed) return;
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

        {/* ── Main area ── */}
        <section className="review-pane">
          {!apiClient ? null : exportMode ? (
            <>
              {/* Export Header */}
              <div className="export-header">
                <span className="export-header-icon"><IconFileText /></span>
                <span className="export-header-title">review_comments.txt</span>
                <span className="export-header-subtitle">// {totalCommentCount} comment{totalCommentCount !== 1 ? "s" : ""} · {filesWithComments.length} file{filesWithComments.length !== 1 ? "s" : ""}</span>
                <div className="export-header-spacer" />
                <label className="export-skip-outdated-toggle">
                  <input type="checkbox" checked={skipOutdated} onChange={handleToggleSkipOutdated} />
                  <span>Skip outdated</span>
                </label>
                <button type="button" className="export-copy-btn" onClick={handleCopy} disabled={exportLoading || exportText.length === 0}>
                  <IconClipboard />
                  {copyConfirm ? "copied!" : "copy"}
                </button>
                <button type="button" className="export-download-btn" onClick={handleDownload} disabled={exportLoading || exportText.length === 0}>
                  <IconExport />
                  save .txt
                </button>
                <button type="button" className="export-close-btn" aria-label="Close export" onClick={exitExportMode}>
                  <IconX />
                </button>
              </div>

              {/* Export Content */}
              <div className="export-content">
                <div className="export-tip-bar">
                  <span className="export-tip-icon"><IconTerminal /></span>
                  <span className="export-tip-text">// paste directly into your AI assistant as context for code review</span>
                </div>
                <div className="export-text-area">
                  {exportLoading ? (
                    <span className="export-loading-text">// loading comments…</span>
                  ) : (
                    <pre className="export-text-pre">{exportText}</pre>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
          {/* Toolbar — controls row */}
          <div className="main-toolbar">
            <div className="view-toggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "side-by-side" ? "active" : ""}`}
                onClick={() => setViewMode("side-by-side")}
              >
                <IconColumns2 />
                side_by_side
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === "unified" ? "active" : ""}`}
                onClick={() => setViewMode("unified")}
              >
                <IconList />
                unified
              </button>
            </div>

            <div className="toolbar-sep" aria-hidden="true" />

            <label className="context-select">
              <span className="ctx-prefix">ctx:</span>
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
              <IconChevronDown />
            </label>

            <div className="toolbar-sep" aria-hidden="true" />

            {viewMode === "unified" ? (
              <button
                type="button"
                className={`hide-removed-toggle ${hideRemovedCode ? "active" : ""}`}
                onClick={() => setHideRemovedCode((current) => !current)}
                aria-pressed={hideRemovedCode}
              >
                <IconEyeOff />
                hide_removed
                <span className="toggle-track" aria-hidden="true" />
              </button>
            ) : null}

            <div className="toolbar-spacer" />

            <button
              type="button"
              className="toolbar-pill-btn toolbar-pill-btn-theme"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "light mode" : "dark mode"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <IconMoon /> : <IconSun />}
            </button>

            <button
              type="button"
              className="toolbar-pill-btn toolbar-pill-btn-labeled"
              aria-label="Refresh"
              title="refresh"
              onClick={() => void refreshAll()}
            >
              <IconRefresh />
              <span>refresh</span>
            </button>

            <button
              type="button"
              className="toolbar-pill-btn toolbar-pill-btn-labeled"
              onClick={() => void enterExportMode()}
            >
              <IconExport />
              <span>export_comments</span>
            </button>

            {crloopRepoId ? (
              <button
                type="button"
                className="toolbar-pill-btn toolbar-pill-btn-labeled toolbar-pill-btn-cta"
                onClick={() => {
                  if (apiClient && confirm("Finish review and hand back to the agent?")) {
                    void apiClient.transitionSession("agent-addressing");
                  }
                }}
              >
                <IconGitPullRequest />
                <span>finish_review</span>
              </button>
            ) : null}
          </div>

          {/* File header — breadcrumb + line counts */}
          {selectedChange ? (
            <div className="file-header">
              <span className="fh-file-icon">
                <IconFileCode />
              </span>
              <span className="fh-path">
                {breadcrumbLabel ? <>{breadcrumbLabel}<strong>{breadcrumbFile}</strong></> : <strong>{breadcrumbFile ?? "—"}</strong>}
              </span>
              <div className="fh-spacer" />
              {linesAdded > 0 ? <span className="fh-badge fh-badge-added">+{linesAdded}</span> : null}
              {linesRemoved > 0 ? <span className="fh-badge fh-badge-removed">-{linesRemoved}</span> : null}
            </div>
          ) : null}

          {error ? <div className="error-banner">{error}</div> : null}

          {/* Diff content */}
          {loading ? <div className="empty-state">// loading…</div> : null}
          {!loading && selectedChange ? (
            <div className="diff-scroll-wrap">
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
            </div>
          ) : null}
          {!loading && !selectedChange ? (
            <div className="empty-state">// no changed files found</div>
          ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
