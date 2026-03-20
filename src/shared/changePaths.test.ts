import { describe, expect, it } from "vitest";
import { getChangePath } from "./changePaths.js";

describe("getChangePath", () => {
  it("returns newPath when present", () => {
    expect(getChangePath({ newPath: "src/foo.ts", oldPath: "src/old.ts" })).toBe("src/foo.ts");
  });

  it("returns oldPath when newPath is null", () => {
    expect(getChangePath({ newPath: null, oldPath: "src/deleted.ts" })).toBe("src/deleted.ts");
  });

  it("returns '(unknown)' when both paths are null", () => {
    expect(getChangePath({ newPath: null, oldPath: null })).toBe("(unknown)");
  });
});
