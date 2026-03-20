# Release Manual

## Prerequisites

- npm account with publish access to the `crloop` package
- Logged in: `npm whoami` should return your username

## Release checklist

### 1. Verify everything passes

```bash
npm run build
npm test
```

`prepublishOnly` will run both automatically before publish, but running them manually first gives faster feedback.

### 2. Bump the version

Edit `version` in `package.json` following semver:

| Change | Version bump | When |
|--------|-------------|------|
| Bug fix | patch (1.0.x) | Backwards-compatible fix |
| New feature | minor (1.x.0) | New CLI command, new API endpoint |
| Breaking change | major (x.0.0) | Changed CLI flags, changed API, changed storage format |

### 3. Commit the version bump

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin HEAD --tags
```

### 3a. Pre-release smoke test (npm link)

Before publishing, install the package locally using `npm link` and verify the CLI works end-to-end.

**Link the package:**

```bash
# In the crloop repo root
npm link
```

**Run smoke tests in a temporary project:**

```bash
mkdir /tmp/crloop-smoke && cd /tmp/crloop-smoke
git init && git commit --allow-empty -m "init"   # crloop needs a git repo to work with
npm link crloop
```

**Verify the binary resolves and basic commands work:**

```bash
which crloop                                # must return a path
crloop --version                            # must match the version in package.json
crloop serve --repo /tmp/crloop-smoke       # starts in background, prints pid; must exit 0
crloop stop-server                          # must print "Server stopped." and exit 0
```

**Clean up after testing:**

```bash
npm unlink                                  # inside root repository
cd /tmp/crloop-smoke
npm unlink crloop
cd / && rm -rf /tmp/crloop-smoke
```

If any step above fails, stop and fix before proceeding to publish.

### 4. Publish

```bash
npm publish
```

`prepublishOnly` runs `npm run build && npm test` automatically. If either fails, publish is aborted.

What gets published (defined by `files` in `package.json`):

```
dist/server/   # compiled Express app and CLI binary
dist/client/   # bundled React app served as static files
skill/         # Claude Code skill definition
```

### 5. Verify the release

```bash
npm install -g crloop@X.Y.Z
crloop --help
crloop serve --repo /path/to/any/git-repo
```

Confirm the version:

```bash
crloop --version  # must print X.Y.Z matching package.json
```

## Patch release (hotfix)

For urgent fixes without going through the normal feature cycle:

```bash
git checkout -b hotfix/X.Y.Z
# make the fix
npm version patch   # bumps package.json and creates the commit + tag
git push origin HEAD --tags
npm publish
```

## Reverting a bad release

npm does not allow re-publishing the same version. If a broken version was published:

1. Deprecate it so users are warned on install:
   ```bash
   npm deprecate crloop@X.Y.Z "Critical bug, upgrade to X.Y.Z+1"
   ```
2. Publish a patch release with the fix.

To fully remove a version (only within 72 hours of publish and if it has no dependents):

```bash
npm unpublish crloop@X.Y.Z
```
