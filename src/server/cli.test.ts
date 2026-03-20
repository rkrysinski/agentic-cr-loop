// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
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
    for (const cmd of ["serve", "stop-server", "repos", "add-repo", "remove-repo"]) {
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
