# crloop — Agent Usage Guide

`crloop` is a local code-review loop server. An agent controls it via the CLI or directly via its HTTP API.

## Startup invariant

**Always start the server before any other command.**

```sh
crloop serve --repo /path/to/repo --port 3000
```

The server runs as a background daemon. Subsequent commands talk to it over HTTP.

## Machine-readable output

Every command except `serve` accepts `--json` to emit JSON instead of human text. Always use `--json` when parsing output programmatically.

```sh
crloop repos --json
# → [{"id":"my-repo","path":"/path/to/repo"}]

crloop add-repo /path/to/repo --json
# → {"id":"my-repo","path":"/path/to/repo"}

crloop remove-repo my-repo --json
# → {"id":"my-repo"}

crloop stop-server --json
# → {"stopped":true}
```

## Schema introspection

Get the full parameter schema for any command at runtime — no documentation needed:

```sh
crloop schema             # all commands
crloop schema add-repo    # single command
```

## Dry-run before mutations

Use `--dry-run` on any command that changes state. Combine with `--json` for structured output:

```sh
crloop add-repo /path/to/repo --dry-run --json
# → {"dryRun":true,"id":"repo","path":"/path/to/repo"}

crloop remove-repo my-repo --dry-run --json
# → {"dryRun":true,"id":"my-repo"}
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (details on stderr) |

Errors always go to **stderr**. Successful output always goes to **stdout**.

## HTTP API

The CLI is a thin wrapper over an HTTP API. Agents may call the API directly for richer data.

| Endpoint | Method | Description |
|---|---|---|
| `/api/repos` | GET | List registered repos |
| `/api/repos` | POST | Register a repo `{"path":"...","id":"..."}` |
| `/api/repos/:id` | DELETE | Remove a repo |
| `/api/repos/:id/repo` | GET | Repo info (baseRef, changeCount) |
| `/api/repos/:id/changes` | GET | List file changes |
| `/api/repos/:id/changes/:changeId` | GET | Single file diff |
| `/api/repos/:id/comments` | GET | All review comments |
| `/api/repos/:id/comments` | POST | Add a comment |
| `/api/repos/:id/comments/:commentId` | PATCH | Edit a comment |
| `/api/repos/:id/comments/:commentId` | DELETE | Delete a comment |
| `/api/server/stop` | POST | Gracefully stop the server |

All responses are JSON. Errors return `{"error":"..."}`.

## Repo ID derivation

If `--id` is omitted, the ID is derived from the directory basename:
- Lowercased
- Non-alphanumeric characters → `-`
- Consecutive hyphens collapsed
- Leading/trailing hyphens stripped
- Fallback: `"repo"`

Examples: `my_frontend` → `my-frontend`, `Backend.API` → `backend-api`

## Common workflows

### Review a PR branch

```sh
crloop serve --repo /path/to/repo
crloop repos --json                              # verify repo is registered
curl http://localhost:3000/api/repos/my-repo/changes   # list changed files
curl "http://localhost:3000/api/repos/my-repo/changes/src%2Ffoo.ts"  # get diff
curl -X POST http://localhost:3000/api/repos/my-repo/comments \
  -H 'Content-Type: application/json' \
  -d '{"changeId":"src/foo.ts","line":42,"body":"Consider using X here."}'
```

### Add a repo at runtime

```sh
crloop add-repo /new/repo --dry-run --json   # preview
crloop add-repo /new/repo --json             # apply
```

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **code-review** (941 symbols, 1645 relationships, 76 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/code-review/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/code-review/context` | Codebase overview, check index freshness |
| `gitnexus://repo/code-review/clusters` | All functional areas |
| `gitnexus://repo/code-review/processes` | All execution flows |
| `gitnexus://repo/code-review/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
