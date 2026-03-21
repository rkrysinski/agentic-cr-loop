import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistedState, useViewedState } from "./hooks.js";

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

describe("useViewedState", () => {
  const REPO = "my-repo";
  const HEAD = "abc123def456";
  const KEY = `crloop.viewed.${REPO}`;

  function seed(ids: string[], head = HEAD) {
    store[KEY] = JSON.stringify({ head, ids });
  }

  describe("initial value", () => {
    it("returns an empty set when repoId is null", () => {
      const { result } = renderHook(() => useViewedState(null, HEAD));
      expect(result.current[0].size).toBe(0);
    });

    it("returns an empty set when headShortId is null", () => {
      const { result } = renderHook(() => useViewedState(REPO, null));
      expect(result.current[0].size).toBe(0);
    });

    it("returns an empty set when nothing is stored", () => {
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      expect(result.current[0].size).toBe(0);
    });

    it("reads stored ids when HEAD matches", () => {
      seed(["file-a", "file-b"]);
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      expect(result.current[0]).toEqual(new Set(["file-a", "file-b"]));
    });

    it("returns empty set and clears storage when stored HEAD does not match", () => {
      seed(["file-a"], "old-head-12");
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      expect(result.current[0].size).toBe(0);
      expect(lsMock.removeItem).toHaveBeenCalledWith(KEY);
    });

    it("returns empty set when stored JSON is malformed", () => {
      store[KEY] = "not-valid-json";
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      expect(result.current[0].size).toBe(0);
    });
  });

  describe("addViewed", () => {
    it("adds a changeId to the set", () => {
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      act(() => result.current[1]("file-a"));
      expect(result.current[0].has("file-a")).toBe(true);
    });

    it("persists the viewed set to localStorage with the current head", () => {
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      act(() => result.current[1]("file-a"));
      expect(lsMock.setItem).toHaveBeenCalledWith(
        KEY,
        JSON.stringify({ head: HEAD, ids: ["file-a"] })
      );
    });

    it("accumulates multiple changeIds", () => {
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      act(() => result.current[1]("file-a"));
      act(() => result.current[1]("file-b"));
      expect(result.current[0]).toEqual(new Set(["file-a", "file-b"]));
    });

    it("does not update state or call setItem when changeId is already viewed (dedup guard)", () => {
      seed(["file-a"]);
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      vi.clearAllMocks();
      act(() => result.current[1]("file-a"));
      expect(lsMock.setItem).not.toHaveBeenCalled();
    });

    it("silently ignores localStorage quota errors", () => {
      lsMock.setItem.mockImplementationOnce(() => { throw new Error("QuotaExceededError"); });
      const { result } = renderHook(() => useViewedState(REPO, HEAD));
      expect(() => act(() => result.current[1]("file-a"))).not.toThrow();
      expect(result.current[0].has("file-a")).toBe(true);
    });

    it("does nothing when repoId is null", () => {
      const { result } = renderHook(() => useViewedState(null, HEAD));
      act(() => result.current[1]("file-a"));
      expect(lsMock.setItem).not.toHaveBeenCalled();
    });

    it("does nothing when headShortId is null", () => {
      const { result } = renderHook(() => useViewedState(REPO, null));
      act(() => result.current[1]("file-a"));
      expect(lsMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe("HEAD change invalidation", () => {
    it("resets to empty set when headShortId changes", () => {
      seed(["file-a"]);
      const { result, rerender } = renderHook(
        ({ head }: { head: string | null }) => useViewedState(REPO, head),
        { initialProps: { head: HEAD } }
      );
      expect(result.current[0].has("file-a")).toBe(true);
      rerender({ head: "newhead123456" });
      expect(result.current[0].size).toBe(0);
    });

    it("loads stored ids for the new HEAD after repo switch", () => {
      const NEW_REPO = "other-repo";
      const NEW_KEY = `crloop.viewed.${NEW_REPO}`;
      store[NEW_KEY] = JSON.stringify({ head: HEAD, ids: ["file-x"] });

      const { result, rerender } = renderHook(
        ({ repo }: { repo: string }) => useViewedState(repo, HEAD),
        { initialProps: { repo: REPO } }
      );
      expect(result.current[0].size).toBe(0);
      rerender({ repo: NEW_REPO });
      expect(result.current[0]).toEqual(new Set(["file-x"]));
    });

    it("destroys new repo stored state when called with stale headShortId from old repo", () => {
      const NEW_REPO = "new-repo";
      const NEW_HEAD = "newhead999";
      const NEW_KEY = `crloop.viewed.${NEW_REPO}`;
      seed(["file-a"]);
      store[NEW_KEY] = JSON.stringify({ head: NEW_HEAD, ids: ["file-x"] });

      const { rerender } = renderHook(
        ({ repo, head }: { repo: string; head: string }) => useViewedState(repo, head),
        { initialProps: { repo: REPO, head: HEAD } }
      );

      // repoId switches to new repo but headShortId is still the OLD head (stale)
      rerender({ repo: NEW_REPO, head: HEAD });

      // the new repo's localStorage entry is nuked by the mismatch
      expect(lsMock.removeItem).toHaveBeenCalledWith(NEW_KEY);
    });

    it("preserves new repo's stored viewed state when headShortId passes through null during repo switch", () => {
      const NEW_REPO = "new-repo";
      const NEW_HEAD = "newhead999";
      const NEW_KEY = `crloop.viewed.${NEW_REPO}`;
      seed(["file-a"]);
      store[NEW_KEY] = JSON.stringify({ head: NEW_HEAD, ids: ["file-x"] });

      const { result, rerender } = renderHook(
        ({ repo, head }: { repo: string; head: string | null }) => useViewedState(repo, head),
        { initialProps: { repo: REPO, head: HEAD as string | null } }
      );
      expect(result.current[0].has("file-a")).toBe(true);

      // App.tsx resets repo→null before async fetch, so headShortId goes null first
      rerender({ repo: NEW_REPO, head: null });
      expect(lsMock.removeItem).not.toHaveBeenCalled();

      // then the correct head arrives
      rerender({ repo: NEW_REPO, head: NEW_HEAD });
      expect(result.current[0]).toEqual(new Set(["file-x"]));
    });

    it("clears set when repoId becomes null", () => {
      seed(["file-a"]);
      const { result, rerender } = renderHook(
        ({ repo }: { repo: string | null }) => useViewedState(repo, HEAD),
        { initialProps: { repo: REPO as string | null } }
      );
      expect(result.current[0].has("file-a")).toBe(true);
      rerender({ repo: null });
      expect(result.current[0].size).toBe(0);
    });
  });

  describe("addViewed stability", () => {
    it("returns the same addViewed reference across re-renders with same args", () => {
      const { result, rerender } = renderHook(() => useViewedState(REPO, HEAD));
      const first = result.current[1];
      rerender();
      expect(result.current[1]).toBe(first);
    });
  });
});
