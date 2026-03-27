import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveNativePath } from "./git.js";

describe("resolveNativePath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to path.resolve on non-win32 platforms", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const result = await resolveNativePath("/some/path");
    expect(result).toBe(path.resolve("/some/path"));
  });

  it("falls back to path.resolve on win32 when cygpath is unavailable", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    // cygpath is not available in CI/macOS — the cached detection will return false
    const result = await resolveNativePath("/some/path");
    expect(result).toBe(path.resolve("/some/path"));
  });
});
