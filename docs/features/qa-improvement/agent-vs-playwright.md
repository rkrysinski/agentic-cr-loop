# QA Strategy: Agent + MCP vs Pure Playwright Tests

## Context

The project has a prose-based QA test plan in `docs/qa-testplan-playwright.md` covering 46 scenarios across single-repo, multi-repo, zero-repo, CLI, UI preferences, and file-tree coloring features.

Two execution strategies are available:

1. **Agent + Playwright MCP** — an AI agent interprets the prose plan and drives the browser via MCP tool calls
2. **Pure Playwright tests** — hand-written `.spec.ts` files that execute directly against the Playwright API

---

## Comparison

### Agent + Playwright MCP

The agent reads each scenario description, reasons about which tool to call next, and executes browser interactions one at a time. Every step requires an LLM inference round-trip.

**Strengths**
- Zero test-code investment — starts immediately from the prose plan
- Handles ambiguous or open-ended assertions naturally (the agent can reason about what it sees)
- Easy to update: edit the prose plan, not test code
- Good for one-off exploratory runs or validating a new feature before writing formal tests

**Weaknesses**
- Slow: 45–90+ minutes for the full 46-scenario suite (1–3 s per LLM round-trip × hundreds of steps)
- Sequential only — no parallelism
- Non-deterministic: the agent can drift, misinterpret a step, or get stuck and retry
- High token cost per run
- Not suitable for CI — too slow and too flaky for gate checks

### Pure Playwright Tests

Hand-written TypeScript spec files that use the Playwright API directly. Scenarios map 1:1 to `test()` blocks; assertions use Playwright's built-in `expect`.

**Strengths**
- Fast: full suite in 2–5 minutes with parallelism
- Deterministic and reproducible — same result every run
- CI-friendly: can gate PRs and releases
- Low per-run cost — no LLM inference
- Failures are precise: line number, assertion, screenshot

**Weaknesses**
- Upfront investment: ~2,000–3,000 lines of test code to cover all 46 scenarios
- Brittle to UI changes (selectors break on refactors)
- Requires a Playwright-familiar engineer to maintain

---

## Decision Matrix

| Dimension | Agent + MCP | Pure Playwright |
|---|---|---|
| Time to first run | Minutes | Hours (write tests first) |
| Per-run execution time | 45–90 min | 2–5 min |
| Reliability | Moderate | High |
| CI suitability | No | Yes |
| Maintenance burden | Low | Medium |
| Cost per run | High (LLM tokens) | Negligible |
| Parallelism | No | Yes |
| Coverage of ambiguous scenarios | Good | Requires explicit coding |

---

## Recommendation

**Write pure Playwright tests**, using the existing prose plan as the specification.

The prose test plan is already well-structured with explicit steps, expected outcomes, and prerequisite conditions — it is essentially a Playwright spec waiting to be translated into code. The upfront translation cost is a one-time investment; every subsequent run is fast, free, and reliable.

Use the agent approach only for:
- Exploratory validation of a brand-new feature before its Playwright spec exists
- Smoke-checking the prose plan itself before committing to code
- Scenarios that are genuinely open-ended (e.g. "does this look right?")

---

## Implementation Prompt

Use the following prompt to generate the Playwright test suite from the existing plan. Paste it to a Claude Code agent with Playwright MCP available and the dev server running.

---

