# Design: Viewed/Unviewed File State

## Overview

Track which files a user has opened during a code review session. Files appear visually distinct (unviewed indicator) until the user clicks them. The state persists across browser refresh and server restarts, and resets automatically when the HEAD commit advances.

No new server endpoints, no schema changes, no new dependencies.

## Requirements

- All files show an "unviewed" indicator when a repo is first opened
- Clicking a file (or auto-selecting on repo entry) marks it viewed; the indicator disappears
- State persists after browser refresh and server restart
- State resets when HEAD changes (new commit = new review cycle)
- State is local to the machine (no cross-device sync needed)

## Decision: localStorage keyed by repo, invalidated by HEAD

### Storage format

One localStorage key per repo:

```
crloop.viewed.{repoId}  →  { "head": "a1b2c3d4e5f6", "ids": ["changeId-foo", "changeId-bar"] }
```

On read, compare the stored `head` against the current HEAD short SHA. If they match, restore the Set. If they differ, discard and start fresh.

```ts
function readViewedState(key: string, currentHead: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const { head, ids } = JSON.parse(raw);
    if (head !== currentHead) {
      localStorage.removeItem(key);
      return new Set();
    }
    return new Set(ids as string[]);
  } catch {
    return new Set();
  }
}
```

On write, always include the current HEAD so stale detection works on next load:

```ts
localStorage.setItem(key, JSON.stringify({ head: currentHead, ids: [...set] }));
```

### Why not one key per HEAD commit

One key per HEAD (`crloop.viewed.{repoId}.{headSha}`) accumulates stale keys over time — one per commit reviewed, never cleaned up unless the cleanup code runs. The single-key-per-repo approach avoids accumulation entirely: there is always exactly one key per repo, and the old one is overwritten when HEAD advances.

### Why not server-side storage (extending commentStore)

The viewed state is UI-only — it communicates "you have looked at this file", not anything about the diff itself. Storing it server-side would require a new API endpoint, a schema change to the session JSON, and a round-trip on every file click. localStorage is already used for all other UI state (`viewMode`, `sidebarWidth`, `theme`, etc.) and is the right layer for this.

### Why not sessionStorage

sessionStorage survives page reload but is cleared when the tab is closed. This partially satisfies the "persists after refresh" requirement but fails on "persists after server restart in a new tab". localStorage fully satisfies both.

## Implementation plan

### 1. Expose `headShortId` from the server

The server already computes `headShortId` (`git rev-parse --short=12 HEAD`) inside `syncReviewSession()` in `reviewService.ts` but does not return it to the client. One field addition is needed.

**[src/shared/api.ts](../../src/shared/api.ts)** — add to `RepoInfoResponse`:
```ts
headShortId: string;
```

**[src/server/reviewService.ts](../../src/server/reviewService.ts)** — promote to instance property and return from `getRepoInfo()`:
```ts
private headShortId = "";
// inside syncReviewSession():
this.headShortId = (await runGit(...)).trim();
// inside getRepoInfo():
return { ..., headShortId: this.headShortId };
```

**[src/server/server.ts](../../src/server/server.ts)** — include in the `/repo` response:
```ts
headShortId: info.headShortId,
```

### 2. Add `useViewedState` hook

New hook in **[src/client/hooks.ts](../../src/client/hooks.ts)**:

```ts
export function useViewedState(
  repoId: string | null,
  headShortId: string | null
): [ReadonlySet<string>, (changeId: string) => void] {
  const key = repoId ? `crloop.viewed.${repoId}` : null;

  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => {
    if (!key || !headShortId) return new Set();
    return readViewedState(key, headShortId);
  });

  const addViewed = useCallback((changeId: string) => {
    if (!key || !headShortId) return;
    setViewed((current) => {
      if (current.has(changeId)) return current;
      const next = new Set([...current, changeId]);
      try {
        localStorage.setItem(key, JSON.stringify({ head: headShortId, ids: [...next] }));
      } catch { /* ignore quota errors */ }
      return next;
    });
  }, [key, headShortId]);

  return [viewed, addViewed];
}
```

### 3. Wire up in `App.tsx`

**[src/client/App.tsx](../../src/client/App.tsx)**:

