import path from "node:path";

export type ServerOptions = {
  repoPath: string;
  port: number;
};

export function parseServerOptions(argv: string[]): ServerOptions {
  let repoPath: string | null = null;
  let port = 3000;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--repo") {
      repoPath = argv[index + 1] ?? null;
      index += 1;
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

  if (!repoPath) {
    throw new Error("Missing required --repo <path> argument");
  }

  return {
    repoPath: path.resolve(repoPath),
    port
  };
}
