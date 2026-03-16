---
name: agentic-code-review
description: Self-review your code changes and participate in a human-agent review loop. Use when you have finished writing code and need to review your own changes, post review comments, or read human feedback from the code review tool.
compatibility: Requires git, node, npm. The agentic-code-review server must be running.
---

# Code Review Skill

You are participating in a review loop with a human reviewer. The loop is:

1. You finish writing code (changes are in the git working directory)
2. You self-review your changes and post comments
3. You hand off to the human for review
4. You wait for the human to finish
5. You read the human's feedback and address it
6. If feedback existed, go to step 2. If no feedback, you're done.

## CLI Reference

All commands talk to a running agentic-code-review server. Set `CODE_REVIEW_URL` if not `http://localhost:3000`.

### List changed files

```bash
npx agentic-code-review changes
```

### Read a file's diff

```bash
npx agentic-code-review diff <file-path>
npx agentic-code-review diff <file-path> --context 3   # less context
```

### Post a single comment

```bash
npx agentic-code-review comment --file <path> --side new --line <n> --body "<text>"
```

`--side` is `new` for added/modified lines, `old` for removed lines.

### Post multiple comments at once

Write a JSON file, then import it:

```json
[
  { "file": "src/foo.ts", "side": "new", "line": 42, "body": "Extract this" },
  { "file": "src/bar.ts", "side": "new", "line": 10, "body": "Add validation" }
]
```

```bash
npx agentic-code-review comment --from-file comments.json
```

### List comments on a file

```bash
npx agentic-code-review comments <file-path>
```

### Hand off to the human

After posting all your self-review comments:

```bash
npx agentic-code-review finish-self-review
```

### Wait for the human to finish

```bash
npx agentic-code-review wait
```

Blocks until the human clicks "Finish Review". Exit code 0 means feedback to address. Exit code 2 means review approved (no comments left).

### Read feedback

```bash
npx agentic-code-review export
```

Prints all comments as structured markdown.

### Check session status

```bash
npx agentic-code-review status
```

## Self-Review Guidelines

When reviewing your own changes:

1. Run `npx agentic-code-review changes` to see what files changed.
2. For each file, run `npx agentic-code-review diff <path>` and analyze the diff.
3. Look for: bugs, missing error handling, unclear naming, unnecessary complexity, missing edge cases, security issues.
4. Post comments on specific lines where you found issues. Be concrete — say what's wrong and what to do about it.
5. Do NOT comment on things that are correct. Only flag actual issues.
6. After posting all comments, run `npx agentic-code-review finish-self-review`.

## Addressing Feedback

When the human finishes review:

1. Run `npx agentic-code-review export` to read all comments.
2. Address each comment by modifying the code.
3. If a comment is unclear, leave it — the human will clarify in the next round.
4. After addressing all comments, start the loop again from self-review.

## Full Loop Example

```bash
# Step 1: See what changed
npx agentic-code-review changes

# Step 2: Review each file
npx agentic-code-review diff src/server/server.ts
npx agentic-code-review diff src/client/App.tsx

# Step 3: Post findings
npx agentic-code-review comment --file src/server/server.ts --side new --line 42 \
  --body "This error message is too vague — include the actual value"
npx agentic-code-review comment --file src/client/App.tsx --side new --line 15 \
  --body "This effect has a missing dependency"

# Step 4: Hand off
npx agentic-code-review finish-self-review

# Step 5: Wait for human
npx agentic-code-review wait

# Step 6: Read feedback (if exit code was 0)
npx agentic-code-review export

# Step 7: Fix issues, then loop back to step 1
```