```
You are a QA engineer. Convert the prose test plan at `docs/qa-testplan-playwright.md`
into a Playwright TypeScript test suite at `e2e/`.

You have access to Playwright MCP tools (`mcp__playwright__*`). Use them actively:
- To start the application before inspecting it, run `npm run dev` via the terminal
  (or verify it is already running on port 5173).
- Before writing assertions for any scenario, use `browser_navigate`,
  `browser_snapshot`, and `browser_evaluate` to inspect the live UI and confirm
  actual selector names, ARIA roles, DOM structure, and CSS values. Do not guess.
- When a scenario's expected behaviour is ambiguous, drive the browser with MCP
  tools to observe the real behaviour and encode what you actually see.

## Output structure

e2e/
  fixtures.ts          — shared Page Object helpers, server setup/teardown hooks
  single-repo.spec.ts  — Scenarios 1–22
  multi-repo.spec.ts   — Scenarios 23–38
  zero-repo.spec.ts    — Scenario 39
  ui-prefs.spec.ts     — Scenario 45
  file-tree.spec.ts    — Scenario 46

## Rules

1. Each scenario in the prose plan becomes one `test()` block with the same number
   and name (e.g. `test('1. Initial load and API bootstrap', ...)`).
2. Use `page.waitForResponse` or `page.waitForSelector` instead of arbitrary sleeps.
3. Use `page.evaluate` for localStorage reads and DOM attribute checks —
   mirror the `browser_evaluate` calls in the prose plan exactly.
4. Server lifecycle:
   - `single-repo.spec.ts`, `ui-prefs.spec.ts`, `file-tree.spec.ts`:
     `globalSetup` runs `bash scripts/qa/setup-single-repo.sh` then
     `bash scripts/qa/start-server.sh single`.
   - `multi-repo.spec.ts`:
     `globalSetup` runs `bash scripts/qa/stop-server.sh`,
     `bash scripts/qa/setup-multi-repo.sh`, then
     `bash scripts/qa/start-server.sh multi`.
   - `zero-repo.spec.ts`:
     `globalSetup` runs `bash scripts/qa/stop-server.sh` then
     `bash scripts/qa/start-server.sh zero`.
   - `globalTeardown` runs `bash scripts/qa/cleanup.sh` after all suites.
5. For scenarios that require terminal-side actions (19, 20, 37), call
   `execSync('bash scripts/qa/<script>.sh')` inside the test body at the
   appropriate step — do not skip these scenarios.
6. Scenarios 40–43 are CLI-only; create stub tests marked `test.skip` with
   a comment pointing to `scripts/qa/verify-cli.sh`.
7. Scenario 44 (`verify-cli.sh`) becomes a single test that spawns the script
   via `execSync` and asserts exit code 0.
8. Add a `playwright.config.ts` at the repo root with:
   - `testDir: './e2e'`
   - `workers: 1` (server is shared, cannot run suites in parallel)
   - `use: { baseURL: 'http://localhost:5173' }`
   - Reporters: `list` + `html`

## Constraints

- TypeScript only, no JavaScript.
- No third-party assertion libraries — use Playwright's built-in `expect`.
- Do not import from the app's source code — treat the UI as a black box.
- Selectors: prefer `getByRole`, `getByLabel`, `getByText` over CSS selectors
  where possible; fall back to `locator('[aria-*]')` for ARIA attribute checks.
- For computed color assertions, use `locator.evaluate(el => getComputedStyle(el).color)`.

## Write → Run → Fix loop

After writing each spec file, immediately run it and fix failures before moving on:

1. **Run** the file: `npx playwright test e2e/<file>.spec.ts --reporter=list`
2. **If it passes** — proceed to the next spec file.
3. **If it fails** — before editing the test blindly:
   a. Use `browser_navigate` and `browser_snapshot` (MCP) to inspect the live UI
      at the point of failure.
   b. Use `browser_evaluate` to probe DOM state, computed styles, or localStorage
      if the failure involves those.
   c. Use `browser_take_screenshot` to capture visual state if the failure is
      layout- or rendering-related.
   d. Fix the test based on what you observe, then re-run it.
   e. Repeat until the file passes before continuing.

Do not proceed to the next spec file while any test in the current file is failing.

## Workflow

1. Read `docs/qa-testplan-playwright.md` in full.
2. Start the application (`npm run dev -- --repo <path>` or verify it is running).
3. Use MCP browser tools to do a quick orientation pass: navigate to the app,
   take a snapshot, and confirm the UI is responsive before writing any code.
4. Write files in order: `playwright.config.ts`, `e2e/fixtures.ts`, then each
   spec file — applying the Write → Run → Fix loop to each spec file.
5. After all spec files pass, run `npx tsc --noEmit` to confirm no type errors.
```

---

## Notes

- The `e2e/` directory does not exist yet; the prompt above creates it.
- `workers: 1` is intentional — the QA setup scripts manage a single shared server instance and cannot run in parallel without port conflicts.
- Once the suite is stable, CI can be added by running `npx playwright test` in the pipeline after `bash scripts/qa/start-server.sh single`.
- The CLI scenarios (40–43) should eventually be ported to a shell-based test runner (e.g. `bats`) and integrated alongside the Playwright suite.
