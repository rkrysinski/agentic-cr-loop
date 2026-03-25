import { parseServerOptions } from "./args.js";
import { startServer } from "./server.js";

export async function runServer(options: { dev?: boolean; verbose?: boolean; argv?: string[] } = {}): Promise<number> {
  const parsedOptions = parseServerOptions(options.argv ?? process.argv.slice(2));
  const { server, port } = await startServer({ repos: parsedOptions.repos, port: parsedOptions.port }, { dev: options.dev, verbose: options.verbose });
  const label = options.dev ? "API" : "Review tool";

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "localhost", () => {
      console.log(`${label} listening on http://localhost:${port}`);
      resolve();
    });
  });

  return port;
}

export function logFatalError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
