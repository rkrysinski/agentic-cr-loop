import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const children = [
  spawn("npx", ["tsx", "watch", "src/server/devServer.ts", ...args], {
    stdio: "inherit",
    shell: process.platform === "win32"
  }),
  spawn("npx", ["vite"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  })
];

let exiting = false;

function shutdown(code = 0) {
  if (exiting) {
    return;
  }

  exiting = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
