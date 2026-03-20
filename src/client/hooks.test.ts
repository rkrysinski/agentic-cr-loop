import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistedState } from "./hooks.js";

// jsdom's localStorage is a minimal stub (not a Storage.prototype instance).
// Replace it with a vi.fn()-backed mock so we can control reads/writes.
let store: Record<string, string> = {};
const lsMock = {
  getItem: vi.fn((key: string): string | null => store[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => { store[key] = value; }),
  removeItem: vi.fn((key: string): void => { delete store[key]; }),
  clear: vi.fn((): void => { store = {}; }),
};
Object.defineProperty(globalThis, "localStorage", { value: lsMock, writable: true });

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
});

const identity = (raw: string) => raw;
const parseNum = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};
const parseBool = (raw: string) => raw === "true";

describe("usePersistedState", () => {
  describe("initial value", () => {
    it("returns defaultValue when nothing is stored", () => {
      const { result } = renderHook(() =>
        usePersistedState("test-key", "default", identity)
      );
      expect(result.current[0]).toBe("default");
    });

    it("reads stored string value on mount", () => {
      store["test-key"] = "stored";
      const { result } = renderHook(() =>
        usePersistedState("test-key", "default", identity)
      );
      expect(result.current[0]).toBe("stored");
    });

    it("reads stored numeric value on mount", () => {
      store["width-key"] = "350";
      const { result } = renderHook(() =>
        usePersistedState("width-key", 240, parseNum)
      );
      expect(result.current[0]).toBe(350);
    });

    it("reads stored boolean value on mount", () => {
      store["bool-key"] = "true";
      const { result } = renderHook(() =>
        usePersistedState("bool-key", false, parseBool)
      );
      expect(result.current[0]).toBe(true);
    });

    it("falls back to defaultValue when parse throws", () => {
      store["test-key"] = "not-a-number";
      const strictParse = (raw: string) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error("invalid");
        return n;
      };
      const { result } = renderHook(() =>
        usePersistedState("test-key", 42, strictParse)
      );
      expect(result.current[0]).toBe(42);
    });

    it("falls back to defaultValue when localStorage.getItem throws", () => {
      lsMock.getItem.mockImplementationOnce(() => { throw new Error("storage unavailable"); });
      const { result } = renderHook(() =>
        usePersistedState("test-key", "fallback", identity)
      );
      expect(result.current[0]).toBe("fallback");
    });
  });

  describe("setter — direct value", () => {
    it("updates state", () => {
      const { result } = renderHook(() =>
        usePersistedState("test-key", "initial", identity)
      );
      act(() => result.current[1]("updated"));
      expect(result.current[0]).toBe("updated");
    });

    it("writes updated string value to localStorage", () => {
      const { result } = renderHook(() =>
        usePersistedState("test-key", "initial", identity)
      );
      act(() => result.current[1]("saved"));
      expect(lsMock.setItem).toHaveBeenCalledWith("test-key", "saved");
    });

    it("writes number value to localStorage", () => {
      const { result } = renderHook(() =>
        usePersistedState("num-key", 0, parseNum)
      );
      act(() => result.current[1](240));
      expect(lsMock.setItem).toHaveBeenCalledWith("num-key", "240");
    });

    it("writes boolean value to localStorage", () => {
      const { result } = renderHook(() =>
        usePersistedState("bool-key", false, parseBool)
      );
      act(() => result.current[1](true));
      expect(lsMock.setItem).toHaveBeenCalledWith("bool-key", "true");
    });

    it("silently ignores localStorage.setItem failures", () => {
      lsMock.setItem.mockImplementationOnce(() => { throw new Error("quota exceeded"); });
      const { result } = renderHook(() =>
        usePersistedState("test-key", "initial", identity)
      );
      expect(() => act(() => result.current[1]("new"))).not.toThrow();
      expect(result.current[0]).toBe("new");
    });
  });

  describe("setter — functional updater", () => {
    it("receives current value and applies the update", () => {
      const { result } = renderHook(() =>
        usePersistedState("num-key", 10, parseNum)
      );
      act(() => result.current[1]((prev) => prev + 5));
      expect(result.current[0]).toBe(15);
    });

    it("writes the computed next value to localStorage", () => {
      const { result } = renderHook(() =>
        usePersistedState("num-key", 100, parseNum)
      );
      act(() => result.current[1]((prev) => prev - 40));
      expect(lsMock.setItem).toHaveBeenCalledWith("num-key", "60");
    });
  });

  describe("parse validation", () => {
    it("accepts a valid union member", () => {
      store["mode-key"] = "side-by-side";
      const parse = (raw: string): "unified" | "side-by-side" =>
        raw === "unified" || raw === "side-by-side" ? raw : "unified";
      const { result } = renderHook(() =>
        usePersistedState<"unified" | "side-by-side">("mode-key", "unified", parse)
      );
      expect(result.current[0]).toBe("side-by-side");
    });

    it("falls back to default for an invalid union member", () => {
      store["mode-key"] = "invalid-mode";
      const parse = (raw: string): "unified" | "side-by-side" =>
        raw === "unified" || raw === "side-by-side" ? raw : "unified";
      const { result } = renderHook(() =>
        usePersistedState<"unified" | "side-by-side">("mode-key", "unified", parse)
      );
      expect(result.current[0]).toBe("unified");
    });

    it("validates sidebarWidth within range", () => {
      const MIN = 180, MAX = 480, DEFAULT = 240;
      const parse = (raw: string) => {
        const n = Number(raw);
        return Number.isFinite(n) && n >= MIN && n <= MAX ? n : DEFAULT;
      };
      store["width-key"] = "350";
      const { result } = renderHook(() =>
        usePersistedState("width-key", DEFAULT, parse)
      );
      expect(result.current[0]).toBe(350);
    });

    it("rejects sidebarWidth out of range", () => {
      const MIN = 180, MAX = 480, DEFAULT = 240;
      const parse = (raw: string) => {
        const n = Number(raw);
        return Number.isFinite(n) && n >= MIN && n <= MAX ? n : DEFAULT;
      };
      store["width-key"] = "9999";
      const { result } = renderHook(() =>
        usePersistedState("width-key", DEFAULT, parse)
      );
      expect(result.current[0]).toBe(DEFAULT);
    });

    it("rejects non-numeric sidebarWidth", () => {
      const MIN = 180, MAX = 480, DEFAULT = 240;
      const parse = (raw: string) => {
        const n = Number(raw);
        return Number.isFinite(n) && n >= MIN && n <= MAX ? n : DEFAULT;
      };
      store["width-key"] = "abc";
      const { result } = renderHook(() =>
        usePersistedState("width-key", DEFAULT, parse)
      );
      expect(result.current[0]).toBe(DEFAULT);
    });
  });

  describe("setter stability", () => {
    it("returns the same setter reference across re-renders", () => {
      const { result, rerender } = renderHook(() =>
        usePersistedState("test-key", "val", identity)
      );
      const firstSetter = result.current[1];
      rerender();
      expect(result.current[1]).toBe(firstSetter);
    });
  });
});
