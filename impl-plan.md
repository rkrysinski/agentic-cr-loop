# Implementation Plan: Synchronous (Foreground) Server Mode

Design reference: free-form description — "option to start server in synchronous mode which prints all logs, for debugging on client machines"

## Context

| File | Current role |
|------|-------------|
| `src/server/cli.ts` | CLI entry point. The `serve` command spawns a detached daemon with `stdio: "ignore"` and exits immediately. All server output is discarded. |
| `src/server/runServer.ts` | Calls `parseServerOptions` → `startServer` → `server.listen`. Logs a single "listening on" line. |
| `src/server/args.ts` | Parses `--repo` and `--port` from argv. No `--foreground` flag exists. |
| `src/server/server.ts` | Express app factory. No request logging middleware. |

## Tasks

### `src/server/args.ts` — parse `--foreground` flag

- [x] Add `foreground: boolean` field to `ServerOptions` type
- [x] Parse `--foreground` flag in `parseServerOptions` and set it on the returned object

### `src/server/cli.ts` — run in-process when `--foreground` is set

- [x] In the `serve` branch of `main()`, when `parsedOpts.foreground` is true: call `runServer({ argv })` directly in the current process (same as the daemon path but without spawning), write the lock file, register `process.on("SIGINT"/"SIGTERM")` to clean up the lock file and exit, and block (the server keeps the event loop alive)
- [x] When `--foreground` is not set: keep the existing daemon-spawn behavior unchanged

### `src/server/server.ts` — add request logging middleware

- [x] Add a request-logging middleware at the top of the Express stack that logs each request: method, URL, status code, and duration in ms. Use `console.log` so output goes to stdout. Only enable when a `verbose` option is passed to `startServer`.

### `src/server/runServer.ts` — thread `foreground`/`verbose` through

- [x] Accept a `verbose` option and pass it to `startServer` so the request logger activates in foreground mode

### `src/server/cli.ts` — update help text and schema

- [x] Add `--foreground` to the `serve` usage line in `printHelp()`
- [x] Add `--foreground` option to the `serve` entry in `cmdSchema()`

## Test coverage

- [x] `src/server/args.test.ts` — `parseServerOptions` returns `foreground: true` when `--foreground` is present, `false` when absent
- [x] `src/server/cli.test.ts` — `--help` output contains `--foreground`; schema for `serve` includes `--foreground`
- [x] `src/server/cli.test.ts` — `crloop serve --foreground --repo <path> --port <N>` starts the server in the current process (stdout contains "listening on"), and the process stays alive until killed (use a short timeout spawn and verify it did not exit on its own)

## Docs and traceability

- [x] `docs/usage.md` — add a "Foreground / debug mode" section under "Starting the server" explaining `crloop serve --foreground --repo <path>` and that it prints request logs to stdout
- [x] `docs/requirements.md` — added FR-66 for foreground mode

## Post-implementation checklist

**Implementation summary:** Added `--foreground` flag to `crloop serve` that runs the server in the current process with HTTP request logging to stdout for diagnostics.

**Tasks completed:** 11
**Tasks skipped:** 0
**Tests:** passed (188/188)

> No follow-up items found. All changed interfaces appear to be covered by existing docs, tests, and QA scripts.

**Artifacts not found:** CHANGELOG.md, QA scripts (`scripts/qa/`, `qa/`)
