import { useCallback, useState } from "react";
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
