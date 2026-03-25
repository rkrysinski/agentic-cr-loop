#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, cpSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn, exec, execFile } from "node:child_process";
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

export function findPackageRoot(startUrl: string): string {
  let dir = dirname(fileURLToPath(startUrl));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string };
      if (pkg.name === "crloop") return dir;
    } catch { /* keep walking up */ }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  throw new Error("Cannot locate crloop package root. Try reinstalling crloop.");
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
const LOCK_DIR = join(homedir(), ".crloop");
const LOCK_FILE = join(LOCK_DIR, "server.json");

type LockFileData = { port: number; pid: number; startedAt: string };

function writeLockFile(port: number, pid: number): void {
  mkdirSync(LOCK_DIR, { recursive: true });
  // Hide dotfile directory on Windows where dotfiles aren't hidden by default.
  // Use execFile (no shell) to avoid metacharacter issues with homedir paths.
  if (process.platform === "win32") {
    execFile("attrib", ["+h", LOCK_DIR], () => {});
  }
  const data: LockFileData = { port, pid, startedAt: new Date().toISOString() };
  writeFileSync(LOCK_FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function removeLockFile(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function readLockFile(): LockFileData | null {
  try {
    if (!existsSync(LOCK_FILE)) return null;
    const data = JSON.parse(readFileSync(LOCK_FILE, "utf8")) as LockFileData;
    // Verify PID is alive
    try {
      process.kill(data.pid, 0);
    } catch (error: unknown) {
      // EPERM means the process exists but we lack permission (common on Windows) — treat as alive
      if ((error as NodeJS.ErrnoException).code !== "EPERM") return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function waitForDaemonStartup(child: ReturnType<typeof spawn>, port: number, timeoutMs = 5_000): Promise<LockFileData> {
  let childExitCode: number | null = null;

  child.once("exit", (code) => {
    childExitCode = code;
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lock = readLockFile();
    if (lock && lock.port === port && lock.pid === child.pid) {
      return lock;
    }
    if (childExitCode !== null) {
      throw new Error(`Server failed to start (daemon exited with code ${childExitCode}).`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Server failed to start before the startup timeout elapsed.");
}

function resolveBaseUrl(args: string[]): string {
  const explicit = getFlag(args, "--url");
  if (explicit) return explicit;
  const envUrl = process.env["CODE_REVIEW_URL"];
  if (envUrl) return envUrl;
  const lock = readLockFile();
  if (lock) return `http://localhost:${lock.port}`;
  return DEFAULT_URL;
}

function validateFilePath(file: string): string {
  if (file.includes("..") || file.startsWith("/") || /^[a-zA-Z]:/.test(file)) {
    console.error(`Invalid file path: ${file}`);
    process.exit(1);
  }
  return file.replace(/\\/g, "/");
}

function validateSide(side: string | undefined): "new" | "old" {
  if (side !== "new" && side !== "old") {
    console.error(`Invalid side: ${side ?? "(missing)"}. Must be "new" or "old".`);
    process.exit(1);
  }
  return side;
}

function validateLine(line: string | undefined): number {
  const n = Number(line);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`Invalid line number: ${line ?? "(missing)"}. Must be a positive integer.`);
    process.exit(1);
  }
  return n;
}

function validateRepoId(id: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    console.error(`Invalid repo ID: ${id}. Must be alphanumeric and hyphens only.`);
    process.exit(1);
  }
  return id;
}

async function resolveRepoId(args: string[], baseUrl: string): Promise<string> {
  const explicit = getFlag(args, "--repo");
  if (explicit) return explicit;

  const result = await apiFetch(`${baseUrl}/api/repos`, "GET");
  const repos = result.data as Array<{ id: string; path: string }>;
  const cwd = process.cwd();
  const toSlash = (p: string) => p.replace(/\\/g, "/");
  const ncwd = toSlash(cwd);
  const match = repos.find((r) => {
    const np = toSlash(r.path);
    return ncwd === np || ncwd.startsWith(np + "/");
  });
  if (!match) {
    console.error("Cannot detect repo from current directory. Use --repo <repoId>.");
    console.error(`Registered repos: ${repos.map((r) => r.id).join(", ") || "(none)"}`);
    process.exit(1);
  }
  return match.id;
}

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
  const baseUrl = resolveBaseUrl(args);
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
  const baseUrl = resolveBaseUrl(args);
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
  const baseUrl = resolveBaseUrl(args);
  const json = hasFlag(args, "--json");
  try {
    const response = await fetch(`${baseUrl}/api/server/stop`, { method: "POST" });
    if (response.status === 204) {
      removeLockFile();
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
  const baseUrl = resolveBaseUrl(args);
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

function cmdUrl(args: string[]): void {
  const json = hasFlag(args, "--json");
  const lock = readLockFile();
  if (!lock) {
    console.error("No running server found (lock file missing or PID dead).");
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify({ url: `http://localhost:${lock.port}`, port: lock.port, pid: lock.pid }));
  } else {
    console.log(`http://localhost:${lock.port}`);
  }
}

async function cmdOpen(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const url = `${baseUrl}/crloop/${encodeURIComponent(repoId)}`;

  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  // Windows `start` treats the first quoted arg as a window title — pass empty title first
  const shellCmd = platform === "win32" ? `start "" ${JSON.stringify(url)}` : `${cmd} ${JSON.stringify(url)}`;
  exec(shellCmd, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      process.exit(1);
    }
  });
}

async function cmdComment(args: string[]): Promise<void> {
  const dryRun = hasFlag(args, "--dry-run");
  const fromFile = getFlag(args, "--from-file");

  // Validate single-comment inputs early (before any network calls)
  let singleComment: { filePath: string; side: "new" | "old"; line: number; body: string } | null = null;
  if (!fromFile) {
    const file = getFlag(args, "--file");
    const sideRaw = getFlag(args, "--side");
    const lineRaw = getFlag(args, "--line");
    const body = getFlag(args, "--body");

    if (!file || !sideRaw || !lineRaw || !body) {
      console.error("Usage: crloop comment --file <path> --side <new|old> --line <number> --body <text>");
      console.error("       crloop comment --from-file <path>");
      process.exit(1);
    }

    singleComment = {
      filePath: validateFilePath(file),
      side: validateSide(sideRaw),
      line: validateLine(lineRaw),
      body,
    };
  }

  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);

  // Fetch changes to resolve file paths to changeIds
  const changesResult = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/changes`, "GET");
  const changes = changesResult.data as Array<{ changeId: string; oldPath: string | null; newPath: string | null }>;

  function resolveChangeId(file: string): string | null {
    const match = changes.find((c) => c.newPath === file || c.oldPath === file);
    return match?.changeId ?? null;
  }

  if (fromFile) {
    // Bulk mode
    const content = readFileSync(fromFile, "utf8");
    const entries = JSON.parse(content) as Array<{ file: string; side: string; line: number; body: string }>;
    let created = 0;
    let failed = 0;

    for (const entry of entries) {
      const filePath = validateFilePath(entry.file);
      const side = validateSide(entry.side);
      const line = entry.line;
      if (!Number.isInteger(line) || line <= 0) {
        console.error(`Invalid line number for ${filePath}: ${line}`);
        failed++;
        continue;
      }

      const changeId = resolveChangeId(filePath);
      if (!changeId) {
        console.error(`File not found in changes: ${filePath}`);
        failed++;
        continue;
      }

      if (dryRun) {
        console.log(`Would create: ${filePath}:${line} (${side}) — ${entry.body.slice(0, 60)}`);
        created++;
        continue;
      }

      try {
        const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/comments`, "POST", {
          changeId, side, lineNumber: line, body: entry.body,
        });
        if (result.status === 201) {
          created++;
        } else {
          const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
          console.error(`Failed for ${filePath}:${line}: ${error}`);
          failed++;
        }
      } catch {
        console.error(`Failed for ${filePath}:${line}: Connection error`);
        failed++;
      }
    }

    console.log(`${created} created, ${failed} failed`);
  } else {
    // Single-comment mode (already validated above)
    const { filePath, side, line, body } = singleComment!;

    const changeId = resolveChangeId(filePath);
    if (!changeId) {
      console.error(`File not found in changes: ${filePath}`);
      process.exit(1);
    }

    if (dryRun) {
      console.log(`Would create comment on ${filePath}:${line} (${side})`);
      return;
    }

    const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/comments`, "POST", {
      changeId, side, lineNumber: line, body,
    });
    if (result.status === 201) {
      const comment = result.data as { commentId: string };
      console.log(comment.commentId);
    } else {
      const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
      console.error(error);
      process.exit(1);
    }
  }
}

async function cmdExport(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const fileFilter = getFlag(args, "--file");
  const includeOutdated = hasFlag(args, "--include-outdated");

  let url = `${baseUrl}/api/repos/${encodeURIComponent(repoId)}/export/comments.txt`;
  const params = new URLSearchParams();
  if (fileFilter) {
    params.set("file", fileFilter);
  }
  if (includeOutdated) {
    params.set("includeOutdated", "true");
  }
  const qs = params.toString();
  if (qs) {
    url += `?${qs}`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Export failed: ${response.status}`);
    process.exit(1);
  }
  const text = await response.text();
  process.stdout.write(text);
}

