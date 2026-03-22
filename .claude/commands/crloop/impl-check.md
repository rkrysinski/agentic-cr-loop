You are a senior engineer performing a post-implementation checkpoint. Identify all follow-up work the current changes require — in documentation, tests, QA scripts, requirements coverage, and release notes — and output a single prioritized checklist. No generic advice. Every item must name a specific file and cite evidence from the diff.

## Phase 1 — Understand the change scope

Run these commands one at a time (never chained):
1. `git status --short`
2. `git diff HEAD`
3. `git diff --cached`
4. `git log --oneline -5`

Internally classify the change (do not print this): which source files changed; which public interfaces changed (exported functions, API endpoints, CLI commands/flags, env vars, schemas); whether this is a new feature, behavior change, bug fix, refactor, or combination.

## Phase 2 — Discover project artifacts

Search the current working directory using Glob or directory listings. Do not assume any path exists.

**Docs:** `docs/` or `doc/` (all `.md` files within), `README.md`, `CHANGELOG.md`, `CHANGES.md`

**Tests:** `test/`, `tests/`, `spec/`, `__tests__/` directories; files matching `*.test.ts`, `*.test.js`, `*.spec.ts`, `*.spec.js`; config files `vitest.config.*`, `jest.config.*`, `playwright.config.*`

**QA scripts:** `scripts/qa/` or `qa/` (all `.sh` files); specifically any `verify-*.sh` and `scenario*.sh`

**Requirements/traceability:** any file named `requirements.md` or matching `*requirements*`; any QA plan file containing a table with "Requirement" and "Scenario" columns

**Release:** `release.md`, `CHANGELOG.md`, `package.json`

## Phase 3 — Cross-reference

Apply these rules for each change:

**Rule A — New public symbol** (endpoint, CLI command, CLI flag, exported function, schema field, env var):
- Search discovered docs for any mention → if none found: MUST add documentation
- Search discovered test files/QA scripts for coverage → if none found: MUST add test/scenario

**Rule B — Changed public symbol** (renamed, behavior change, flag added or removed):
- Search each discovered doc file for the old name or old behavior description → for each file that mentions it: MUST update that specific file
- Search QA scripts for references to the changed command/endpoint/flag → for each match: MUST update that script

**Rule C — New source file added:**
- Check for a parallel test file (same name with `.test.*` suffix, or mirror in `test/`/`spec/`) → if missing: SHOULD add test

**Rule D — User-visible bug fix:**
- If `CHANGELOG.md` discovered: SHOULD add entry
- Determine if an existing test should have caught this → if yes: CONSIDER adding regression test

**Rule E — Any user-visible change:**
- If `CHANGELOG.md` or `release.md` discovered: SHOULD add entry
- If `package.json` discovered: CONSIDER whether a version bump is warranted (patch/minor/major)

**Rule F — Requirements traceability matrix found:**
- For new behavior: identify which FR/NFR it satisfies → if no scenario covers it: CONSIDER adding one
- For changed behavior: check if existing FR language still describes the new behavior accurately → if not: SHOULD update

## Phase 4 — Output

Print the following structure. Omit any tier with zero items entirely. Do not mention omitted tiers.

---

### Post-implementation checklist

**Change summary:** [one sentence, e.g. "Added `stop-server` CLI command and `POST /api/server/stop` endpoint"]

#### MUST — Required before this work is considered done

- [ ] `docs/api.md` — [specific reason with evidence, e.g. "new endpoint `POST /api/server/stop` has no entry in the Registry table"]

#### SHOULD — Important but does not block shipping

- [ ] `CHANGELOG.md` — [reason]

#### CONSIDER — Low-priority or optional

- [ ] `docs/requirements.md` — [reason]

---

**Artifacts not found:** [list any category that was searched for but had no files, e.g. "No test directory detected", "No CHANGELOG.md found"]

---

If zero follow-up items are found across all categories, output exactly:
"No follow-up items found. All changed interfaces appear to be covered by existing docs, tests, and QA scripts."
