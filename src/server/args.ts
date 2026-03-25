import path from "node:path";

export type ServerOptions = {
  repos: Array<{ id: string; path: string }>;
  port: number;
  foreground: boolean;
};

export function deriveRepoId(repoPath: string): string {
  const base = path.basename(repoPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "repo";
}

export function parseServerOptions(argv: string[]): ServerOptions {
  const rawRepos: Array<{ id: string; path: string }> = [];
  let port = 3000;
  let foreground = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--foreground") {
      foreground = true;
      continue;
    }

    if (arg === "--repo") {
      const value = argv[index + 1] ?? null;
      index += 1;
      if (!value) continue;

      const colonIndex = value.indexOf(":");
      let id: string;
      let repoPath: string;

      if (colonIndex > 0) {
        id = value.slice(0, colonIndex);
        repoPath = value.slice(colonIndex + 1);
      } else {
        repoPath = value;
        id = deriveRepoId(path.basename(repoPath));
      }

      rawRepos.push({ id, path: path.resolve(repoPath) });
      continue;
    }

    if (arg === "--port") {
      const parsed = Number(argv[index + 1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Invalid --port value");
      }
      port = parsed;
      index += 1;
    }
  }

  const seen = new Map<string, string>();
  for (const repo of rawRepos) {
    if (seen.has(repo.id)) {
      throw new Error(
        `Duplicate repo id "${repo.id}" for paths: ${seen.get(repo.id)} and ${repo.path}. ` +
          `Use name:/path syntax to assign unique ids.`
      );
    }
    seen.set(repo.id, repo.path);
  }

  return { repos: rawRepos, port, foreground };
}
