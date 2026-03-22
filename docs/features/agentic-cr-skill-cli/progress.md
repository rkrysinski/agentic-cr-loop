# Progress: Agent-Human Review Loop

## End Goal

Enable a closed-loop workflow where an AI agent and a human reviewer collaborate on code changes:

1. AI agent finishes implementation (changes in git working directory)
2. AI agent self-reviews its own changes and posts comments
3. AI agent opens the review tool pre-populated with its self-review comments
4. Human reviews code changes AND agent comments in the browser — can add, edit, delete comments
5. Human signals "review complete" and all comments are exported as feedback to the agent
6. Agent addresses comments, loops back to step 2
7. Loop terminates when the human finishes review with no remaining comments

The tool ships as an npm package (`crloop`) that users install without cloning the repository.

## Approach: Skill + CLI with File-Based Coordination

### Why this approach

We evaluated six design alternatives across two rounds:

**Round 1 — Architecture** (three parallel subagents):
- A: CLI-driven orchestrator process (scored 48/80)
- B: API-first session server with SSE (scored 51/80)
- C: File-based handoff via `.local-code-review/` (scored 53/80)

Combined the best elements: C's file-based coordination as foundation, B's batch API and author attribution, A's "Finish Review" UX.

**Round 2 — Agent integration** (MCP vs Skills):
- MCP tools: ~2,400 tokens permanently in context, requires SDK dependency
- Agent Skill + CLI: ~100 tokens idle, ~1,200 tokens active, zero dependencies

Skill + CLI won decisively (scored 85 vs 70). The key insight: the agent already has Bash — it needs knowledge (a SKILL.md), not a new protocol (MCP). The CLI provides a clean command vocabulary; the skill teaches the agent when and how to use it.

**Round 3 — CLI runtime** (five alternatives):
- A: tsc-compiled Node.js (scored 71/80) — winner
- B: tsx direct execution (scored 53/80)
- C: Bash + curl + jq (scored 44/80)
- D: Go compiled binary (scored 38/80)
- E: Rust compiled binary (scored 34/80)
- F: Python script (scored 43/80)

tsc-compiled Node.js won because the project already requires Node.js, uses tsc, and hand-rolls argument parsing. Zero new dependencies, near-instant startup, compiles alongside the server.

We also evaluated WebSockets for real-time push but decided against them — polling is sufficient for a single-user local tool with infrequent state transitions.

### Architecture summary

| Layer | Role |
|---|---|
| **File-based coordination** | `session.json` in `.local-code-review/` is the source of truth for review state |
| **REST API** | Primary CRUD interface (comments, changes, session transitions) |
| **CLI** | `npx crloop <command>` — thin HTTP client, tsc-compiled, zero deps |
| **Agent Skill** | `skill/SKILL.md` — teaches agents the CLI vocabulary and review loop |
| **npm distribution** | Published to npm registry, installed via `npm install -g crloop` |

### Session state machine

```
agent-review → human-review → agent-addressing → agent-review (iteration++)
                            → complete (no comments remain)
```

Coordination via `.local-code-review/session.json`:
```json
{
  "status": "human-review",
  "iteration": 1,
  "headId": "b58557fe1d0",
  "startedAt": "2026-03-16T10:00:00.000Z",
  "updatedAt": "2026-03-16T10:01:30.000Z"
}
```

### Comment author attribution

Comments gain an optional `author?: "agent" | "human"` field. Agent comments are visually distinguished in the UI with a badge. The export format includes `[agent]` or `[human]` tags on each comment.

## Steps Completed

### 1. Requirements backfill (v1.1)

Read the entire codebase and identified features implemented but not documented in `docs/requirements.md`. Added 13 new requirements covering: comment editing/deletion, outdated detection, configurable diff context, hide-removed-lines, hierarchical file tree, comment badges, resizable sidebar, syntax highlighting, binary file handling, untracked files, rename detection, and manual refresh.

File: `docs/requirements.md`

### 2. Design exploration and decisions

Ran three rounds of parallel subagent evaluations to select:
- Architecture: file-based coordination + REST API (combined design)
- Agent integration: Skill + CLI over MCP
- CLI runtime: tsc-compiled Node.js

Evaluated WebSockets and decided against (polling sufficient for this use case).

### 3. CLI design

Designed CLI commands that wrap the HTTP API: server-management commands (`serve`, `stop-server`, `repos`, `add-repo`, `remove-repo`, `schema`) and planned agentic commands (`changes`, `diff`, `comment`, `comments`, `export`, `status`, `finish-self-review`, `wait`).

File: `docs/features/agentic-cr-skill-cli/design-skill-cli.md`

### 4. Agent Skill (draft)

Wrote `SKILL.md` covering the review loop workflow, CLI reference, self-review guidelines, feedback addressing instructions, and a full loop example. Will be finalized once the agentic CLI commands are implemented.

File: `docs/features/agentic-cr-skill-cli/skill/SKILL.md`

### 5. Distribution plan

Defined npm distribution: package name `crloop`, `files` whitelist for published tarball, `bin` entry for CLI, `prepublishOnly` build+test gate, versioning strategy, and skill distribution.

File: `docs/features/agentic-cr-skill-cli/distribution.md`

### 6. Implementation ordering decision

Decided that multi-repo support must come before the CLI/skill implementation because:
- The CLI's URL/routing model depends on how repos are addressed in the API
- The session model needs to know which repo it's operating on
- Building the CLI against a single-repo API then retrofitting multi-repo means breaking changes

### 7. Multi-repo support ✅

Added support for multiple repositories in a single server instance. Per-repo API routes now live under `/api/repos/:repoId/`. Server-management CLI commands (`serve`, `stop-server`, `repos`, `add-repo`, `remove-repo`, `schema`) are implemented and published.

Key changes:
- API routing: `/api/repos/:repoId/changes`, `/api/repos/:repoId/comments`, etc.
- `serve` accepts multiple `--repo` flags and `name:/path` syntax
- `ReviewService` instantiated per repo; `services` map keyed by repoId
- Dynamic repo registration at runtime via `add-repo` / `remove-repo`
- Frontend: repo selector in the UI
- Distribution: `private: false`, `bin: { "crloop": "..." }` in package.json, version 0.1.1

## Current Phase: Session Coordination

Implementing session state machine and "Finish Review" handoff before the agentic CLI commands can be built.

### Work remaining

1. **Session coordination** — `session.json`, state transitions, "Finish Review" button in UI, author field on comments, `GET /api/repos/:repoId/session`, `POST /api/repos/:repoId/session/transition`
2. **Agentic CLI commands** — `changes`, `diff`, `comment`, `comments`, `export`, `status`, `finish-self-review`, `wait` in `src/server/cli.ts`
3. **Agent Skill finalization** — update `skill/SKILL.md` against the actual CLI commands and multi-repo routing

## Design Documents

- `docs/requirements.md` — functional requirements (v1.0 original + v1.1 backfill)
- `docs/architecture.md` — existing system architecture
- `docs/api.md` — current API reference
- `docs/features/agentic-cr-skill-cli/design-skill-cli.md` — CLI commands and skill design for agent integration
- `docs/features/agentic-cr-skill-cli/distribution.md` — npm distribution approach
- `docs/features/agentic-cr-skill-cli/progress.md` — this file
- `docs/features/agentic-cr-skill-cli/skill/SKILL.md` — agent skill definition (draft)
