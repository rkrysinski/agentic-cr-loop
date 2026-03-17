import { parseServerOptions } from "./args.js";
import { startServer } from "./server.js";

export async function runServer(options: { dev?: boolean } = {}): Promise<void> {
  const parsedOptions = parseServerOptions(process.argv.slice(2));
  const { server, port } = await startServer(parsedOptions, { dev: options.dev });
  const label = options.dev ? "API" : "Review tool";

  server.listen(port, "localhost", () => {
    console.log(`${label} listening on http://localhost:${port}`);
  });
}

export function logFatalError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
