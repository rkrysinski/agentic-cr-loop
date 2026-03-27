# Fix: Cygwin path handling

## Problem

On Cygwin with native Windows Node.js (`process.platform === "win32"`), `crloop add-repo` fails with "Not a git repository" even for valid repos, while `--dry-run` succeeds.

### Root cause

Two path translation bugs when running under Cygwin:

1. **CLI** (`src/server/cli.ts:213`): `path.resolve("/home/rex/repo")` produces `C:\home\rex\repo` instead of `C:\cygwin64\home\rex\repo`.
2. **Server** (`src/server/reviewService.ts:274-280`): Cygwin git's `--show-toplevel` returns `/home/rex/repo`, which `normalizeGitTopLevel` passes to `path.resolve()` producing the same wrong result.

The existing MSYS normalization (`/c/... → C:\...`) doesn't cover Cygwin's virtual filesystem paths (`/home/...`, `/usr/...`, etc.).

### Why `--dry-run` works

`--dry-run` only runs `path.resolve()` and prints — it never contacts the server, so no git validation occurs.

### Confirmed diagnostics (Cygwin terminal)

```
$ node -e "console.log(process.platform)"
win32

$ node -e "console.log(require('path').resolve('/home/rex/repo'))"
C:\home\rex\repo          # WRONG

$ cygpath -w /home/rex/repo
C:\cygwin64\home\rex\repo  # CORRECT
```

## Approach

Add a `cygpath -w` based translation utility in `src/server/git.ts`, then use it in both affected locations. The helper caches Cygwin detection so `cygpath` is only probed once per process.

## Changes

### 1. ~~Add Cygwin path helper — `src/server/git.ts`~~ ✅

```typescript
import path from "node:path";

/** Cached detection: is cygpath available? */
let cygpathAvailable: boolean | null = null;

async function hasCygpath(): Promise<boolean> {
  if (cygpathAvailable !== null) return cygpathAvailable;
  try {
    await execFileAsync("cygpath", ["--version"]);
    cygpathAvailable = true;
  } catch {
    cygpathAvailable = false;
  }
  return cygpathAvailable;
}

/** Convert a path to a native Windows path via cygpath, if available. Falls back to path.resolve(). */
export async function resolveNativePath(p: string): Promise<string> {
  if (process.platform === "win32" && await hasCygpath()) {
    try {
      const { stdout } = await execFileAsync("cygpath", ["-w", p]);
      return stdout.trim();
    } catch { /* fall through */ }
  }
  return path.resolve(p);
}
```

### 2. ~~Fix `normalizeGitTopLevel` — `src/server/reviewService.ts`~~ ✅

Make it async and use `resolveNativePath` for the non-MSYS case:

```typescript
async function normalizeGitTopLevel(raw: string): Promise<string> {
  if (process.platform === "win32") {
    const msys = /^\/([a-zA-Z])(\/|$)/.exec(raw);
    if (msys) return path.resolve(`${msys[1].toUpperCase()}:${raw.slice(2)}`);
    return resolveNativePath(raw);
  }
  return path.resolve(raw);
}
```

Update `syncReviewSession` to `await` the call (already async).

### 3. ~~Fix CLI path resolution — `src/server/cli.ts:213`~~ ✅

```typescript
// Before
const absolutePath = resolve(repoPath);

// After
const absolutePath = await resolveNativePath(repoPath);
```

Import `resolveNativePath` from `./git.js`.

### 4. ~~Fix server-side path resolution — `src/server/server.ts:65`~~ ✅

```typescript
// Before
const resolvedPath = path.resolve(body.path);

// After
const resolvedPath = await resolveNativePath(body.path);
```

Import `resolveNativePath` from `./git.js`.

## Files to modify

| File | Change |
|------|--------|
| `src/server/git.ts` | Add `resolveNativePath` + `hasCygpath` helper |
| `src/server/reviewService.ts` | Make `normalizeGitTopLevel` async, use `resolveNativePath` |
| `src/server/cli.ts` | Use `resolveNativePath` for input path |
| `src/server/server.ts` | Use `resolveNativePath` for incoming path |

## Verification

1. `npm run build` — no type errors
2. `npm test` — all existing tests pass
3. No regression on macOS/Linux (no `cygpath` binary → falls back to `path.resolve`)
4. Manual test on Cygwin: `crloop add-repo /home/rex/repo --id repo` should succeed

## Post-implementation checklist

**Implementation summary:** Added `resolveNativePath` helper using `cygpath -w` to translate Cygwin virtual paths to native Windows paths, applied in CLI, server, and git-toplevel normalization.

**Tasks completed:** 4
**Tasks skipped:** 0
**Tests:** passed (198/198)

### SHOULD — Important but does not block shipping

- [ ] `CHANGELOG.md` — add entry for Cygwin path fix under next version

### CONSIDER — Low-priority or optional

- [ ] `package.json` — patch version bump for this bug fix
- [ ] `src/server/git.test.ts` — add unit test for `resolveNativePath` (currently no test file for `git.ts`; function is a thin `cygpath` wrapper, hard to test without Cygwin environment)

**Artifacts not found:** QA scripts (`scripts/qa/`, `qa/`)
