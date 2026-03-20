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

### Repo ID derivation

When no explicit ID is given, the repo ID is derived from the directory basename: lowercased, non-alphanumeric characters replaced with `-`.

| Directory | Derived ID |
|-----------|------------|
| `my_frontend` | `my-frontend` |
| `Backend.API` | `backend-api` |
| `ProjectX` | `projectx` |

Use `id:/path` syntax to override: `--repo fe:/path/to/frontend`

## Reviewing changes

1. Start the server pointed at one or more repos.
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

# When done, stop from another terminal (or Ctrl+C in the server terminal)
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
