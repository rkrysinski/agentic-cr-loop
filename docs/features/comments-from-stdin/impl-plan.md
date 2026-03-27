# Implementation Plan: `--from-stdin` for `crloop comment`

Design reference: free-form description — "Add `--from-stdin` flag to `crloop comment` so the agent can pipe JSON findings directly via stdin, eliminating the `/tmp/findings.json` file and the Write tool permission issues that break repeat runs"

## Context

| File | Current role |
|------|-------------|
| `src/server/cli.ts` | CLI entry point. `cmdComment` (line 344) handles both single-comment mode (`--file/--side/--line/--body`) and bulk mode (`--from-file`). Bulk mode reads a JSON file with `readFileSync`, parses the array, and POSTs each entry to the Express API. |
| `src/server/cli.test.ts` | CLI tests using `spawnSync` via a `runCli` helper. Tests cover info flags, serve, schema, dry-run, JSON output, skill, and input validation. No tests exist for `--from-file` or bulk comment mode. |
| `skill/crloop/SKILL.md` | Agent skill file. Step 2 instructs the agent to write findings to `/tmp/findings.json` then run `crloop comment --from-file /tmp/findings.json`. This is the root cause of the Write tool permission issue. |
| `docs/usage.md` | User-facing docs. Documents `crloop comment --from-file findings.json` in the "Posting comments" and "Typical agentic workflow" sections. |
| `docs/cli-guidelines.md` | CLI design rules. Documents that `--from-file` exists on the `comment` command. States "Zero new dependencies" rule. |
| `docs/requirements.md` | FR-55: CLI MUST provide `comment` command supporting single-comment mode and bulk mode (`--from-file`), with `--dry-run`. |

## Tasks

### `src/server/cli.ts` — Add `--from-stdin` flag

- [x] In `cmdComment` (line 344): add `const fromStdin = hasFlag(args, "--from-stdin")` alongside existing `fromFile` check
- [x] Add mutual-exclusion guard: if both `fromFile` and `fromStdin` are truthy, print error and `process.exit(1)`
- [x] Refactor bulk-mode content loading: extract `content` variable above the `if (fromFile)` block so both `fromFile` and `fromStdin` set it and share the same JSON parse + POST loop (lines 384–429). Use `readFileSync(0, "utf8")` for stdin (fd 0, already imported from `node:fs`)
- [x] In the `if (!fromFile)` guard (line 350): change to `if (!fromFile && !fromStdin)` so single-comment validation is skipped in stdin mode
- [x] In the usage error message (line 357–358): add third usage line `crloop comment --from-stdin [--repo <repoId>] [--url URL] [--dry-run]`

### `src/server/cli.ts` — Update schema and help text

- [x] In `cmdSchema` schema object (line 782, `comment.options`): add `"--from-stdin": { type: "boolean", description: "Read JSON comment array from stdin" }`
- [x] In `printHelp` (line 876): add usage line `crloop comment --from-stdin [--repo <repoId>] [--url URL] [--dry-run]`

## Test coverage

- [x] `src/server/cli.test.ts` — Add test: `comment --from-stdin` with valid JSON piped via stdin posts comments (requires a live server in the test, similar to the existing `--json flag (live server)` describe block)
- [x] `src/server/cli.test.ts` — Add test: `comment --from-stdin --from-file` together exits 1 with mutual-exclusion error
- [x] `src/server/cli.test.ts` — Add test: `comment --from-stdin` with empty stdin exits 1 (JSON parse error)
- [x] `src/server/cli.test.ts` — Add test: schema output includes `--from-stdin` option for the `comment` command

## Docs and traceability

- [x] **MUST** `skill/crloop/SKILL.md` — Replace `/tmp/findings.json` workflow in Step 2 with `--from-stdin` using heredoc pattern: `npx crloop comment --from-stdin <<'FINDINGS_EOF'`. Remove all references to writing `/tmp/findings.json`. Add explicit note: "Do NOT use the Write tool or `--from-file` — always pipe via stdin"
- [x] **MUST** `docs/usage.md` — Add `--from-stdin` as a third option in the "Posting comments" section, alongside single-comment and `--from-file`. Update "Typical agentic workflow" example to show the stdin pattern
- [x] **MUST** `docs/requirements.md` — Update FR-55 to include `--from-stdin` alongside `--from-file` as a supported bulk input method
- [x] **SHOULD** `CHANGELOG.md` — Add entry under `[Unreleased]`: "Added `--from-stdin` flag to `crloop comment` for piping JSON findings directly from stdin, eliminating the need for a temporary file"
- [x] **SHOULD** `docs/cli-guidelines.md` — No changes needed (guidelines are generic; `--from-stdin` follows existing patterns)

**Artifacts not found:** No QA scripts reference `crloop comment` or `--from-file`, so no QA script updates needed.

## Post-implementation checklist

**Implementation summary:** Added `--from-stdin` flag to `crloop comment` for piping JSON findings directly from stdin, with mutual-exclusion guard against `--from-file`, 4 new tests, and updated all relevant docs.

**Tasks completed:** 16
**Tasks skipped:** 0
**Tests:** passed (198/198)

> No follow-up items found. All changed interfaces appear to be covered by existing docs, tests, and QA scripts.

**Artifacts not found:** QA scripts, release.md
