# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**crloop** is a local code review tool that provides a browser-based UI for reviewing Git diffs, annotating changed lines with comments, and exporting structured Markdown for AI feedback loops. It runs entirely on the user's machine with no external services.

## Commands

```bash
# Development
npm run dev -- --repo /path/to/repo   # Start dev mode (Vite HMR + Express watch)
npm run build                          # Full build: client (Vite) + server (tsc)
npm run build:client                   # Bundle React to dist/client/
npm run build:server                   # Compile TypeScript to dist/server/
npm start                              # Run compiled server

# Testing
npm test                               # Run all tests once (Vitest)
npm run test:watch                     # Watch mode
npx vitest run src/server/server.test.ts   # Run a single test file
```

## Architecture

The project is a full-stack TypeScript ES-module app split into three layers:

### `src/server/` — Express API
- **`cli.ts`** — Binary entry point (`crloop` command). Handles CLI commands and daemonization by spawning a child process with `CRLOOP_DAEMON=1` and detaching.
- **`server.ts`** — Express 5 app with all REST routes, including per-repo sub-routes under `/:repoId`.
- **`reviewService.ts`** — Per-repo orchestration. All business logic lives here (diff fetching, comment classification, export generation).
- **`git.ts`** — Thin wrapper that shells out to the `git` CLI.
- **`diffParser.ts`** — Converts unified patch text into a typed diff model (hunks, lines with old/new positions).
- **`commentStore.ts`** — Reads/writes comment JSON files persisted at `.local-code-review/<HEAD-short-id>.json` inside each repo.
- **`exporter.ts`** — Generates structured Markdown from comments for AI consumption.

### `src/client/` — React 19 UI
- **`App.tsx`** — ~960-line root component. Manages all UI state: selected file, diff context, comments, theme, sidebar width, export mode.
- **`RepoContext.tsx`** — Multi-repo context provider, wraps the API client.
- **`diffView.tsx`** — Renders unified and side-by-side diff views with line-click handlers for comment anchoring.
- **`api.ts`** — Typed HTTP client wrapping `fetch` against the Express API.
- **`hooks.ts`** — `usePersistedState` hook for localStorage-backed state.

### `src/shared/` — Shared types and utilities
- **`types.ts`** — Core types: `FileChange`, `ReviewComment`, `DiffLine`, `DiffHunk`.
- **`api.ts`** — API request/response type definitions used by both server and client.
- **`export.ts`** — Markdown export formatter logic (shared, server calls it).
- **`changePaths.ts`** — File path utilities for deriving stable `changeId` values.

### Build outputs
- `dist/client/` — Vite-bundled React app (served as static files by Express in production)
- `dist/server/` — `tsc`-compiled server code; `dist/server/server/cli.js` is the npm binary

## Key Design Decisions

- **Git CLI as source of truth** — Server shells out to `git`; no git library dependency.
- **Comment storage** — Comments are stored in `.local-code-review/<HEAD-short-id>.json` inside each reviewed repository (not the crloop repo itself).
- **Diff fingerprinting** — Comments are anchored to a SHA256 hash of the diff hunk context, so they can be marked "outdated" when the diff changes.
- **Single diff model** — `diffParser.ts` produces one canonical model shared by both unified and side-by-side views.
- **Dev proxy** — Vite dev server (port 5173) proxies `/api/*` to Express (port 3000).

## Test Setup

- **Framework**: Vitest with jsdom environment for all tests (server + client share one config)
- **Client tests**: `@testing-library/react` + `@testing-library/jest-dom`
- **Server API tests**: `supertest` against the Express app
- **Setup file**: `src/client/test/setup.ts` imports jest-dom matchers globally
