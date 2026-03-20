import { describe, expect, it } from "vitest";
import { deriveRepoId, parseServerOptions } from "./args.js";

describe("deriveRepoId", () => {
  it("lowercases and hyphenates a normal directory name", () => {
    expect(deriveRepoId("my-repo")).toBe("my-repo");
  });

  it("lowercases uppercase characters", () => {
    expect(deriveRepoId("MyRepo")).toBe("myrepo");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(deriveRepoId("my_repo.name")).toBe("my-repo-name");
  });

  it("collapses consecutive special characters into a single hyphen", () => {
    expect(deriveRepoId("my--repo__name")).toBe("my-repo-name");
  });

  it("strips leading and trailing hyphens", () => {
    expect(deriveRepoId("-repo-")).toBe("repo");
  });

  it("falls back to 'repo' when the result would be empty", () => {
    expect(deriveRepoId("---")).toBe("repo");
    expect(deriveRepoId("")).toBe("repo");
  });
});

describe("parseServerOptions", () => {
  it("defaults to port 3000 and empty repo list", () => {
    expect(parseServerOptions([])).toEqual({ repos: [], port: 3000 });
  });

  it("parses --repo with a plain path and derives the id", () => {
    const result = parseServerOptions(["--repo", "/home/user/my-project"]);
    expect(result.repos).toHaveLength(1);
    expect(result.repos[0]?.id).toBe("my-project");
    expect(result.repos[0]?.path).toBe("/home/user/my-project");
  });

  it("parses --repo with id:path syntax", () => {
    const result = parseServerOptions(["--repo", "frontend:/home/user/frontend"]);
    expect(result.repos[0]?.id).toBe("frontend");
    expect(result.repos[0]?.path).toBe("/home/user/frontend");
  });

  it("parses multiple --repo arguments", () => {
    const result = parseServerOptions([
      "--repo", "a:/repos/a",
      "--repo", "b:/repos/b"
    ]);
    expect(result.repos).toHaveLength(2);
    expect(result.repos[0]?.id).toBe("a");
    expect(result.repos[1]?.id).toBe("b");
  });

  it("parses --port", () => {
    const result = parseServerOptions(["--port", "4000"]);
    expect(result.port).toBe(4000);
  });

  it("throws on invalid --port value", () => {
    expect(() => parseServerOptions(["--port", "abc"])).toThrow("Invalid --port value");
    expect(() => parseServerOptions(["--port", "0"])).toThrow("Invalid --port value");
    expect(() => parseServerOptions(["--port", "-1"])).toThrow("Invalid --port value");
  });

  it("throws on duplicate repo ids", () => {
    expect(() =>
      parseServerOptions(["--repo", "main:/repos/a", "--repo", "main:/repos/b"])
    ).toThrow(/Duplicate repo id "main"/);
  });

  it("ignores --repo with no following value", () => {
    const result = parseServerOptions(["--repo"]);
    expect(result.repos).toHaveLength(0);
  });
});
