import os from "node:os";
import path from "node:path";

export function getAppDataDirectory(): string {
  const home = os.homedir();

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "local-review-tool");
  }

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "local-review-tool");
  }

  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "local-review-tool");
}
