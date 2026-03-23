# Usage Manual

How to install and use `crloop` on a machine that does not have the source repository.

## Requirements

- Node.js 18+
- npm
- git in PATH (required by the server — it shells out to `git` to read diffs)
- A browser

## Installation

```bash
npm install -g crloop
```

Verify:

```bash
crloop --help
```

## Starting the server

Point `crloop serve` at any local git repository with at least one commit:

```bash
crloop serve --repo /path/to/project
```

Open `http://localhost:3000` in your browser.

### Multiple repositories

```bash
# IDs derived from directory basenames
crloop serve --repo /path/to/frontend --repo /path/to/backend

# Explicit IDs (required when two directories share the same basename)
crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend
```

The UI shows a repo selector tab strip when more than one repo is registered.

### Custom port

```bash
crloop serve --repo /path/to/project --port 4000
```

### Start with no repos

```bash
crloop serve
```

Register repos at runtime with the CLI (see below).

## Managing repos at runtime

These commands talk to a running server over HTTP — the server does not need to be restarted.

```bash
# List registered repos
crloop repos

# Register a new repo (ID derived from basename)
crloop add-repo /path/to/another-repo

# Register with an explicit ID
crloop add-repo /path/to/another-repo --id my-api

# Remove a repo (stored comments are not deleted)
crloop remove-repo my-api

# Stop the server
crloop stop-server
```

To target a server on a non-default URL:

```bash
crloop repos --url http://localhost:4000
crloop add-repo /path/to/repo --url http://localhost:4000
crloop stop-server --url http://localhost:4000
```

### Machine-readable output (`--json`)

Add `--json` to any command to get JSON output instead of human text. Use this when scripting or when an AI agent is consuming the output.

```bash
crloop repos --json
# → [{"id":"my-repo","path":"/path/to/repo"}]

crloop add-repo /path/to/repo --json
# → {"id":"my-repo","path":"/path/to/repo"}

crloop remove-repo my-repo --json
# → {"id":"my-repo"}

crloop stop-server --json
# → {"stopped":true}
```

### Previewing mutations (`--dry-run`)

Add `--dry-run` to `add-repo` or `remove-repo` to validate and preview the action without making any changes.

```bash
crloop add-repo /path/to/repo --dry-run
# Would register: my-repo → /path/to/repo

crloop add-repo /path/to/repo --dry-run --json
# → {"dryRun":true,"id":"my-repo","path":"/path/to/repo"}

crloop remove-repo my-repo --dry-run
# Would remove: my-repo
```

### Schema introspection (`crloop schema`)

Print a machine-readable JSON description of all commands and their accepted options:

```bash
crloop schema            # all commands
crloop schema add-repo   # single command
```

### Repo ID derivation

When no explicit ID is given, the repo ID is derived from the directory basename: lowercased, non-alphanumeric characters replaced with `-`.

| Directory | Derived ID |
|-----------|------------|
| `my_frontend` | `my-frontend` |
| `Backend.API` | `backend-api` |
| `ProjectX` | `projectx` |

Use `id:/path` syntax to override: `--repo fe:/path/to/frontend`

## Reviewing changes

1. Start the server — the command returns immediately; the server runs in the background.
2. Open `http://localhost:3000`.
3. Select a changed file from the sidebar.
4. Switch between unified and side-by-side diff views using the toggle.
5. Click a changed line to add a comment.
6. Use the export button to copy all comments as Markdown.

The diff shows working directory changes relative to `HEAD` — staged, unstaged, and untracked text files.

## Comment storage

Comments are saved inside the reviewed repository, not in a central database:

```
<repo-root>/.local-code-review/<head-short-id>.json
```

They persist across server restarts and travel with the checkout. To share comments with a teammate, commit the `.local-code-review/` directory. To clear comments, delete the file for the current HEAD.

Add to `.gitignore` if you do not want to commit review comments:

```
.local-code-review/
```

## Typical single-repo workflow

```bash
# Start the server
crloop serve --repo /path/to/project

# Open the UI and review changes
open http://localhost:3000

# When done, stop the server
crloop stop-server
```

## Typical multi-repo workflow

```bash
# Start with two repos
crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend

# Add a third repo while the server is running
crloop add-repo /path/to/shared-libs

# Review changes across repos using the UI tab strip

# Remove when done
crloop remove-repo shared-libs
```

## Agentic review loop

`crloop` supports an agent-human review loop where an AI agent self-reviews changes, posts findings, hands off to a human, and waits for feedback.

### How it works

