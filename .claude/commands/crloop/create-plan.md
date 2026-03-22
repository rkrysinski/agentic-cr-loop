---
model: claude-opus-4-6
effort: max
---

You are a senior engineer creating a structured implementation plan from a design document.

## Input

$ARGUMENTS

## Step 1 — Orient and locate the design

Read `CLAUDE.md` in the project root if it exists — it contains project-specific test commands, tooling, and conventions that apply to all subsequent steps.

Parse `$ARGUMENTS` to find a file path. Try to resolve the first word (or quoted string) as a path on disk. If a file exists at that path, treat it as the design document. If no file is found, treat the full argument text as a free-form design description.

- If a file path is present: read that file. The **output directory** is the directory containing it.
- If no file path: use the text as a free-form design description. Ask the user for an output directory, or default to the current working directory.

**Reading rule (applies to the design file and all source files read later):** Before reading any file, check its total line count. If it exceeds 2000 lines, read it in consecutive pages using `offset` and `limit` until the entire file is in context. Do not draw conclusions from a partially-read file.

## Step 2 — Parse the design

Extract from the design document (already read in Step 1):

1. **Feature name** — one short noun phrase.
2. **Phase structure** — does the doc contain explicit phase headers matching `Phase [0-9]` or `## Phase`? If yes, list them. If no, treat as single-phase.
3. **Affected files/layers** — every source file, directory, or system layer the design mentions.
4. **New public symbols** — new HTTP endpoints, CLI commands/flags, React components, shared types, env vars, exported functions.
5. **Changed public symbols** — renamed, behavior-changed, or removed existing symbols.
6. **Implementation status** — if the design has an implementation status table or section (✅/🔶/🔲 markers or similar), record what is already done vs planned.

## Step 3 — Audit the current codebase

Run these commands one at a time (never chained):

1. `git status --short`
2. `git log --oneline -5`

Then, for each affected file or layer from Step 2, read the current source to determine what already exists. Use Glob to find relevant files; use Grep to check for specific symbols, function names, or route strings. **When reading any source file, apply the same full-file reading rule: do not use `limit` or `offset` parameters; if the file is truncated, read the remaining lines explicitly before drawing conclusions.**

Also discover project artifacts — search for each category below; note which are absent:

- **Tests**: files matching `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.js`; config files `vitest.config.*`, `jest.config.*`
- **QA scripts**: `scripts/qa/*.sh`, `qa/*.sh`, any `verify-*.sh` or `scenario*.sh`
- **Docs**: `docs/**/*.md`, `README.md`, `CHANGELOG.md`
- **Requirements**: `docs/requirements.md`, any file matching `*requirements*`; any QA plan with a "Requirement" and "Scenario" column

## Step 4 — Cross-reference design against current state

For each design element, determine whether it is already implemented:

**Rule A — New public symbol** (endpoint, CLI command/flag, exported function, React component, shared type, env var):
- Search the codebase for it → if it exists with the designed behavior: mark `[x]` with a brief evidence note (file:line or symbol). If missing: `[ ]`.

**Rule B — Changed public symbol** (renamed, behavior change, flag added/removed):
- Check if the change has been applied → `[x]` with evidence if yes, `[ ]` if not. Note the current state.

**Rule C — Tests for new source files or public interfaces**:
- For each new file or interface from the design, check if a parallel test file or test case exists. If not: add a `[ ]` task to the **"Test coverage"** section of the plan.

**Rule D — Docs for new user-visible behavior**:
- Check whether new endpoints, CLI commands, or user-visible behaviors appear in discovered doc files. If not: add a `[ ]` task to the **"Docs and traceability"** section of the plan, naming the specific file to update.

**Rule E — Requirements traceability**:
- If `docs/requirements.md` or a QA plan was found, check if new behavior maps to a listed requirement. If not: add a `[ ]` task to the **"Docs and traceability"** section of the plan to add coverage.

**Rule F — Requirements language accuracy**:
- If a requirements file was found and the design changes existing behavior, check whether the existing FR/NFR language still accurately describes the new behavior. If not: add a `[ ]` task to update the requirement wording.

## Step 5 — Write the implementation plan

Before writing any files, check whether `impl-plan.md` (or any `impl-plan-phase-*.md`) already exists in the output directory. If so, inform the user and ask whether to overwrite before proceeding.

**If the design has multiple explicit phases:**
- Create one file per phase named `impl-plan-phase-{N}.md` in the output directory, where `{N}` is the 1-based phase number extracted from the design's phase headers (e.g. "Phase 1" → `impl-plan-phase-1.md`; non-numeric labels are slugified, e.g. "Phase Alpha" → `impl-plan-phase-alpha.md`).
- Also create `impl-plan.md` in the output directory as an index file.

**If the design is single-phase or has no explicit phases:**
- Create a single `impl-plan.md` in the output directory.

### Format for each phase file (or single plan file)

```markdown
# Implementation Plan: {Feature Name}
{Phase label if applicable, e.g. "Phase 1 — Lock File"}

Design reference: [{design filename}](./{design filename})

## Context

| File | Current role |
|------|-------------|
| `path/to/file.ts` | What it does today |

## Tasks

- [x] Already-done task — brief evidence (file:line or symbol name)
- [ ] Pending task — specific, names exact file and function/symbol to add or change

## Test coverage

- [ ] `path/to/file.test.ts` — {what test case to add}

## Docs and traceability

- [ ] `docs/some-file.md` — {what entry or section to add}
```

**Task rules:**
- Each task names a specific file and symbol/function — no generic items.
- Already-done items are `[x]` with brief evidence; never invent evidence, only mark `[x]` when confirmed.
- Pending items are `[ ]` with enough detail to implement without re-reading the design.
- Group by file when there are 3+ tasks for the same file.
- Omit "Test coverage" or "Docs and traceability" sections entirely if there are zero items.

### Format for the index file (multi-phase only)

```markdown
# Implementation Plan: {Feature Name}

Design reference: [{design filename}](./{design filename})

## Phases

- [impl-plan-phase-1.md](./impl-plan-phase-1.md) — {Phase 1 name}
- [impl-plan-phase-2.md](./impl-plan-phase-2.md) — {Phase 2 name}

## Inter-phase dependencies

{Ordered list or ASCII dependency graph showing which phases must precede others}
```

## Step 6 — Write the files

Write each plan file to the output directory using the Write tool. After writing, print a one-line summary listing the files created and how many tasks are pending vs already done.