import { parseServerOptions } from "./args.js";
import { startServer } from "./server.js";

async function main() {
  const options = parseServerOptions(process.argv.slice(2));
  const { server, port } = await startServer(options, { dev: true });

  server.listen(port, "localhost", () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