async function cmdStatus(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const json = hasFlag(args, "--json");

  const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session`, "GET");
  if (result.status !== 200) {
    console.error(`Failed to get session: ${result.status}`);
    process.exit(1);
  }

  const session = result.data as {
    status: string; iteration: number; headId: string;
    commentCounts: { current: number; outdated: number };
  };

  if (json) {
    console.log(JSON.stringify(session));
  } else {
    console.log(`Status:     ${session.status}`);
    console.log(`Iteration:  ${session.iteration}`);
    console.log(`Comments:   ${session.commentCounts.current} current, ${session.commentCounts.outdated} outdated`);
    console.log(`Head:       ${session.headId}`);
  }
}

async function cmdFinishSelfReview(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const dryRun = hasFlag(args, "--dry-run");

  if (dryRun) {
    const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session`, "GET");
    const session = result.data as { status: string };
    if (session.status === "agent-review") {
      console.log("Would transition: agent-review → human-review");
    } else {
      console.error(`Cannot transition: current status is "${session.status}", expected "agent-review".`);
      process.exit(1);
    }
    return;
  }

  const result = await apiFetch(
    `${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session/transition`,
    "POST",
    { status: "human-review" }
  );

  if (result.status === 200) {
    console.log("Handed off to human review.");
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

async function cmdFinishAddressing(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const dryRun = hasFlag(args, "--dry-run");

  if (dryRun) {
    const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session`, "GET");
    const session = result.data as { status: string };
    if (session.status === "agent-addressing") {
      console.log("Would transition: agent-addressing → agent-review");
    } else {
      console.error(`Cannot transition: current status is "${session.status}", expected "agent-addressing".`);
      process.exit(1);
    }
    return;
  }

  const result = await apiFetch(
    `${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session/transition`,
    "POST",
    { status: "agent-review" }
  );

  if (result.status === 200) {
    console.log("Ready for next self-review iteration.");
  } else {
    const error = (result.data as { error?: string })?.error ?? `Status ${result.status}`;
    console.error(error);
    process.exit(1);
  }
}

async function cmdWait(args: string[]): Promise<void> {
  const baseUrl = resolveBaseUrl(args);
  const repoId = await resolveRepoId(args, baseUrl);
  const interval = Number(getFlag(args, "--poll-interval") ?? "3") * 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await apiFetch(`${baseUrl}/api/repos/${encodeURIComponent(repoId)}/session`, "GET");
    const session = result.data as { status: string };

    if (session.status === "agent-addressing") {
      process.exit(0);
    }
    if (session.status === "complete") {
      process.exit(2);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

function cmdSkill(args: string[]): void {
  const install = hasFlag(args, "--install");
  const print = hasFlag(args, "--print");
  const force = hasFlag(args, "--force");
  const dryRun = hasFlag(args, "--dry-run");
  const json = hasFlag(args, "--json");
  const scope = getFlag(args, "--scope") ?? "global";

  if (install && print) {
    console.error("--install and --print are mutually exclusive.");
    process.exit(4);
  }
  if (!install && !print) {
    console.error("Usage: crloop skill --install [--scope global|project] [--force] [--dry-run] [--json]");
    console.error("       crloop skill --print");
    process.exit(1);
  }
  if (scope !== "global" && scope !== "project") {
    console.error(`Invalid scope: ${scope}. Must be "global" or "project".`);
    process.exit(1);
  }

  // Resolve source
  let packageRoot: string;
  try {
    packageRoot = findPackageRoot(import.meta.url);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
  const sourceDir = join(packageRoot, "skill", "crloop");
  const source = join(sourceDir, "SKILL.md");
  if (!existsSync(source)) {
    console.error("Skill file not found — try reinstalling crloop");
    process.exit(2);
  }
  const content = readFileSync(source, "utf8");

  if (print) {
    process.stdout.write(content);
    return;
  }

  // --install branch
  const targetDir = scope === "global"
    ? join(homedir(), ".claude", "skills", "crloop")
    : join(process.cwd(), ".claude", "skills", "crloop");
  const target = join(targetDir, "SKILL.md");

  const version = getCurrentVersion();
  let status: "created" | "updated" | "unchanged" | "skipped";

  if (existsSync(target)) {
    const existing = readFileSync(target, "utf8");
    if (existing === content) {
      status = "unchanged";
    } else if (force) {
      status = "updated";
    } else {
      status = "skipped";
    }
  } else {
    status = "created";
  }

  if (!dryRun && (status === "created" || status === "updated")) {
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(target, content, "utf8");
    // Copy reference files (e.g. references/) alongside SKILL.md
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "SKILL.md") continue;
      const src = join(sourceDir, entry.name);
      const dst = join(targetDir, entry.name);
      if (entry.isDirectory()) {
        cpSync(src, dst, { recursive: true, force: true });
      } else {
        writeFileSync(dst, readFileSync(src), "utf8");
      }
    }
  }

  if (json) {
    console.log(JSON.stringify({ status: dryRun ? "dry-run" : status, source, target, version, dryRun }));
  } else if (dryRun) {
    console.log(`[dry-run] Would write crloop skill to ${target}`);
  } else if (status === "unchanged") {
    console.log(`crloop skill is already up to date (v${version}).`);
  } else if (status === "skipped") {
    console.log(`Skill file exists and differs from current version.`);
    console.log(`  Target: ${target}`);
    console.log(`  Run with --force to overwrite.`);
  } else {
    console.log(`${status === "created" ? "Installed" : "Updated"} crloop skill → ${target}`);
    console.log(`  Status:  ${status}`);
    console.log(`  Version: ${version}`);
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
        "--foreground": { type: "boolean", description: "Run in the current process with request logging to stdout (for debugging)" },
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
    url: {
      description: "Print the base URL of the running server (reads lock file, no network call)",
      options: {
        "--json": { type: "boolean", description: "Output JSON: {url, port, pid}" },
      },
    },
    open: {
      description: "Open the review UI in the default browser",
      options: {
        "--repo": { type: "string", description: "Target repo ID (auto-detected from CWD if omitted)" },
        "--url": { type: "string", description: "Server URL" },
      },
    },
    comment: {
      description: "Add a comment to a changed line (single or bulk mode)",
      options: {
        "--file": { type: "string", description: "File path (relative to repo root)" },
        "--side": { type: "string", enum: ["new", "old"], description: "Diff side" },
        "--line": { type: "number", description: "Line number (positive integer)" },
        "--body": { type: "string", description: "Comment body text" },
        "--from-file": { type: "string", description: "Path to JSON file with array of comments for bulk import" },
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--dry-run": { type: "boolean", description: "Validate without creating comments" },
      },
    },
    export: {
      description: "Export all comments as plain text",
      options: {
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--file": { type: "string", description: "Filter output to comments on a single file" },
      },
    },
    status: {
      description: "Show review session status",
      options: {
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--json": { type: "boolean", description: "Output raw JSON from session endpoint" },
      },
    },
    "finish-self-review": {
      description: "Signal that the agent has finished self-review (transitions to human-review)",
      options: {
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--dry-run": { type: "boolean", description: "Validate without transitioning" },
      },
    },
    "finish-addressing": {
      description: "Signal that the agent has finished addressing feedback (transitions back to agent-review for next iteration)",
      options: {
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--dry-run": { type: "boolean", description: "Validate without transitioning" },
      },
    },
    wait: {
      description: "Block until the human finishes review",
      options: {
        "--repo": { type: "string", description: "Target repo ID" },
        "--url": { type: "string", description: "Server URL" },
        "--poll-interval": { type: "number", default: 3, description: "Polling interval in seconds" },
      },
    },
    skill: {
      description: "Install or print the crloop agent skill",
      options: {
        "--install": { type: "boolean", description: "Install skill to Claude Code skills directory" },
        "--print": { type: "boolean", description: "Print skill content to stdout" },
        "--scope": { type: "string", enum: ["global", "project"], default: "global", description: "Install scope: global (~/.claude/skills/) or project (.claude/skills/)" },
        "--force": { type: "boolean", description: "Overwrite existing skill file even if content differs" },
        "--dry-run": { type: "boolean", description: "Preview without writing" },
        "--json": { type: "boolean", description: "Output JSON: {status, source, target, version, dryRun}" },
      },
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
  crloop serve [--repo <path>] [--repo name:<path>] [--port <number>] [--foreground]
  crloop stop-server [--url URL] [--json]
  crloop repos [--url URL] [--json]
  crloop add-repo <path> [--id <repoId>] [--url URL] [--json] [--dry-run]
  crloop remove-repo <repoId> [--url URL] [--json] [--dry-run]
  crloop schema [command]
  crloop url [--json]
  crloop open [--repo <repoId>] [--url URL]
  crloop comment --file <path> --side <new|old> --line <n> --body <text> [--repo <repoId>] [--url URL] [--dry-run]
  crloop comment --from-file <path> [--repo <repoId>] [--url URL] [--dry-run]
  crloop export [--repo <repoId>] [--url URL] [--file <path>]
  crloop status [--repo <repoId>] [--url URL] [--json]
  crloop finish-self-review [--repo <repoId>] [--url URL] [--dry-run]
  crloop finish-addressing [--repo <repoId>] [--url URL] [--dry-run]
  crloop wait [--repo <repoId>] [--url URL] [--poll-interval <seconds>]
  crloop skill --install [--scope global|project] [--force] [--dry-run] [--json]
  crloop skill --print

Server management:
  serve              Start the review server (default when no command given)
                       --foreground   Run in the current process with request logging (for debugging)
  stop-server        Stop the running server
  url                Print the running server's base URL (reads lock file)

Repository management:
  repos              List repos registered with the running server
  add-repo           Register a repo with the running server at runtime
  remove-repo        Unregister a repo from the running server

Review workflow:
  open               Open the review UI in the default browser
  comment            Add a comment to a changed line (single or bulk)
  export             Export comments as plain text (skips outdated by default)
                       --include-outdated   Include outdated comments in export
  status             Show review session status
  finish-self-review Signal self-review complete, hand off to human
  finish-addressing  Signal addressing complete, begin next self-review iteration
  wait               Block until the human finishes review

Skill management:
  skill --install    Install the crloop agent skill to Claude Code
  skill --print      Print the skill file to stdout

Introspection:
  schema             Print machine-readable JSON schema for commands

Flags available on most commands:
  --json       Output machine-readable JSON instead of human text
  --dry-run    Preview action without executing it
  --repo       Target a specific repo (auto-detected from CWD if omitted)
  --url        Server URL (auto-discovered from lock file if omitted)

URL resolution order:
  --url flag → CODE_REVIEW_URL env var → lock file (~/.crloop/server.json) → http://localhost:3000

Examples:
  crloop serve --repo /path/to/project
  crloop serve --repo fe:/path/to/frontend --repo be:/path/to/backend
  crloop add-repo /path/to/repo --id my-api
  crloop repos --json
  crloop url
  crloop open
  crloop comment --file src/main.ts --side new --line 42 --body "Fix this"
  crloop comment --from-file comments.json --dry-run
  crloop export --file src/main.ts
  crloop status --json
  crloop finish-self-review
  crloop finish-addressing
  crloop wait --poll-interval 5
  crloop schema comment
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
      const port = await runServer({ argv });
      writeLockFile(port, process.pid);
    } else {
      // Validate args in the foreground so errors surface before spawning
      const parsedOpts = parseServerOptions(argv);
      // Idempotency: bail if a live server is already on the same port
      const existing = readLockFile();
      if (existing && existing.port === parsedOpts.port) {
        console.log(`Server running (pid ${existing.pid}) on http://localhost:${existing.port}`);
        return;
      }

      if (parsedOpts.foreground) {
        // Foreground mode — run server in current process with verbose logging
        const port = await runServer({ argv, verbose: true });
        writeLockFile(port, process.pid);
        const cleanup = () => { removeLockFile(); process.exit(0); };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
        // Ensure lock file removal on any exit (covers Windows where SIGTERM doesn't fire)
        process.on("exit", () => { try { removeLockFile(); } catch { /* best-effort */ } });
      } else {
        // Spawn detached daemon and exit.
        // On Windows, `detached` creates a new process group (no POSIX signals).
        // Daemon shutdown is handled via the HTTP /api/server/stop endpoint.
        const child = spawn(process.execPath, [process.argv[1]!, "serve", ...argv], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, CRLOOP_DAEMON: "1" },
        });
        child.unref();
        try {
          const lock = await waitForDaemonStartup(child, parsedOpts.port);
          console.log(`Server running (pid ${lock.pid}) on http://localhost:${lock.port}`);
        } catch (error) {
          console.error((error as Error).message);
          process.exit(1);
        }
        checkForUpdate().then((notice) => { if (notice) console.log(notice); }).catch(() => {});
      }
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
  } else if (command === "url") {
    cmdUrl(args.slice(1));
  } else if (command === "open") {
    await cmdOpen(args.slice(1));
  } else if (command === "comment") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdComment(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else if (command === "export") {
    await cmdExport(args.slice(1));
  } else if (command === "status") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdStatus(subArgs);
    const notice = await updateCheck;
    if (notice && !hasFlag(subArgs, "--json")) console.log(notice);
  } else if (command === "finish-self-review") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdFinishSelfReview(subArgs);
    const notice = await updateCheck;
    if (notice) console.log(notice);
  } else if (command === "finish-addressing") {
    const subArgs = args.slice(1);
    const updateCheck = checkForUpdate();
    await cmdFinishAddressing(subArgs);
    const notice = await updateCheck;
    if (notice) console.log(notice);
  } else if (command === "wait") {
    await cmdWait(args.slice(1));
  } else if (command === "skill") {
    cmdSkill(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}\nRun "crloop --help" for usage.`);
    process.exit(1);
  }
}

main().catch(logFatalError);
