import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 480;
const KEYBOARD_RESIZE_STEP = 32;
const DEFAULT_DIFF_CONTEXT: DiffContextValue = "full";

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

// ─── Icons ────────────────────────────────────────────────────

function IconColumns2() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <path d="M12 3v18" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function IconFileCode() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconGitPullRequest() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconFolderGit2() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5" />
      <circle cx="13" cy="12" r="2" />
      <path d="M18 19c-2.8 0-5-2.2-5-5v8" />
      <circle cx="20" cy="19" r="2" />
    </svg>
  );
}

function IconGitBranch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconFolderOpen() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.41.59l.99.99A2 2 0 0 0 12.73 5H18a2 2 0 0 1 2 2" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── App ──────────────────────────────────────────────────────

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
  const [selectedChangeRefreshKey, setSelectedChangeRefreshKey] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [exportMode, setExportMode] = useState(false);
  const [exportComments, setExportComments] = useState<Map<string, CommentsResponse>>(new Map());
  const [exportLoading, setExportLoading] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);

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
  }, [selectedChangeId, diffContext, selectedChangeRefreshKey]);

  async function refreshAll() {
    try {
      setLoading(true);
      setError(null);
      const [repoInfo, nextChanges] = await Promise.all([getRepo(), getChanges()]);
      const nextSelectedChangeId =
        selectedChangeId && nextChanges.some((change) => change.changeId === selectedChangeId)
          ? selectedChangeId
          : nextChanges[0]?.changeId ?? null;
      const shouldRefreshSelectedChange = nextSelectedChangeId !== null && nextSelectedChangeId === selectedChangeId;
      setRepo(repoInfo);
      setChanges(nextChanges);
      setViewMode(repoInfo.viewModeDefault);
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

  async function enterExportMode() {
    setExportMode(true);
    const filesWithComments = changes.filter(
      (c) => c.commentCounts.current > 0 || c.commentCounts.outdated > 0
    );
    if (filesWithComments.length === 0) {
      return;
    }
    setExportLoading(true);
    try {
      const results = await Promise.all(filesWithComments.map((c) => getComments(c.changeId)));
      const map = new Map<string, CommentsResponse>();
      filesWithComments.forEach((c, i) => {
        map.set(c.changeId, results[i]!);
      });
      setExportComments(map);
    } finally {
      setExportLoading(false);
    }
  }

  function exitExportMode() {
    setExportMode(false);
    setExportComments(new Map());
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
                <IconChevronDown />
              </span>
              <span className="change-tree-folder-icon" aria-hidden="true">
                <IconFolderOpen />
              </span>
              <span className="change-tree-label">{collapsedDirectory.label}</span>
            </button>
            {isExpanded ? <ul className="change-tree-children">{renderChangeTree(collapsedDirectory.node.children, depth + 1)}</ul> : null}
          </li>
        );
      }

      const treeDepthStyle = { "--tree-depth": depth } as CSSProperties;
      const filePath = getChangePath(node.change);
      const segments = filePath.split("/");
      const isSelected = selectedChangeId === node.change.changeId;

      return (
        <li key={node.key} className="change-tree-node">
          <button
            type="button"
            className={`change-item change-tree-file ${isSelected ? "selected" : ""}`}
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
              {isSelected ? <span className="change-tree-active-dot" aria-hidden="true" /> : null}
              <span className="change-tree-file-icon" aria-hidden="true">
                <IconFileCode />
              </span>
              <span className="path-text">{segments.at(-1)}</span>
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
  const repoName = repo?.repoPath ? (repo.repoPath.split("/").filter(Boolean).at(-1) ?? repo.repoPath) : "…";
  const statsAdded = changes.filter((c) => c.changeType !== "deleted").length;
  const statsDeleted = changes.filter((c) => c.changeType === "deleted").length;
  const filesWithComments = changes.filter(
    (c) => c.commentCounts.current > 0 || c.commentCounts.outdated > 0
  );
  const totalCommentCount = filesWithComments.reduce(
    (sum, c) => sum + c.commentCounts.current + c.commentCounts.outdated,
    0
  );

  function buildExportText(): string {
    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push(`CODE REVIEW  ·  ${repoName}  ·  branch: ${repo?.baseRef ?? "HEAD"}  ·  ${today}`);
    lines.push("━".repeat(50));
    for (const change of filesWithComments) {
      const path = getChangePath(change);
      const fileComments = exportComments.get(change.changeId);
      lines.push("", `FILE: ${path}`, "");
      for (const c of fileComments?.current ?? []) {
        lines.push(`[COMMENT · Line ${c.lineNumber} · side: ${c.side}]`);
        lines.push(c.body);
        lines.push("");
      }
      for (const c of fileComments?.outdated ?? []) {
        lines.push(`[OUTDATED COMMENT · Line ${c.lineNumber} · side: ${c.side}]`);
        lines.push(c.body);
        lines.push("");
      }
    }
    return lines.join("\n");
  }

  function handleCopy() {
    void navigator.clipboard.writeText(buildExportText()).then(() => {
      setCopyConfirm(true);
      setTimeout(() => setCopyConfirm(false), 1500);
    });
  }

  function handleDownload() {
    const text = buildExportText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review_comments.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build breadcrumb and line counts from selected file
  const selectedFilePath = selectedChange ? getChangePath(selectedChange) : null;
  const breadcrumbParts = selectedFilePath ? selectedFilePath.split("/") : null;
  const breadcrumbLabel = breadcrumbParts
    ? breadcrumbParts.slice(0, -1).join(" / ") + (breadcrumbParts.length > 1 ? " / " : "")
    : null;
  const breadcrumbFile = breadcrumbParts?.at(-1) ?? null;
  const linesAdded = selectedChange
    ? selectedChange.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === "added").length, 0)
    : 0;
  const linesRemoved = selectedChange
    ? selectedChange.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === "removed").length, 0)
    : 0;

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
                    {statsDeleted > 0 ? <span className="sidebar-stat-del">-{statsDeleted}</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* File tree / export file list */}
          <div id="changed-files-panel" className="sidebar-body" aria-hidden={isSidebarCollapsed}>
            {exportMode ? (
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
              <ul className="change-list change-tree">{renderChangeTree(changeTree.children)}</ul>
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
          {exportMode ? (
            <>
              {/* Export Header */}
              <div className="export-header">
                <span className="export-header-icon"><IconFileText /></span>
                <span className="export-header-title">review_comments.txt</span>
                <span className="export-header-subtitle">// {totalCommentCount} comment{totalCommentCount !== 1 ? "s" : ""} · {filesWithComments.length} file{filesWithComments.length !== 1 ? "s" : ""}</span>
                <div className="export-header-spacer" />
                <button type="button" className="export-copy-btn" onClick={handleCopy}>
                  <IconClipboard />
                  {copyConfirm ? "copied!" : "copy"}
                </button>
                <button type="button" className="export-download-btn" onClick={handleDownload}>
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
                    <>
                      <span className="export-hdr-line">CODE REVIEW  ·  {repoName}  ·  branch: {repo?.baseRef ?? "HEAD"}  ·  {new Date().toISOString().slice(0, 10)}</span>
                      <div className="export-divider" />
                      {filesWithComments.length === 0 ? (
                        <span className="export-empty-text">// no comments found</span>
                      ) : null}
                      {filesWithComments.map((change, idx) => {
                        const path = getChangePath(change);
                        const fileComments = exportComments.get(change.changeId);
                        return (
                          <div key={change.changeId} className="export-file-section">
                            {idx > 0 ? <div className="export-divider" /> : null}
                            <span className="export-file-hdr">FILE: {path}</span>
                            {fileComments?.current.map((c) => (
                              <div key={c.commentId} className="export-comment-card">
                                <span className="export-comment-meta">[COMMENT · Line {c.lineNumber} · side: {c.side}]</span>
                                <span className="export-comment-body">{c.body}</span>
                              </div>
                            ))}
                            {fileComments?.outdated.map((c) => (
                              <div key={c.commentId} className="export-comment-card export-comment-card-outdated">
                                <span className="export-comment-meta export-comment-meta-outdated">[OUTDATED · Line {c.lineNumber} · side: {c.side}]</span>
                                <span className="export-comment-body export-comment-body-outdated">{c.body}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </>
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
              <button type="button" className="fh-collapse-btn" aria-label="Collapse file">
                <IconChevronUp />
              </button>
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
