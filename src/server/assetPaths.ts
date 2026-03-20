import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveClientDistDirectory(importMetaUrl: string): string {
  const moduleDir = path.dirname(fileURLToPath(importMetaUrl));
  const candidates = [
    path.resolve(moduleDir, "../../client"),
    path.resolve(moduleDir, "../../dist/client"),
    path.resolve(process.cwd(), "dist/client")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  return candidates[0]!;
}