1. **Agent self-reviews** — the agent reads the diff natively (`git diff`, `git status`) and posts findings via `crloop comment`.
2. **Agent hands off** — `crloop finish-self-review` transitions the session to `human-review` and `crloop open` opens the review UI in the browser.
3. **Agent waits** — `crloop wait` blocks and polls until the human finishes review.
4. **Agent addresses feedback** — `crloop export` prints the comments and the agent fixes the code.
5. **Agent signals done** — `crloop finish-addressing` transitions back to `agent-review`, starting the next iteration. If the human left no comments, `crloop wait` exits 2 and the loop ends.

### Lock file and server discovery

`crloop serve` writes a lock file at `~/.crloop/server.json` on daemon start. `crloop stop-server` removes it. All agentic commands discover the server URL from this file automatically — no `--url` flag needed when using the default port.

```bash
crloop url          # print the base URL of the running server
crloop url --json   # → {"url":"http://localhost:3000","port":3000,"pid":12345}
```

`crloop url` exits 1 if the lock file is missing or the server process is no longer alive.

### Repo auto-detection

Agentic commands (`comment`, `open`, `export`, `status`, `finish-self-review`, `finish-addressing`, `wait`) automatically detect the target repo by matching the current working directory against registered repo paths. Use `--repo <repoId>` to override.

### Posting comments

Single comment:

```bash
crloop comment \
  --file src/server/server.ts \
  --side new \
  --line 42 \
  --body "Extract this into a helper function"
```

Bulk import from a JSON file (preferred when the agent has multiple findings):

```bash
crloop comment --from-file findings.json
```

JSON file format:

```json
[
  { "file": "src/server/server.ts", "side": "new", "line": 42, "body": "Extract this into a helper function" },
  { "file": "src/server/server.ts", "side": "new", "line": 55, "body": "Add error handling here" }
]
```

Add `--dry-run` to validate inputs without posting.

### Session management

```bash
crloop status                # show session state, iteration, and comment counts
crloop finish-self-review    # transition agent-review → human-review
crloop open                  # open the crloop review UI in the browser
crloop wait                  # block until human finishes (exit 0) or marks complete (exit 2)
crloop export                # print all comments as plain text
crloop export --file src/server/server.ts   # filter to one file
crloop finish-addressing     # transition agent-addressing → agent-review (begin next iteration)
```

### crloop view

`crloop open` opens `http://localhost:<port>/crloop/<repoId>` — a focused review view that:

- Shows the same diff/comment UI as the standard view
- Hides the repository selector (repo is fixed by URL)
- Shows a **"Finish Review"** button that transitions the session to `agent-addressing`, unblocking `crloop wait`

Navigating to `http://localhost:<port>` (root) shows the standard UI unchanged.

### Typical agentic workflow

```bash
# Start the server (writes ~/.crloop/server.json)
crloop serve --repo /path/to/project

# Register if not already registered
crloop add-repo /path/to/project

# Post findings (from inside the project directory — repo is auto-detected)
crloop comment --from-file findings.json

# Hand off to the human
crloop finish-self-review
crloop open

# Wait for human to finish review
crloop wait   # exits 0 when human clicks "Finish Review"

# Read feedback and address it
crloop export

# Signal addressing is complete; begin next self-review iteration
crloop finish-addressing
```

## Installing the agent skill

`crloop skill --install` installs the bundled `SKILL.md` into your AI agent's skills directory so it is automatically available in future sessions.

```bash
# Install globally (default) — writes to ~/.claude/skills/crloop/SKILL.md
crloop skill --install

# Install into the current project — writes to .claude/skills/crloop/SKILL.md
crloop skill --install --scope project

# Preview without writing
crloop skill --install --dry-run

# Overwrite if you have customized the file and want the latest version
crloop skill --install --force

# Machine-readable output
crloop skill --install --json
# → {"status":"created","source":"...","target":"...","version":"0.2.1","dryRun":false}

# Print skill content to stdout (no filesystem writes)
crloop skill --print
```

The command is idempotent: re-running after the file is installed reports `unchanged` and writes nothing. If the installed file differs from the package version (e.g. after manual edits), it warns and skips — pass `--force` to accept the update.

## Upgrading

Check the current installed version:

```bash
npm list -g crloop
```

Update to the latest release:

```bash
npm install -g crloop@latest
```

Update to a specific version:

```bash
npm install -g crloop@1.2.0
```

Verify after updating:

```bash
crloop --help
```

Comments stored in `.local-code-review/` inside your repositories are not affected by upgrades.

## Uninstalling

```bash
npm uninstall -g crloop
```

Comments stored in `.local-code-review/` inside your repositories are not affected.
