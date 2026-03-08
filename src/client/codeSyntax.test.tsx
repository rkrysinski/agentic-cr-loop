import { describe, expect, it } from "vitest";
import { resolveSyntaxLanguage } from "./codeSyntax.js";

describe("resolveSyntaxLanguage", () => {
  it("maps supported file extensions to registered Prism languages", () => {
    expect(resolveSyntaxLanguage("src/App.ts")).toBe("typescript");
    expect(resolveSyntaxLanguage("src/App.tsx")).toBe("tsx");
    expect(resolveSyntaxLanguage("src/App.js")).toBe("javascript");
    expect(resolveSyntaxLanguage("src/App.jsx")).toBe("jsx");
    expect(resolveSyntaxLanguage("src/config.json")).toBe("json");
    expect(resolveSyntaxLanguage("src/site.css")).toBe("css");
    expect(resolveSyntaxLanguage("templates/page.html")).toBe("markup");
    expect(resolveSyntaxLanguage("README.md")).toBe("markdown");
    expect(resolveSyntaxLanguage("src/Main.java")).toBe("java");
    expect(resolveSyntaxLanguage("scripts/tool.py")).toBe("python");
    expect(resolveSyntaxLanguage("scripts/install.sh")).toBe("bash");
    expect(resolveSyntaxLanguage("config/app.yaml")).toBe("yaml");
  });

  it("falls back to null for unknown or extensionless paths", () => {
    expect(resolveSyntaxLanguage("notes.txt")).toBeNull();
    expect(resolveSyntaxLanguage("Dockerfile")).toBeNull();
    expect(resolveSyntaxLanguage("")).toBeNull();
  });
});
