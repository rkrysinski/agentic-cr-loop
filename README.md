# crloop

`crloop` is a local code review tool for your Git working directory. Browse diffs, annotate changed lines, export structured comments as Markdown — all in a browser UI running entirely on your machine.

Built for the AI agent workflow: agent writes code → you review and annotate → agent reads your comments and iterates.

## Requirements

- Node.js 18+
- git in PATH
- A browser

## Installation

```bash
npm install -g crloop
```

## Usage

```bash
crloop serve --repo /path/to/repo
```

Open `http://localhost:3000` in your browser.

### Multiple repositories

```bash
crloop serve --repo /path/to/frontend --repo /path/to/backend
```

### Manage repos in a running server

```bash
crloop add-repo /path/to/repo        # register a repo
crloop repos                         # list registered repos
crloop remove-repo <id>              # unregister a repo
```

### Help

```bash
crloop --help
```

## Documentation

- [Usage manual](./docs/usage.md) — full CLI reference, comment storage, workflows
- [Development](./docs/development.md) — building and running from source
- [API](./docs/api.md) — HTTP API and comment file schema
