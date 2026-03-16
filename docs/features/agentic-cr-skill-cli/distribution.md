# Distribution

## Package Name

`agentic-code-review`

## Distribution Channel

npm registry. Users install without cloning the repository:

```bash
# Install globally
npm install -g agentic-code-review

# Or run without installing
npx agentic-code-review serve --repo ./my-project

# Or install as a project dev dependency
npm install --save-dev agentic-code-review
npx agentic-code-review serve --repo .
```

## End-User Requirements

- Node.js 18+
- npm
- `git` on PATH

## package.json Changes

```json
{
  "name": "agentic-code-review",
  "version": "1.0.0",
  "private": false,
  "type": "module",
  "description": "Local code review tool for AI agent workflows",
  "bin": {
    "agentic-code-review": "dist/server/server/cli.js"
  },
  "files": [
    "dist/server",
    "dist/client",
    "skill"
  ],
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "start": "node dist/server/server/index.js",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

### Key fields

| Field | Value | Purpose |
|---|---|---|
| `name` | `agentic-code-review` | npm package name |
| `private` | `false` | Allows publishing (currently `true`) |
| `bin` | `{ "agentic-code-review": "dist/server/server/cli.js" }` | Registers the CLI command |
| `files` | `["dist/server", "dist/client", "skill"]` | Whitelist of files included in the tarball |
| `prepublishOnly` | `npm run build && npm test` | Ensures build and tests pass before publishing |

## What Gets Published

The `files` field controls what npm includes in the tarball:

```
agentic-code-review/
  package.json
  dist/
    server/              ← compiled TypeScript (Express server + CLI)
      server/
        cli.js           ← CLI entry point (bin target)
        index.js         ← server entry point
        server.js
        reviewService.js
        commentStore.js
        ...
      shared/
        api.js
        types.js
    client/              ← built React app (static HTML/JS/CSS)
      index.html
      assets/
  skill/
    SKILL.md             ← Agent skill definition
```

### Not published

Source code (`src/`), dev scripts (`scripts/`), documentation (`docs/`), tests, config files (`tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`), and `node_modules/` are all excluded by the `files` whitelist.

## Publish Process

### First-time setup

```bash
# Login to npm (one-time)
npm login
```

### Release

```bash
# 1. Bump version
npm version patch    # or minor / major

# 2. Build and test (prepublishOnly runs automatically)
# 3. Publish
npm publish

# 4. Push version commit and tag
git push && git push --tags
```

`prepublishOnly` runs `npm run build && npm test` automatically before `npm publish`, ensuring the tarball always contains a fresh, tested build.

### Verify before publishing

```bash
# See exactly what will be in the tarball
npm pack --dry-run

# Create a local tarball and inspect it
npm pack
tar tzf agentic-code-review-1.0.0.tgz
```

## What npm Handles Automatically

- Downloads the tarball from the registry
- Installs production `dependencies` only (express, react, react-dom, react-syntax-highlighter)
- Skips `devDependencies` (typescript, vite, vitest, testing libs)
- Links the `bin` entry so `agentic-code-review` is on PATH
- Generates a `.cmd` wrapper on Windows for cross-platform support

## Install Experience

### Global install

```bash
npm install -g agentic-code-review

# Then use from any directory:
agentic-code-review serve --repo /path/to/project
agentic-code-review changes
```

### npx (no install)

```bash
npx agentic-code-review serve --repo .
npx agentic-code-review changes
```

npm downloads the package on first use and caches it. Subsequent calls reuse the cache.

### Project dev dependency

```bash
cd my-project
npm install --save-dev agentic-code-review

# Use via npx or npm scripts:
npx agentic-code-review serve --repo .
```

Or add to the project's `package.json` scripts:

```json
{
  "scripts": {
    "review": "agentic-code-review serve --repo ."
  }
}
```

## Skill Distribution

The `skill/SKILL.md` file is included in the published package. Users can copy it to their agent's skill directory:

```bash
# Find where the package is installed
npm root -g

# Copy skill to agent skill directory (example for Claude Code)
cp $(npm root -g)/agentic-code-review/skill/SKILL.md ~/.claude/skills/agentic-code-review/SKILL.md
```

Or the CLI could provide a convenience command (future):

```bash
agentic-code-review skill --install
```

## Versioning

Standard npm semver:

- **Patch** (1.0.1): Bug fixes, no API/CLI changes
- **Minor** (1.1.0): New CLI commands, new API endpoints, backward-compatible
- **Major** (2.0.0): Breaking changes to CLI interface, API endpoints, or comment storage format

## Updates

```bash
# Global install
npm update -g agentic-code-review

# Project dependency
npm update agentic-code-review
```
