# Distribution

## Package Name

`crloop`

See [docs/decisions/naming.md](../../decisions/naming.md) for the rationale behind this name and the repository name (`agentic-cr-loop`).

## Distribution Channel

npm registry. Users install without cloning the repository:

```bash
# Install globally
npm install -g crloop

# Or run without installing
npx crloop serve --repo ./my-project

# Or install as a project dev dependency
npm install --save-dev crloop
npx crloop serve --repo .
```

## End-User Requirements

- Node.js 18+
- npm
- `git` on PATH

## package.json Changes

```json
{
  "name": "crloop",
  "version": "1.0.0",
  "private": false,
  "type": "module",
  "description": "Agentic code review loop — human and agent review together",
  "bin": {
    "crloop": "dist/server/server/cli.js"
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
| `name` | `crloop` | npm package name |
| `private` | `false` | Allows publishing (currently `true`) |
| `bin` | `{ "crloop": "dist/server/server/cli.js" }` | Registers the CLI command |
| `files` | `["dist/server", "dist/client", "skill"]` | Whitelist of files included in the tarball |
| `prepublishOnly` | `npm run build && npm test` | Ensures build and tests pass before publishing |

## What Gets Published

The `files` field controls what npm includes in the tarball:

```
crloop/
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
tar tzf crloop-1.0.0.tgz
```

## What npm Handles Automatically

- Downloads the tarball from the registry
- Installs production `dependencies` only (express, react, react-dom, react-syntax-highlighter)
- Skips `devDependencies` (typescript, vite, vitest, testing libs)
- Links the `bin` entry so `crloop` is on PATH
- Generates a `.cmd` wrapper on Windows for cross-platform support

## Install Experience

### Global install

```bash
npm install -g crloop

# Then use from any directory:
crloop serve --repo /path/to/project
crloop changes
```

### npx (no install)

```bash
npx crloop serve --repo .
npx crloop changes
```

npm downloads the package on first use and caches it. Subsequent calls reuse the cache.

### Project dev dependency

```bash
cd my-project
npm install --save-dev crloop

# Use via npx or npm scripts:
npx crloop serve --repo .
```

Or add to the project's `package.json` scripts:

```json
{
  "scripts": {
    "review": "crloop serve --repo ."
  }
}
```

## Skill Distribution

The `skill/SKILL.md` file is included in the published package. Users can copy it to their agent's skill directory:

```bash
# Find where the package is installed
npm root -g

# Copy skill to agent skill directory (example for Claude Code)
cp $(npm root -g)/crloop/skill/SKILL.md ~/.claude/skills/crloop/SKILL.md
```

Or the CLI could provide a convenience command (future):

```bash
crloop skill --install
```

## Versioning

Standard npm semver:

- **Patch** (1.0.1): Bug fixes, no API/CLI changes
- **Minor** (1.1.0): New CLI commands, new API endpoints, backward-compatible
- **Major** (2.0.0): Breaking changes to CLI interface, API endpoints, or comment storage format

## Updates

```bash
# Global install
npm update -g crloop

# Project dependency
npm update crloop
```
