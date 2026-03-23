# Implementation Plan: `crloop skill --install`

Design reference: [design-skill-cli.md](./design-skill-cli.md) · [distribution.md](./distribution.md#skill-distribution)

## Context

| File | Current role |
|------|-------------|
| `src/server/cli.ts` | CLI entry point. No `skill` command exists yet. |
| `skill/SKILL.md` | Agent skill definition. Already in npm `files` whitelist; ships with the package. |
| `docs/features/agentic-cr-skill-cli/distribution.md` | Documents skill install as a `cp` manual step; notes `crloop skill --install` as a "future" command. |
| `docs/requirements.md` | Functional requirements FR-01 – FR-63. No skill install FR yet. |

## Tasks

### `src/server/cli.ts` — package-root discovery

- [x] Add `findPackageRoot(startUrl: string): string` — converts `startUrl` (pass `import.meta.url`) to a filesystem path via `fileURLToPath`, then walks parent directories until it finds a `package.json` with `"name": "crloop"`; throws a descriptive error if the walk reaches `/` without a match; max walk depth 8

### `src/server/cli.ts` — `skill` command

- [x] Add `cmdSkill(args: string[]): void` — parses `--install`, `--print`, `--scope global|project`, `--force`, `--dry-run`, `--json`; exits with code 4 if `--install` and `--print` are both present
- [x] In `cmdSkill`: resolve source path as `path.join(findPackageRoot(import.meta.url), 'skill', 'SKILL.md')`; throw with actionable message `"Skill file not found — try reinstalling crloop"` if file is absent
- [x] In `cmdSkill` `--print` branch: read source and write to `process.stdout`; no filesystem writes
- [x] In `cmdSkill` `--install` branch: resolve target path — global (default): `path.join(os.homedir(), '.claude', 'skills', 'crloop', 'SKILL.md')`; project (`--scope project`): `path.join(process.cwd(), '.claude', 'skills', 'crloop', 'SKILL.md')`
- [x] In `cmdSkill` `--install` branch: create target directory with `mkdirSync(..., { recursive: true })` before writing
- [x] In `cmdSkill` `--install` branch: compare source content to existing target (string equality); if identical → status `unchanged`, skip write; if differs and `--force` absent → status `skipped`, print warning with `"Run with --force to overwrite"`; if differs and `--force` present, or target absent → write, status `created` or `updated`
- [x] In `cmdSkill` `--install` branch: human output — `"Installed crloop skill → <target>"` with `Status: <status>` line; JSON output — `{ status, source, target, version, dryRun }`
- [x] Register `"skill"` case in `main()` dispatch that calls `cmdSkill(args.slice(1))`
- [x] In `printHelp()`: add usage line `crloop skill --install [--scope global|project] [--force] [--dry-run] [--json]` and `crloop skill --print`
- [x] In `cmdSchema()`: add `skill` entry with `--install`, `--print`, `--scope`, `--force`, `--dry-run`, `--json` options

## Test coverage

- [x] `src/server/cli.test.ts` — `findPackageRoot`: walks up correctly from a simulated nested path; throws when no matching `package.json` exists within max depth
- [x] `src/server/cli.test.ts` — `skill --print`: writes source content to stdout with no filesystem side effects
- [x] `src/server/cli.test.ts` — `skill --install` new file: creates target dirs and writes file; status `created`
- [x] `src/server/cli.test.ts` — `skill --install` identical content: skips write; status `unchanged`
- [x] `src/server/cli.test.ts` — `skill --install` differing content without `--force`: prints warning, skips write; status `skipped`
- [x] `src/server/cli.test.ts` — `skill --install --force` differing content: overwrites; status `updated`
- [x] `src/server/cli.test.ts` — `skill --install --dry-run`: no write occurs regardless of whether target exists
- [x] `src/server/cli.test.ts` — `skill --install --json`: output is valid JSON matching `{ status, source, target, version, dryRun }`
- [x] `src/server/cli.test.ts` — `skill --install --scope project`: target resolves to `.claude/skills/crloop/SKILL.md` relative to CWD

## Docs and traceability

- [x] `docs/features/agentic-cr-skill-cli/distribution.md` — Replace the "Skill Distribution" `cp` snippet and "future" note (lines 183–199) with documentation of `crloop skill --install [--scope global|project] [--force] [--dry-run]` and `crloop skill --print`
- [x] `docs/requirements.md` — Add FR-64: `crloop skill --install` copies `skill/SKILL.md` from the installed package to `~/.claude/skills/crloop/SKILL.md` (global) or `.claude/skills/crloop/SKILL.md` (project); `--scope`, `--force`, `--dry-run`, `--json`, and `--print` flags; idempotent — skips write when content is unchanged; version changelog entry 2.1

## Post-implementation checklist

**Implementation summary:** Added `crloop skill --install` and `crloop skill --print` commands that copy or display the bundled agent skill, with `--scope`, `--force`, `--dry-run`, and `--json` flags, idempotent write behavior, and user-edit protection.

**Tasks completed:** 20
**Tasks skipped:** 0
**Tests:** passed (181 tests, 15 files)

> No follow-up items found. All changed interfaces appear to be covered by existing docs, tests, and QA scripts.
