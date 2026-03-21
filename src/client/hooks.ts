import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

function readPersisted<T>(key: string, parse: (raw: string) => T, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writePersisted(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function readViewedState(key: string, currentHead: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const { head, ids } = JSON.parse(raw) as { head: string; ids: string[] };
    if (head !== currentHead) {
      localStorage.removeItem(key);
      return new Set();
    }
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function useViewedState(
  repoId: string | null,
  headShortId: string | null
): [ReadonlySet<string>, (changeId: string) => void] {
  const key = repoId ? `crloop.viewed.${repoId}` : null;

  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => {
    if (!key || !headShortId) return new Set();
    return readViewedState(key, headShortId);
  });

  useEffect(() => {
    if (!key || !headShortId) {
      setViewed(new Set());
      return;
    }
    setViewed(readViewedState(key, headShortId));
  }, [key, headShortId]);

  const addViewed = useCallback((changeId: string) => {
    if (!key || !headShortId) return;
    setViewed((current) => {
      if (current.has(changeId)) return current;
      const next = new Set([...current, changeId]);
      try {
        localStorage.setItem(key, JSON.stringify({ head: headShortId, ids: [...next] }));
      } catch { /* ignore quota errors */ }
      return next;
    });
  }, [key, headShortId]);

  return [viewed, addViewed];
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readPersisted(key, parse, defaultValue));

  const setValueAndPersist: Dispatch<SetStateAction<T>> = useCallback((action) => {
    setValue((current) => {
      const next = typeof action === "function" ? (action as (prev: T) => T)(current) : action;
      writePersisted(key, next);
      return next;
    });
  }, [key]);

  return [value, setValueAndPersist];
}
