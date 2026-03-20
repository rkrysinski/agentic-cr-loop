import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveClientDistDirectory } from "./assetPaths.js";

const createdDirectories: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(createdDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

async function createClientBuild(rootDir: string): Promise<string> {
  const clientDir = path.join(rootDir, "dist/client");
  await fs.mkdir(clientDir, { recursive: true });
  await fs.writeFile(path.join(clientDir, "index.html"), "<!doctype html>\n", "utf8");
  return clientDir;
}

describe("resolveClientDistDirectory", () => {
  it("prefers the packaged client build next to the compiled server instead of process.cwd()", async () => {
    const packageRoot = await createTempDirectory("asset-paths-package-");
    const cwdRoot = await createTempDirectory("asset-paths-cwd-");
    const packagedClientDir = await createClientBuild(packageRoot);
    await createClientBuild(cwdRoot);

    process.chdir(cwdRoot);

    const compiledServerUrl = pathToFileURL(path.join(packageRoot, "dist/server/server/server.js")).href;
    expect(resolveClientDistDirectory(compiledServerUrl)).toBe(packagedClientDir);
  });

  it("falls back to the local dist/client build when invoked from source", async () => {
    const projectRoot = await createTempDirectory("asset-paths-source-");
    const clientDir = await createClientBuild(projectRoot);
    const sourceServerUrl = pathToFileURL(path.join(projectRoot, "src/server/server.ts")).href;

    expect(resolveClientDistDirectory(sourceServerUrl)).toBe(clientDir);
  });
});
