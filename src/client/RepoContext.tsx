import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RepoEntry } from "../shared/api.js";
import { type ApiClient, createApiClient, getRepos } from "./api.js";

type RepoContextValue = {
  repos: RepoEntry[];
  activeRepoId: string | null;
  setActiveRepoId: (id: string) => void;
  apiClient: ApiClient | null;
  refreshRepos: () => Promise<void>;
};

const RepoContext = createContext<RepoContextValue | null>(null);

function storageKey(): string {
  return `crloop.repo.${location.origin}`;
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(storageKey());
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    localStorage.setItem(storageKey(), value);
  } catch {
    // ignore
  }
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [activeRepoId, setActiveRepoIdState] = useState<string | null>(null);

  const refreshRepos = useCallback(async () => {
    const nextRepos = await getRepos();
    setRepos(nextRepos);
    setActiveRepoIdState((current) => {
      // Keep current selection if still valid
      if (current && nextRepos.some((r) => r.id === current)) {
        return current;
      }
      // Restore from localStorage on first load or if current is gone
      const stored = readStorage();
      if (stored && nextRepos.some((r) => r.id === stored)) {
        return stored;
      }
      return nextRepos[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    void refreshRepos();
  }, [refreshRepos]);

  const setActiveRepoId = useCallback((id: string) => {
    setActiveRepoIdState(id);
    writeStorage(id);
  }, []);

  const apiClient = useMemo(
    () => (activeRepoId ? createApiClient(activeRepoId) : null),
    [activeRepoId]
  );

  return (
    <RepoContext.Provider value={{ repos, activeRepoId, setActiveRepoId, apiClient, refreshRepos }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo(): RepoContextValue {
  const ctx = useContext(RepoContext);
  if (!ctx) {
    throw new Error("useRepo must be used within a RepoProvider");
  }
  return ctx;
}
