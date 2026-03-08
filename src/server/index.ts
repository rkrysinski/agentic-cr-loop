import { parseServerOptions } from "./args.js";
import { startServer } from "./server.js";

async function main() {
  const options = parseServerOptions(process.argv.slice(2));
  const { server, port } = await startServer(options);

  server.listen(port, "127.0.0.1", () => {
    console.log(`Review tool listening on http://127.0.0.1:${port}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