```ts
// Destructure activeRepoId from useRepo() (already computed, just not destructured today)
const { apiClient, activeRepoId } = useRepo();

// Add after existing usePersistedState block:
const [viewedChangeIds, addViewed] = useViewedState(
  activeRepoId,
  repo?.headShortId ?? null
);

// Add a new useEffect to mark files viewed on selection:
useEffect(() => {
  if (!selectedChangeId || !repo) return;
  addViewed(selectedChangeId);
}, [selectedChangeId, repo, addViewed]);
```

Note: `addViewed` should **not** be called from inside `refreshAll()` for the auto-selected file. Only explicit user clicks should mark a file viewed. The `useEffect` above fires on both, but because `repo` is null during the initial load race, the guard `!repo` prevents premature marking.

Pass `viewedChangeIds` into `renderChangeTree`:

```ts
// Signature change:
function renderChangeTree(nodes: ChangeTreeNode[], viewedIds: ReadonlySet<string>, depth = 0)

// Call site:
renderChangeTree(changeTree.children, viewedChangeIds)

// Recursive call inside directory branch:
renderChangeTree(node.children, viewedIds, depth + 1)
```

### 4. Visual indicator

> **Wireframes:** `docs/features/new-look-and-feel/new-look-and-feel.pen` — frames **"Screen 5 · Dark · File Viewed States"** and **"Screen 6 · Light · File Viewed States"** show the file tree in context. The isolated state spec is on the **"File Row · Component States"** panel in the same file.

Each file row in the change tree has exactly three mutually exclusive states:

| State | Font weight | Colors | When |
|---|---|---|---|
| **Unviewed** | ExtraBold (800) | Same as viewed — no color change | File not yet opened this HEAD |
| **Viewed** | Normal (400) | Same as unviewed — no color change | File was opened; still navigable |
| **Active** | Normal (400), highlighted row + orange dot | Primary color | Currently selected file |

Key design decisions:
- **Font weight is the sole differentiator between UNVIEWED and VIEWED.** Colors are identical across both states; only `font-weight` changes (800 vs 400). This keeps the color scheme fully consistent across dark and light themes without introducing theme-specific muted color values.
- **No dot for unviewed.** An earlier iteration used a teal dot for UNVIEWED and a transparent placeholder to preserve icon alignment. This was dropped: the bold weight alone provides sufficient signal, and removing the dot slot simplifies the DOM and eliminates horizontal jitter entirely.
- **Viewed files are not dimmed.** Users return to viewed files regularly. Muting their color (an earlier design iteration) made them hard to target. Same-color + normal weight keeps them clearly clickable while remaining visually de-prioritised relative to unviewed ones.
- **Active state is unchanged.** The existing orange dot + highlighted row already provides a strong "currently open" signal; no changes needed there.
- **No strikethrough, checkmark, or background fill.** The weight-only approach is sufficient signal and avoids cluttering a dense file list.

Row text class when viewed (not selected):

```tsx
className={`change-tree-filename ${isViewed && !isSelected ? "change-tree-filename--viewed" : "change-tree-filename--unviewed"}`}
```

**[src/client/styles.css](../../src/client/styles.css)**:

```css
.change-tree-filename--unviewed {
  font-weight: 800;
}

.change-tree-filename--viewed {
  font-weight: 400;
}
```

### 5. Estimated scope

| File | Change | ~Lines |
|---|---|---|
| `src/shared/api.ts` | Add `headShortId` to `RepoInfoResponse` | +1 |
| `src/server/reviewService.ts` | Promote to instance property, return from `getRepoInfo` | +4 |
| `src/server/server.ts` | Include in `/repo` response | +1 |
| `src/client/hooks.ts` | Add `useViewedState` hook | +25 |
| `src/client/App.tsx` | Destructure `activeRepoId`; add state + effect; update `renderChangeTree` | +20 |
| `src/client/styles.css` | Add font-weight CSS rules | +6 |
| **Total** | | **~57 lines** |

## Discarded alternatives

**One localStorage key per HEAD commit** — accumulates stale keys; requires cleanup logic. Replaced by single-key-per-repo with embedded HEAD for invalidation.

**Extend `commentStore` (server-side storage)** — adds API endpoint, storage schema change, and network round-trip per file click. The viewed state is purely presentational and belongs in the UI layer.

**sessionStorage** — lost on tab close; does not fully satisfy the persistence requirement.

**Derive from comment presence** — a file with no comments but already reviewed would still show as unviewed. Incorrect for the stated requirement.

**TTL on localStorage entries** — localStorage has no native TTL. A timestamp envelope workaround adds complexity; HEAD-based invalidation achieves the same "don't accumulate forever" property more cleanly.
