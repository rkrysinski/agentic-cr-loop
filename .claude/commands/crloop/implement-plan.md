---
model: claude-opus-4-6
effort: max
---

You are a senior engineer implementing a feature from a structured implementation plan.

## Input

$ARGUMENTS

## Step 1 — Orient

Parse `$ARGUMENTS` to find a file path (contains `/` or ends in `.md`). Record it as the **plan path** and its parent directory as the **plan directory**.

Run these commands one at a time (never chained):

1. `git status --short`
2. `git log --oneline -5`

Read `CLAUDE.md` in the project root if it exists — it contains test commands, conventions, and constraints that govern all subsequent steps.

## Step 2 — Read the plan in full

Read the plan file. **Before reading, check its total line count. If the file exceeds 2000 lines, read it in consecutive pages using `offset` and `limit` until the entire file is in context. Do not start implementing until you have read every line.**

Determine which type of plan this is:

**Index file** (contains markdown links to phase files, e.g. `[impl-plan-phase-1.md](./impl-plan-phase-1.md)`):
- Extract every linked phase file path and resolve each one relative to the **plan directory**.
- Read each phase file **in full** using the same paging approach above, one at a time.
- Note the inter-phase dependency order stated in the index — this governs execution order.

**Single-phase file** (contains tasks directly):
- Proceed to Step 3.

## Step 3 — Inventory all tasks

Before writing any code, collect every `- [ ]` line across all plan files. For each task record:
- The exact task text
- Which plan file it lives in (needed for check-off)
- Which phase it belongs to

Print a one-line summary: `"Found N pending tasks across X file(s). Starting implementation."`

## Step 4 — Implement phase by phase

For each phase (or the single phase), in dependency order:

### 4a — Implement tasks

Work through the pending tasks for this phase in the order they appear. For each task:

1. **Read** every source file the task references before editing it.
2. **Implement** exactly what the task specifies — no scope creep, no unrequested refactors.
3. **Check off** the task immediately by editing the plan file to change `- [ ]` to `- [x]` for that exact line. Do not batch check-offs.
4. If a task is ambiguous or its target file does not exist, skip it and record it in a `## Skipped` section at the bottom of the plan file with a brief reason. Continue to the next task.

### 4b — Run tests after each phase

After all tasks in the phase are implemented, run the test suite. Use the test command from `CLAUDE.md` if present; otherwise discover it from `package.json` scripts. Run test commands one at a time (never chained or piped).

If tests fail: diagnose and fix the failures, then re-run. Do not advance to the next phase until this phase's tests pass.

### 4c — Post-phase cross-reference check

After tests pass for this phase, apply the following rules against the changes made so far (not the full session — only what changed in this phase). Search for artifacts first; note which categories are absent.

**Artifacts to discover** (use Glob; do not assume paths exist):
- Docs: `docs/**/*.md`, `README.md`, `CHANGELOG.md`
- Tests: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.js`; dirs `test/`, `tests/`, `spec/`, `__tests__/`
- QA scripts: `scripts/qa/*.sh`, `qa/*.sh`, `verify-*.sh`, `scenario*.sh`
- Requirements: `docs/requirements.md`, any `*requirements*` file; QA plans with "Requirement"/"Scenario" columns
- Release: `release.md`, `CHANGELOG.md`, `package.json`

**Cross-reference rules:**

**Rule A — New public symbol** (endpoint, CLI command/flag, exported function, schema field, env var):
- Search discovered docs → if no mention: flag MUST add documentation
- Search discovered tests/QA scripts → if no coverage: flag MUST add test/scenario

**Rule B — Changed public symbol** (renamed, behavior-changed, removed):
- Search each discovered doc for the old name/behavior → if found: flag MUST update that file
- Search QA scripts for the old name → if found: flag MUST update that script

**Rule C — New source file added:**
- Check for a parallel test file (`.test.*` suffix or mirror in `test/`/`spec/`) → if missing: flag SHOULD add test

**Rule D — User-visible bug fix:**
- If `CHANGELOG.md` found: flag SHOULD add entry
- If an existing test should have caught this: flag CONSIDER adding regression test

**Rule E — Any user-visible change:**
- If `CHANGELOG.md` or `release.md` found: flag SHOULD add entry
- If `package.json` found: flag CONSIDER version bump (patch/minor/major)

**Rule F — Requirements traceability matrix found:**
- New behavior with no matching scenario: flag CONSIDER adding one
- Changed behavior where FR language no longer matches: flag SHOULD update

Collect all flags from this phase into the running checklist (see Step 5).

## Step 5 — Final output

After all phases are complete, append a `## Post-implementation checklist` section to the **index plan file** (or the single plan file for single-phase plans). Write it using the Edit tool — do not just print it to the terminal.

Structure:

```markdown
## Post-implementation checklist

**Implementation summary:** [one sentence]

**Tasks completed:** N
**Tasks skipped:** M — see Skipped section above
**Tests:** passed

### MUST — Required before this work is considered done

- [ ] `path/to/file` — [specific reason with evidence, e.g. "new endpoint `POST /foo` has no entry in docs/api.md"]

### SHOULD — Important but does not block shipping

- [ ] `path/to/file` — [reason]

### CONSIDER — Low-priority or optional

- [ ] `path/to/file` — [reason]

**Artifacts not found:** [list categories that were searched but had no files]
```

Omit any tier with zero items. If zero follow-up items exist across all tiers, write instead:
> No follow-up items found. All changed interfaces appear to be covered by existing docs, tests, and QA scripts.

## Step 6 — Post-implementation check

After completing all phases and writing the checklist, run the `/crloop/impl-check` slash command. This performs an independent cross-reference analysis of the actual git diff to catch anything the phase-by-phase checks may have missed. Print its report as the final output of this command.
