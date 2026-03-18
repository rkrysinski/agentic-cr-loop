#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveRepoId } from "./args.js";
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
  if (repos.length === 0) {
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

  if (!repoPath || repoPath.startsWith("-")) {
    console.error("Usage: crloop add-repo <path> [--id <repoId>] [--url URL]");
    process.exit(1);
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
    console.log(`Registered: ${repo.id} → ${repo.path}`);
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

async function cmdRemoveRepo(args: string[]): Promise<void> {
  const repoId = args[0];
  const baseUrl = getFlag(args, "--url") ?? DEFAULT_URL;

  if (!repoId || repoId.startsWith("-")) {
    console.error("Usage: crloop remove-repo <repoId> [--url URL]");
    process.exit(1);
  }

  let result: { status: number; data: unknown };
  try {
    result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}`, "DELETE");
  } catch {
    console.error("Connection failed");
    process.exit(1);
  }

  if (result.status === 204) {
    console.log(`Removed: ${repoId}`);
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`crloop — agentic code review loop

Usage:
  crloop serve [--repo <path>] [--repo name:<path>] [--port <number>]
  crloop repos [--url URL]
  crloop add-repo <path> [--id <repoId>] [--url URL]
  crloop remove-repo <repoId> [--url URL]

Commands:
  serve        Start the review server (default when no command given)
  repos        List repos registered with the running server
  add-repo     Register a repo with the running server at runtime
  remove-repo  Unregister a repo from the running server

Repo ID derivation:
  Directory basename lowercased, non-alphanumeric chars replaced with "-"
  Override with name:/path syntax:  --repo fe:/path/to/frontend

Examples:
  crloop serve --repo /path/to/project
  crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend
  crloop add-repo /path/to/repo --id my-api
  crloop repos --url http://localhost:4000
  crloop remove-repo my-api

ID derivation examples:
  my_frontend  →  my-frontend   (${deriveRepoId("my_frontend")})
  Backend.API  →  backend-api   (${deriveRepoId("Backend.API")})
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "serve" || !command || command.startsWith("-")) {
    // Long-running server — fire and forget the check so it prints after "listening" message
    checkForUpdate().then((notice) => { if (notice) console.log(notice); }).catch(() => {});
    const argv = command === "serve" ? args.slice(1) : args;
    await runServer({ argv });
  } else if (command === "repos") {
    const updateCheck = checkForUpdate();
    await cmdRepos(args.slice(1));
    const notice = await updateCheck;
    if (notice) console.log(notice);
  } else if (command === "add-repo") {
    const updateCheck = checkForUpdate();
    await cmdAddRepo(args.slice(1));
    const notice = await updateCheck;
    if (notice) console.log(notice);
  } else if (command === "remove-repo") {
    const updateCheck = checkForUpdate();
    await cmdRemoveRepo(args.slice(1));
    const notice = await updateCheck;
    if (notice) console.log(notice);
  } else if (command === "--help" || command === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${command}\nRun "crloop --help" for usage.`);
    process.exit(1);
  }
}

main().catch(logFatalError);
