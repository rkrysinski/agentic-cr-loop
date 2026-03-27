import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runGit(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  return stdout;
}

/** Cached detection: is cygpath available? */
let cygpathAvailable: boolean | null = null;

async function hasCygpath(): Promise<boolean> {
  if (cygpathAvailable !== null) return cygpathAvailable;
  try {
    await execFileAsync("cygpath", ["--version"]);
    cygpathAvailable = true;
  } catch {
    cygpathAvailable = false;
  }
  return cygpathAvailable;
}

/** Convert a path to a native Windows path via cygpath, if available. Falls back to path.resolve(). */
export async function resolveNativePath(p: string): Promise<string> {
  if (process.platform === "win32" && await hasCygpath()) {
    try {
      const { stdout } = await execFileAsync("cygpath", ["-w", p]);
      return stdout.trim();
    } catch { /* fall through */ }
  }
  return path.resolve(p);
}
