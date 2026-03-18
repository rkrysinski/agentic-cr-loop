# Development Manual

## Prerequisites

- Node.js 18+
- npm 9+
- git in PATH

## Setup

```bash
git clone <this-repo>
cd code-review
npm install
```

## Running in dev mode

```bash
npm run dev -- --repo /path/to/some/git-repo
```

This starts two processes concurrently via `scripts/dev.mjs`:

| Process | URL | Notes |
|---------|-----|-------|
| Express API | `http://localhost:3000` | TypeScript source run via `tsx`, restarts on changes |
| Vite dev server | `http://localhost:5173` | HMR, proxies `/api/*` to Express |

Open `http://localhost:5173` in your browser. The frontend auto-reloads on save; the backend restarts on save.

Multiple repos:

```bash
npm run dev -- --repo fe:/path/to/frontend --repo be:/path/to/backend
```

Custom backend port (update the `proxy` target in `vite.config.ts` to match):

```bash
npm run dev -- --repo /path/to/repo --port 4000
```

## Running the CLI in dev mode

```bash
npx tsx src/server/cli.ts serve --repo /path/to/repo
npx tsx src/server/cli.ts repos
npx tsx src/server/cli.ts add-repo /path/to/repo --id my-repo
npx tsx src/server/cli.ts remove-repo my-repo
npx tsx src/server/cli.ts --help
```

## Running tests

```bash
npm test           # single run (vitest)
npm run test:watch # watch mode
```

Tests cover the server-side units (diff parser, comment store, exporter, API routes). The test suite runs in ~1 s.

## Building

```bash
npm run build
```

This runs two steps in sequence:

1. `build:client` — Vite bundles `src/client` into `dist/client`
2. `build:server` — `tsc -p tsconfig.server.json` compiles `src/server` into `dist/server`

Output:

```
dist/
  client/        # static React app
  server/
    server/      # compiled Express app
      cli.js     # crloop binary entry point
      index.js   # standalone server entry point
```

## Project layout

```
src/
  server/        # Express API, git access, diff parser, comment store, exporter, CLI
  client/        # React UI
  shared/        # Types shared between server and client (API payloads, schema)
docs/            # Documentation
scripts/         # Build and dev scripts
```

## Key source files

| File | Purpose |
|------|---------|
| `src/server/cli.ts` | CLI entry point — `crloop` binary |
| `src/server/index.ts` | Bare server entry point — `npm start` |
| `src/server/runServer.ts` | Server bootstrap shared by CLI and index |
| `src/server/server.ts` | Express app and all API routes |
| `src/server/args.ts` | CLI argument parsing and repo ID derivation |
| `src/server/reviewService.ts` | Per-repo orchestration |
| `src/server/git.ts` | Git subprocess wrapper |
| `src/server/diffParser.ts` | Unified patch → diff model |
| `src/server/commentStore.ts` | Comment persistence in `.local-code-review/` |
| `src/server/exporter.ts` | Markdown export generation |
