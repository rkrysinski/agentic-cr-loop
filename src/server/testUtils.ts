import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export async function createTempGitRepo(): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "review-tool-"));

  runGit(repoPath, ["init"]);
  runGit(repoPath, ["config", "user.name", "Test User"]);
  runGit(repoPath, ["config", "user.email", "test@example.com"]);
  await fs.writeFile(path.join(repoPath, "tracked.txt"), "before\nstay\n", "utf8");
  await fs.writeFile(path.join(repoPath, "rename-me.txt"), "rename source\n", "utf8");
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-m", "initial"]);

  await fs.writeFile(path.join(repoPath, "tracked.txt"), "after\nstay\n", "utf8");
  await fs.rename(path.join(repoPath, "rename-me.txt"), path.join(repoPath, "renamed.txt"));
  await fs.writeFile(path.join(repoPath, "untracked.txt"), "brand new\nline two\n", "utf8");
  await fs.writeFile(path.join(repoPath, "binary.bin"), Buffer.from([0, 1, 2, 3, 4]));

  return repoPath;
}

export function runGit(repoPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf8"
  });
}
