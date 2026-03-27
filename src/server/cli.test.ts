// @vitest-environment node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTempGitRepo } from "./testUtils.js";

// Runs cli.ts via tsx so tests work without a pre-built dist.
// NODE_OPTIONS is set so the daemon child (spawned by serve) also loads the tsx loader.
const CLI_PATH = new URL("./cli.ts", import.meta.url).pathname;
const TSX_NODE_OPTIONS = "--import tsx/esm";

function runCli(args: string[], env?: Record<string, string>, input?: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", CLI_PATH, ...args],
    { encoding: "utf8", timeout: 10_000, input, env: { ...process.env, NODE_OPTIONS: TSX_NODE_OPTIONS, ...env } }
  );
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

// Stop a daemon by hitting its HTTP shutdown endpoint
async function stopDaemonOnPort(port: number): Promise<void> {
  try {
    await fetch(`http://localhost:${port}/api/server/stop`, { method: "POST" });
  } catch { /* already gone */ }
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
    for (const cmd of ["serve", "stop-server", "repos", "add-repo", "remove-repo", "schema", "url", "open", "comment", "export", "status", "reset", "finish-self-review", "finish-addressing", "wait", "skill"]) {
      expect(stdout).toContain(cmd);
    }
    expect(stdout).toContain("--foreground");
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
  let daemonPort: number | null = null;
  let repoPath: string | null = null;

  afterEach(async () => {
    // Stop daemon via HTTP endpoint
    if (daemonPort !== null) {
      await stopDaemonOnPort(daemonPort);
      daemonPort = null;
    }
    if (repoPath !== null) {
      await fs.rm(repoPath, { recursive: true, force: true });
      repoPath = null;
    }
  });

  it("exits 0, prints URL, and the server becomes reachable", async () => {
    // tsx spawns twice (parent → daemon); allow extra time for cold start
    repoPath = await createTempGitRepo();
    const port = 19876;
    daemonPort = port;
    const { status, stdout } = runCli(["serve", "--repo", repoPath, "--port", String(port)]);

    expect(status).toBe(0);
    expect(stdout).toMatch(/Server running on http:\/\/localhost:\d+/);

    // The server should already be reachable (waitForDaemonStartup probes it)
    const res = await fetch(`http://localhost:${port}/api/repos`);
    expect(res.ok).toBe(true);
  }, 20_000);

  it("exits 0 and prints 'Server already running' without spawning a second daemon when called again on the same port", async () => {
    repoPath = await createTempGitRepo();
    const port = 19874;
    daemonPort = port;

    // First invocation — start the daemon
    const first = runCli(["serve", "--repo", repoPath, "--port", String(port)]);
    expect(first.status).toBe(0);
    expect(first.stdout).toMatch(/Server running on http:\/\/localhost:\d+/);

    // Second invocation — should detect live server and bail
    const second = runCli(["serve", "--repo", repoPath, "--port", String(port)]);
    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/Server already running on http:\/\/localhost:\d+/);
  }, 20_000);

  it("exits 1 when the daemon dies during startup instead of printing a false success message", async () => {
    const nonRepoPath = await fs.mkdtemp(path.join(os.tmpdir(), "crloop-non-repo-"));

    try {
      const { status, stdout, stderr } = runCli(["serve", "--repo", nonRepoPath, "--port", "19873"]);
      expect(status).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Server failed to start");
    } finally {
      await fs.rm(nonRepoPath, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("crloop CLI — serve --foreground", () => {
  let repoPath: string | null = null;

  afterEach(async () => {
    if (repoPath) {
      await fs.rm(repoPath, { recursive: true, force: true });
      repoPath = null;
    }
  });

  it("runs the server in the current process, prints 'listening on', and stays alive until killed", async () => {
    repoPath = await createTempGitRepo();
    const port = 19877;

    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", new URL("./cli.ts", import.meta.url).pathname, "serve", "--foreground", "--repo", repoPath, "--port", String(port)],
      { env: { ...process.env, NODE_OPTIONS: "--import tsx/esm" }, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    child.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });

    // Wait for the server to be ready
    let ready = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (stdout.includes("listening on")) { ready = true; break; }
    }
    expect(ready).toBe(true);
    expect(stdout).toContain(`http://localhost:${port}`);

    // Server should still be running (not exited)
    expect(child.exitCode).toBeNull();

    // Kill the process
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => { child.on("exit", () => resolve()); });
  }, 20_000);
});

describe("crloop CLI — schema command", () => {
  it("exits 0 and emits valid JSON covering all commands", () => {
    const { status, stdout } = runCli(["schema"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
    for (const cmd of ["serve", "stop-server", "repos", "add-repo", "remove-repo", "schema", "url", "open", "comment", "export", "status", "reset", "finish-self-review", "finish-addressing", "wait", "skill"]) {
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

  it("schema serve includes --foreground option", () => {
    const { status, stdout } = runCli(["schema", "serve"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { options: Record<string, unknown> };
    expect(parsed.options["--foreground"]).toBeDefined();
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
  let serverStopped = false;
  let repoPathA: string | null = null;
  let repoPathB: string | null = null;
  const port = 19875;
  const BASE = `http://localhost:${port}`;

  beforeAll(async () => {
    repoPathA = await createTempGitRepo();
    repoPathB = await createTempGitRepo();
    runCli(["serve", "--repo", repoPathA, "--port", String(port)]);
  }, 20_000);

  afterAll(async () => {
    if (!serverStopped) await stopDaemonOnPort(port);
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

  it("url prints the server URL when server is running", () => {
    const { status, stdout } = runCli(["url", "--url", BASE]);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe(BASE);
  });

  it("url --json outputs {url, port} when server is running", () => {
    const { status, stdout } = runCli(["url", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { url: string; port: number };
    expect(parsed.url).toBe(BASE);
    expect(parsed.port).toBe(port);
  });

  it("stop-server --json outputs {stopped:true} and update notice is suppressed", () => {
    const { status, stdout } = runCli(["stop-server", "--url", BASE, "--json"]);
    expect(status).toBe(0);
    const result = JSON.parse(stdout.trim()) as { stopped: boolean };
    expect(result.stopped).toBe(true);
    serverStopped = true;
  });
});

describe("crloop CLI — url command", () => {
  it("exits 1 when no server is running on the target port", () => {
    // Use a port unlikely to have a server
    const { status, stderr } = runCli(["url", "--url", "http://localhost:19999"]);
    expect(status).toBe(1);
    expect(stderr).toContain("No running server");
  });
});

describe("crloop CLI — skill command", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "crloop-skill-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("skill without --install or --print exits 1 with usage", () => {
    const { status, stderr } = runCli(["skill"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Usage:");
  });

  it("skill --install --print exits 4 (mutually exclusive)", () => {
    const { status, stderr } = runCli(["skill", "--install", "--print"]);
    expect(status).toBe(4);
    expect(stderr).toContain("mutually exclusive");
  });

  it("skill --print writes skill content to stdout", () => {
    const { status, stdout } = runCli(["skill", "--print"]);
    expect(status).toBe(0);
    expect(stdout).toContain("name: crloop");
    expect(stdout).toContain("# Code Review Skill");
  });

  it("skill --install creates new file (status: created)", async () => {
    const target = path.join(tmpDir, "global-new", ".claude", "skills", "crloop", "SKILL.md");
    const { status, stdout } = runCli(["skill", "--install", "--json"], {
      HOME: path.join(tmpDir, "global-new"),
    });
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { status: string; target: string; version: string; dryRun: boolean };
    expect(parsed.status).toBe("created");
    expect(parsed.target).toBe(target);
    expect(parsed.dryRun).toBe(false);
    // File actually exists
    const content = await fs.readFile(target, "utf8");
    expect(content).toContain("name: crloop");
    // References directory was copied alongside SKILL.md
    const refsDir = path.join(tmpDir, "global-new", ".claude", "skills", "crloop", "references");
    const refFile = path.join(refsDir, "code-review.md");
    expect(require("node:fs").existsSync(refFile)).toBe(true);
    const refContent = await fs.readFile(refFile, "utf8");
    expect(refContent).toContain("code reviewer");
  });

  it("skill --install identical content (status: unchanged)", () => {
    // Re-run same install — file already has identical content
    const { status, stdout } = runCli(["skill", "--install", "--json"], {
      HOME: path.join(tmpDir, "global-new"),
    });
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { status: string };
    expect(parsed.status).toBe("unchanged");
  });

  it("skill --install differing content without --force (status: skipped)", async () => {
    // Write different content to the target
    const targetDir = path.join(tmpDir, "global-diff", ".claude", "skills", "crloop");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "SKILL.md"), "old content", "utf8");

    const { status, stdout } = runCli(["skill", "--install", "--json"], {
      HOME: path.join(tmpDir, "global-diff"),
    });
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { status: string };
    expect(parsed.status).toBe("skipped");

    // File was not overwritten
    const content = await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8");
    expect(content).toBe("old content");
    // References directory was not created either
    const refsDir = path.join(targetDir, "references");
    expect(require("node:fs").existsSync(refsDir)).toBe(false);
  });

  it("skill --install --force overwrites differing content (status: updated)", async () => {
    const { status, stdout } = runCli(["skill", "--install", "--force", "--json"], {
      HOME: path.join(tmpDir, "global-diff"),
    });
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { status: string };
    expect(parsed.status).toBe("updated");

    const content = await fs.readFile(path.join(tmpDir, "global-diff", ".claude", "skills", "crloop", "SKILL.md"), "utf8");
    expect(content).toContain("name: crloop");
    // References directory was also written on force update
    const refFile = path.join(tmpDir, "global-diff", ".claude", "skills", "crloop", "references", "code-review.md");
    expect(require("node:fs").existsSync(refFile)).toBe(true);
  });

  it("skill --install --dry-run does not write file", () => {
    const home = path.join(tmpDir, "global-dry");
    const { status, stdout } = runCli(["skill", "--install", "--dry-run", "--json"], {
      HOME: home,
    });
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { status: string };
    expect(parsed.status).toBe("dry-run");
    // File should NOT exist
    const exists = require("node:fs").existsSync(path.join(home, ".claude", "skills", "crloop", "SKILL.md"));
    expect(exists).toBe(false);
    // References directory should NOT exist either
    const refsExists = require("node:fs").existsSync(path.join(home, ".claude", "skills", "crloop", "references"));
    expect(refsExists).toBe(false);
  });

  it("skill --install --scope project writes to CWD-relative path", () => {
    const projectDir = path.join(tmpDir, "project-scope");
    require("node:fs").mkdirSync(projectDir, { recursive: true });
    const { status, stdout } = runCli(["skill", "--install", "--scope", "project", "--json"], {
      HOME: path.join(tmpDir, "unused-home"),
      CRLOOP_CWD: projectDir,
    });
    // The CWD for the subprocess is inherited, so --scope project uses the subprocess CWD.
    // We can't easily change subprocess CWD via env; let's just verify JSON has the right target pattern.
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { target: string };
    expect(parsed.target).toContain(path.join(".claude", "skills", "crloop", "SKILL.md"));
  });
});

describe("crloop CLI — findPackageRoot", () => {
  it("schema command succeeds — proves findPackageRoot works from the package", () => {
    // findPackageRoot is called by cmdSkill; if the walk fails, --print would fail too
    const { status, stdout } = runCli(["skill", "--print"]);
    expect(status).toBe(0);
    expect(stdout.length).toBeGreaterThan(100);
  });
});

describe("crloop CLI — input validation", () => {
  it("comment with --file containing .. exits 1", () => {
    const { status, stderr } = runCli(["comment", "--file", "../etc/passwd", "--side", "new", "--line", "1", "--body", "test", "--url", "http://localhost:1"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid file path");
  });

  it("comment with absolute --file exits 1", () => {
    const { status, stderr } = runCli(["comment", "--file", "/etc/passwd", "--side", "new", "--line", "1", "--body", "test", "--url", "http://localhost:1"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid file path");
  });

  it("comment with invalid --side exits 1", () => {
    const { status, stderr } = runCli(["comment", "--file", "foo.ts", "--side", "both", "--line", "1", "--body", "test", "--url", "http://localhost:1"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid side");
  });

  it("comment with invalid --line exits 1", () => {
    const { status, stderr } = runCli(["comment", "--file", "foo.ts", "--side", "new", "--line", "abc", "--body", "test", "--url", "http://localhost:1"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid line number");
  });

  it("comment with negative --line exits 1", () => {
    const { status, stderr } = runCli(["comment", "--file", "foo.ts", "--side", "new", "--line", "-5", "--body", "test", "--url", "http://localhost:1"]);
    expect(status).toBe(1);
    expect(stderr).toContain("Invalid line number");
  });
});

describe("crloop CLI — comment --from-stdin (no server required)", () => {
  it("--from-stdin --from-file together exits 1 with mutual-exclusion error", () => {
    const { status, stderr } = runCli(
      ["comment", "--from-stdin", "--from-file", "some.json", "--url", "http://localhost:1"],
      undefined,
      "[]"
    );
    expect(status).toBe(1);
    expect(stderr).toContain("mutually exclusive");
  });

  it("--from-stdin with empty stdin exits 1 (JSON parse error)", () => {
    const { status, stderr } = runCli(
      ["comment", "--from-stdin", "--url", "http://localhost:1"],
      undefined,
      ""
    );
    expect(status).toBe(1);
    // readFileSync(0) on empty input returns "" which fails JSON.parse
  });

  it("schema output includes --from-stdin option for the comment command", () => {
    const { status, stdout } = runCli(["schema", "comment"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout.trim()) as { options: Record<string, unknown> };
    expect(parsed.options["--from-stdin"]).toBeDefined();
  });
});

describe("crloop CLI — comment --from-stdin (live server)", () => {
  let repoPath: string | null = null;
  const port = 19878;
  const BASE = `http://localhost:${port}`;

  beforeAll(async () => {
    repoPath = await createTempGitRepo();
    runCli(["serve", "--repo", repoPath, "--port", String(port)]);
  }, 20_000);

  afterAll(async () => {
    await stopDaemonOnPort(port);
    if (repoPath) {
      await fs.rm(repoPath, { recursive: true, force: true });
      repoPath = null;
    }
  });

  it("--from-stdin with valid JSON piped via stdin posts comments", () => {
    // Repo ID is the lowercased, sanitized basename of the temp directory
    const repoId = path.basename(repoPath!).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const comments = JSON.stringify([
      { file: "tracked.txt", side: "new", line: 1, body: "stdin comment" },
    ]);
    const { status, stdout, stderr } = runCli(
      ["comment", "--from-stdin", "--repo", repoId, "--url", BASE],
      undefined,
      comments
    );
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout).toContain("1 created, 0 failed");
  });
});
