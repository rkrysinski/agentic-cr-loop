#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deriveRepoId, parseServerOptions } from "./args.js";
import { logFatalError, runServer } from "./runServer.js";

function getCurrentVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
        if (pkg.name === "crloop" && pkg.version) return pkg.version;
      } catch { /* keep walking up */ }
      dir = dirname(dir);
    }
  } catch { /* ignore */ }
  return "0.0.0";
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] => v.split(".").map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  return la > ca || (la === ca && lb > cb) || (la === ca && lb === cb && lc > cc);
}

async function checkForUpdate(): Promise<string | null> {
  try {
    const current = getCurrentVersion();
    if (current === "0.0.0") return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch("https://registry.npmjs.org/crloop/latest", { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = await response.json() as { version: string };
    if (isNewer(data.version, current)) {
      return `\nUpdate available: ${current} → ${data.version}  Run: npm install -g crloop@latest\n`;
    }
    return null;
  } catch {
    return null;
  }
}

const DEFAULT_URL = "http://localhost:3000";

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

async function apiFetch(
  url: string,
  method: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status !== 204 ? await response.json().catch(() => null) : null;
  return { status: response.status, data };
}

async function cmdRepos(args: string[]): Promise<void> {
  const baseUrl = getFlag(args, "--url") ?? DEFAULT_URL;
  const json = hasFlag(args, "--json");
  let result: { status: number; data: unknown };
  try {
    result = await apiFetch(`${baseUrl}/api/repos`, "GET");
  } catch {
    console.error("Connection failed");
    process.exit(1);
  }
  if (result.status !== 200) {
    console.error(`Server error: ${result.status}`);
    process.exit(1);
  }
  const repos = result.data as Array<{ id: string; path: string }>;
  if (json) {
    console.log(JSON.stringify(repos));
  } else if (repos.length === 0) {
    console.log("(no repos registered)");
  } else {
    const maxLen = Math.max(...repos.map((r) => r.id.length));
    for (const repo of repos) {
      console.log(`${repo.id.padEnd(maxLen)}  ${repo.path}`);
    }
  }
}

async function cmdAddRepo(args: string[]): Promise<void> {
  const repoPath = args[0];
  const id = getFlag(args, "--id");
  const baseUrl = getFlag(args, "--url") ?? DEFAULT_URL;
  const json = hasFlag(args, "--json");
  const dryRun = hasFlag(args, "--dry-run");

  if (!repoPath || repoPath.startsWith("-")) {
    console.error("Usage: crloop add-repo <path> [--id <repoId>] [--url URL] [--json] [--dry-run]");
    process.exit(1);
  }

  if (dryRun) {
    const derivedId = id ?? deriveRepoId(repoPath);
    if (json) {
      console.log(JSON.stringify({ dryRun: true, id: derivedId, path: repoPath }));
    } else {
      console.log(`Would register: ${derivedId} → ${repoPath}`);
    }
    return;
  }

  const bodyPayload: { path: string; id?: string } = { path: repoPath };
  if (id) bodyPayload.id = id;

  let result: { status: number; data: unknown };
  try {
    result = await apiFetch(`${baseUrl}/api/repos`, "POST", bodyPayload);
  } catch {
    console.error("Connection failed");
    process.exit(1);
  }

  if (result.status === 201) {
    const repo = result.data as { id: string; path: string };
    if (json) {
      console.log(JSON.stringify(repo));
    } else {
      console.log(`Registered: ${repo.id} → ${repo.path}`);
    }
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

async function cmdStopServer(args: string[]): Promise<void> {
  const baseUrl = getFlag(args, "--url") ?? DEFAULT_URL;
  const json = hasFlag(args, "--json");
  try {
    const response = await fetch(`${baseUrl}/api/server/stop`, { method: "POST" });
    if (response.status === 204) {
      if (json) {
        console.log(JSON.stringify({ stopped: true }));
      } else {
        console.log("Server stopped.");
      }
    } else {
      console.error(`Unexpected response: ${response.status}`);
      process.exit(1);
    }
  } catch {
    console.error("Connection failed — is the server running?");
    process.exit(1);
  }
}

async function cmdRemoveRepo(args: string[]): Promise<void> {
  const repoId = args[0];
  const baseUrl = getFlag(args, "--url") ?? DEFAULT_URL;
  const json = hasFlag(args, "--json");
  const dryRun = hasFlag(args, "--dry-run");

  if (!repoId || repoId.startsWith("-")) {
    console.error("Usage: crloop remove-repo <repoId> [--url URL] [--json] [--dry-run]");
    process.exit(1);
  }

  if (dryRun) {
    if (json) {
      console.log(JSON.stringify({ dryRun: true, id: repoId }));
    } else {
      console.log(`Would remove: ${repoId}`);
    }
    return;
  }

  let result: { status: number; data: unknown };
  try {
    result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}`, "DELETE");
  } catch {
    console.error("Connection failed");
    process.exit(1);
  }

  if (result.status === 204) {
    if (json) {
      console.log(JSON.stringify({ id: repoId }));
    } else {
      console.log(`Removed: ${repoId}`);
    }
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

function cmdSchema(args: string[]): void {
  const command = args[0];
  const schema = {
    serve: {
      description: "Start the review server (default when no command given)",
      options: {
        "--repo": { type: "string", multiple: true, description: "Add a repository. Use name:/path for explicit ID." },
        "--port": { type: "number", default: 3000, description: "Server port (must be > 0)" },
      },
    },
    "stop-server": {
      description: "Stop the running server",
      options: {
        "--url": { type: "string", default: "http://localhost:3000", description: "Server URL" },
        "--json": { type: "boolean", description: "Output JSON: {stopped: true}" },
      },
    },
    repos: {
      description: "List repos registered with the running server",
      options: {
        "--url": { type: "string", default: "http://localhost:3000", description: "Server URL" },
        "--json": { type: "boolean", description: "Output JSON array of {id, path} objects" },
      },
    },
    "add-repo": {
      description: "Register a repo with the running server at runtime",
      args: [{ name: "path", required: true, description: "Filesystem path to the repository" }],
      options: {
        "--id": { type: "string", description: "Explicit repo ID (derived from basename if omitted)" },
        "--url": { type: "string", default: "http://localhost:3000", description: "Server URL" },
        "--json": { type: "boolean", description: "Output JSON {id, path} on success" },
        "--dry-run": { type: "boolean", description: "Validate and preview without registering" },
      },
    },
    "remove-repo": {
      description: "Unregister a repo from the running server",
      args: [{ name: "repoId", required: true, description: "ID of the repo to remove" }],
      options: {
        "--url": { type: "string", default: "http://localhost:3000", description: "Server URL" },
        "--json": { type: "boolean", description: "Output JSON {id} on success" },
        "--dry-run": { type: "boolean", description: "Preview without removing" },
      },
    },
    schema: {
      description: "Print machine-readable schema for all commands or a single command",
      args: [{ name: "command", required: false, description: "Command name to describe (omit for all)" }],
    },
  };

  if (command && command in schema) {
    console.log(JSON.stringify(schema[command as keyof typeof schema], null, 2));
  } else {
    console.log(JSON.stringify(schema, null, 2));
  }
}

function printHelp(): void {
  console.log(`crloop — agentic code review loop

Usage:
  crloop serve [--repo <path>] [--repo name:<path>] [--port <number>]
  crloop stop-server [--url URL] [--json]
  crloop repos [--url URL] [--json]
  crloop add-repo <path> [--id <repoId>] [--url URL] [--json] [--dry-run]
  crloop remove-repo <repoId> [--url URL] [--json] [--dry-run]
  crloop schema [command]

Commands:
  serve        Start the review server (default when no command given)
  stop-server  Stop the running server
  repos        List repos registered with the running server
  add-repo     Register a repo with the running server at runtime
  remove-repo  Unregister a repo from the running server
  schema       Print machine-readable JSON schema for commands

Flags available on most commands:
  --json       Output machine-readable JSON instead of human text
  --dry-run    (add-repo, remove-repo) Preview action without executing it

Repo ID derivation:
  Directory basename lowercased, non-alphanumeric chars replaced with "-"
  Override with name:/path syntax:  --repo fe:/path/to/frontend

Examples:
  crloop serve --repo /path/to/project
  crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend
  crloop add-repo /path/to/repo --id my-api
  crloop add-repo /path/to/repo --dry-run
  crloop repos --url http://localhost:4000
  crloop repos --json
  crloop remove-repo my-api
  crloop schema add-repo

ID derivation examples:
  my_frontend  →  my-frontend   (${deriveRepoId("my_frontend")})
  Backend.API  →  backend-api   (${deriveRepoId("Backend.API")})
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    printHelp();
  } else if (command === "--version" || command === "-v") {
    console.log(getCurrentVersion());
  } else if (command === "serve" || !command || command.startsWith("-")) {
    const argv = command === "serve" ? args.slice(1) : args;
    if (process.env["CRLOOP_DAEMON"] === "1") {
      // Running as daemon — start server and keep process alive
      await runServer({ argv });
    } else {
      // Validate args in the foreground so errors surface before spawning
      parseServerOptions(argv);
      // Spawn detached daemon and exit
      const child = spawn(process.execPath, [process.argv[1]!, "serve", ...argv], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, CRLOOP_DAEMON: "1" },
      });
      child.unref();
      // Wait briefly to let the server bind, then confirm
      await new Promise((resolve) => setTimeout(resolve, 500));
      const portFlag = argv.indexOf("--port");
      const port = portFlag !== -1 ? argv[portFlag + 1] : "3000";
      console.log(`Server started (pid ${child.pid}) on http://localhost:${port}`);
      checkForUpdate().then((notice) => { if (notice) console.log(notice); }).catch(() => {});
    }
  } else if (command === "schema") {
    cmdSchema(args.slice(1));
  } else if (command === "stop-server") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdStopServer(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else if (command === "repos") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdRepos(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else if (command === "add-repo") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdAddRepo(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else if (command === "remove-repo") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdRemoveRepo(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else {
    console.error(`Unknown command: ${command}\nRun "crloop --help" for usage.`);
    process.exit(1);
  }
}

main().catch(logFatalError);
