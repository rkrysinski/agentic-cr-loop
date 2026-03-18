# Naming Decision

## Repository name

`agentic-cr-loop`

## npm package / CLI command

`crloop`

## Rationale

The tool is a code review loop where both a human and an AI agent are active participants — not just "human in the loop" supervision, but a full iterative cycle: agent self-reviews → hands off to human → human reviews → agent addresses → repeat.

`agentic-cr-loop` captures all three concepts (agentic, code review, loop) in the repo name where discoverability matters.

`crloop` is the short form used as the CLI command — fast to type, unambiguous in context:

```bash
npx crloop changes
npx crloop diff src/server/server.ts
npx crloop wait
```

## What changes from earlier design docs

Earlier design docs used `agentic-code-review` as both the package name and CLI command. That name is replaced by:

| Artifact | Old | New |
|----------|-----|-----|
| GitHub repository | (local, unnamed) | `agentic-cr-loop` |
| npm package name | `agentic-code-review` | `crloop` |
| CLI binary | `agentic-code-review` | `crloop` |
