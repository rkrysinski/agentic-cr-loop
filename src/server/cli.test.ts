// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTempGitRepo } from "./testUtils.js";

// Runs cli.ts via tsx so tests work without a pre-built dist.
// NODE_OPTIONS is set so the daemon child (spawned by serve) also loads the tsx loader.
const CLI_PATH = new URL("./cli.ts", import.meta.url).pathname;
const TSX_NODE_OPTIONS = "--import tsx/esm";

function runCli(args: string[], env?: Record<string, string>): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", CLI_PATH, ...args],
    { encoding: "utf8", timeout: 10_000, env: { ...process.env, NODE_OPTIONS: TSX_NODE_OPTIONS, ...env } }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

// Kill a daemon by PID, ignoring errors if it already exited
function killDaemon(pid: number): void {
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
}

describe("crloop CLI — info flags", () => {
  it("--version exits 0 and prints a semver string", () => {
    const { status, stdout } = runCli(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("--help exits 0 and documents all commands", () => {
    const { status, stdout } = runCli(["--help"]);
    expect(status).toBe(0);
    for (const cmd of ["serve", "stop-server", "repos", "add-repo", "remove-repo", "schema"]) {
      expect(stdout).toContain(cmd);
    }
  });

  it("unknown command exits 1 and suggests --help", () => {
    const { status, stderr } = runCli(["bogus-command"]);
    expect(status).toBe(1);
    expect(stderr).toContain("--help");
  });
});

describe("crloop CLI — serve argument validation (runs in foreground before spawn)", () => {
  it("exits 1 for --port with a non-numeric value", () => {
    const { status, stderr } = runCli(["serve", "--port", "abc"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid --port");
  });

  it("exits 1 for --port 0", () => {
    const { status } = runCli(["serve", "--port", "0"]);
    expect(status).toBe(1);
  });

  it("exits 1 for duplicate repo ids", () => {
    const { status, stderr } = runCli(["serve", "--repo", "/a", "--repo", "/a", "--port", "19999"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Duplicate repo id");
  });
});

describe("crloop CLI — serve daemon behaviour", () => {
  let daemonPid: number | null = null;
  let repoPath: string | null = null;

  afterEach(async () => {
    if (daemonPid !== null) {
      killDaemon(daemonPid);
      daemonPid = null;
    }
    if (repoPath !== null) {
      await fs.rm(repoPath, { recursive: true, force: true });
      repoPath = null;
    }
  });

  it("exits 0, prints pid and URL, and the server becomes reachable", async () => {
    // tsx spawns twice (parent → daemon); allow extra time for cold start
    repoPath = await createTempGitRepo();
    const port = 19876;
    const { status, stdout } = runCli(["serve", "--repo", repoPath, "--port", String(port)]);

    expect(status).toBe(0);
    expect(stdout).toMatch(/Server started \(pid \d+\) on http:\/\/localhost:\d+/);

    const pidMatch = stdout.match(/pid (\d+)/);
    expect(pidMatch).not.toBeNull();
    daemonPid = Number(pidMatch![1]);

    // Poll until the server responds (max 5s)
    const base = `http://localhost:${port}`;
    let ready = false;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch(`${base}/api/repos`);
        if (res.ok) { ready = true; break; }
      } catch { /* not ready yet */ }
    }
    expect(ready).toBe(true);
  }, 20_000);
});

describe("crloop CLI — schema command", () => {
  it("exits 0 and emits valid JSON covering all commands", () => {
    const { status, stdout } = runCli(["schema"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    for (const cmd of ["serve", "stop-server", "repos", "add-repo", "remove-repo", "schema"]) {
      expect(parsed).toHaveProperty(cmd);
    }
  });

  it("schema <command> emits JSON for that command only, with --json and --dry-run options", () => {
    const { status, stdout } = runCli(["schema", "add-repo"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { description: string; options: Record<string, unknown> };
    expect(parsed).toHaveProperty("description");
    expect(parsed.options["--json"]).toBeDefined();
    expect(parsed.options["--dry-run"]).toBeDefined();
  });
});

describe("crloop CLI — --dry-run flag (no server required)", () => {
  it("add-repo --dry-run exits 0 and prints a preview without calling the server", () => {
    const { status, stdout, stderr } = runCli(["add-repo", "/some/path", "--dry-run"]);
    expect(status).toBe(0);
    expect(stdout).toContain("Would register:");
    expect(stdout).toContain("/some/path");
    expect(stderr).toBe("");
  });

  it("add-repo --dry-run --json outputs {dryRun:true, id, path}", () => {
    const { status, stdout } = runCli(["add-repo", "/some/path", "--id", "my-id", "--dry-run", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { dryRun: boolean; id: string; path: string };
    expect(parsed.dryRun).toBe(true);
    expect(parsed.id).toBe("my-id");
    expect(parsed.path).toBe("/some/path");
  });

  it("remove-repo --dry-run exits 0 and prints a preview without calling the server", () => {
    const { status, stdout, stderr } = runCli(["remove-repo", "my-repo", "--dry-run"]);
    expect(status).toBe(0);
    expect(stdout).toContain("Would remove:");
    expect(stdout).toContain("my-repo");
    expect(stderr).toBe("");
  });

  it("remove-repo --dry-run --json outputs {dryRun:true, id}", () => {
    const { status, stdout } = runCli(["remove-repo", "my-repo", "--dry-run", "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { dryRun: boolean; id: string };
    expect(parsed.dryRun).toBe(true);
    expect(parsed.id).toBe("my-repo");
  });
});

describe("crloop CLI — --json flag (live server)", () => {
  let daemonPid: number | null = null;
  let repoPathA: string | null = null;
  let repoPathB: string | null = null;
  const port = 19875;
  const BASE = `http://localhost:${port}`;

  beforeAll(async () => {
    repoPathA = await createTempGitRepo();
    repoPathB = await createTempGitRepo();
    const { stdout } = runCli(["serve", "--repo", repoPathA, "--port", String(port)]);
    const pidMatch = stdout.match(/pid (\d+)/);
    if (pidMatch) daemonPid = Number(pidMatch[1]);
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try { const res = await fetch(`${BASE}/api/repos`); if (res.ok) break; } catch { /* not ready */ }
    }
  }, 20_000);

  afterAll(async () => {
    if (daemonPid !== null) { killDaemon(daemonPid); daemonPid = null; }
    if (repoPathA) { await fs.rm(repoPathA, { recursive: true, force: true }); repoPathA = null; }
    if (repoPathB) { await fs.rm(repoPathB, { recursive: true, force: true }); repoPathB = null; }
  });

  it("repos --json outputs a valid JSON array of {id, path} objects", () => {
    const { status, stdout } = runCli(["repos", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const repos = JSON.parse(stdout.trim()) as Array<{ id: string; path: string }>;
    expect(Array.isArray(repos)).toBe(true);
    expect(repos.length).toBeGreaterThan(0);
    expect(repos[0]).toHaveProperty("id");
    expect(repos[0]).toHaveProperty("path");
  });

  it("add-repo --json outputs JSON {id, path} on success", () => {
    const { status, stdout } = runCli(["add-repo", repoPathB!, "--id", "json-b", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const repo = JSON.parse(stdout.trim()) as { id: string; path: string };
    expect(repo.id).toBe("json-b");
    expect(repo.path).toBe(repoPathB);
  });

  it("remove-repo --json outputs JSON {id} on success", () => {
    const { status, stdout } = runCli(["remove-repo", "json-b", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const result = JSON.parse(stdout.trim()) as { id: string };
    expect(result.id).toBe("json-b");
  });

  it("stop-server --json outputs {stopped:true} and update notice is suppressed", () => {
    const { status, stdout } = runCli(["stop-server", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const result = JSON.parse(stdout.trim()) as { stopped: boolean };
    expect(result.stopped).toBe(true);
    daemonPid = null; // already stopped, skip kill in afterAll
  });
});
