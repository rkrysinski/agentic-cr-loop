# Local Git Review Tool

A single-user web app for reviewing Git working directory changes locally — browse diffs in unified or side-by-side view, attach comments to changed lines, and export them as Markdown. It runs entirely locally — no auth, no remote integrations, no Git writes.

## Motivation

After a decade of using proper code review tools like Crucible, I couldn't go back to reviewing code in a terminal or IDE. Neither gives you a good way to collect structured feedback.

The second driver was AI agents. Agents write a lot of code, and I needed a way to review that code — and to feed structured comments back to them. Existing review tools weren't designed for that loop: agent generates code → you review it and annotate → agent reads your comments and iterates.

This tool fills that gap. It gives you a familiar diff-and-comment UI, stores everything as plain text in a format agents can read directly, and lets you curate agent-generated comments before passing them back.

## Requirements

- `git` in `PATH`
- Node.js and `npm`
- A Git repository with at least one commit

## Installation

```bash
git clone <this-repo>
cd code-review
npm install
```

## Usage

### Development

```bash
npm run dev -- --repo /path/to/repo
```

Opens two servers: backend API on `http://localhost:3000`, frontend on `http://localhost:5173`. Open the frontend URL in your browser.

Optional: `--port <number>` overrides the backend port (update `vite.config.ts` to match if you do).

### Production

```bash
npm run build
npm start -- --repo /path/to/repo
```

The backend serves the built frontend at `http://localhost:3000`.

### Tests

```bash
npm test           # single run
npm run test:watch # watch mode
```

## Comment Storage

Comments are saved inside the reviewed repository at:

```
<repo-root>/.local-code-review/<head-short-id>.json
```

They persist across restarts and travel with the checkout. See [docs/api.md](./docs/api.md) for the full schema.

## Further Reading

- [Architecture](./docs/architecture.md)
- [API & comment storage](./docs/api.md)
- [Comment file schema](./docs/review-comments.schema.json)
