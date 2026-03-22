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

export function RepoProvider({ children, crloopRepoId }: { children: ReactNode; crloopRepoId?: string | null }) {
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [activeRepoId, setActiveRepoIdState] = useState<string | null>(crloopRepoId ?? null);

  const refreshRepos = useCallback(async () => {
    const nextRepos = await getRepos();
    setRepos(nextRepos);
    if (crloopRepoId) {
      setActiveRepoIdState(crloopRepoId);
      return;
    }
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
  }, [crloopRepoId]);

  useEffect(() => {
    void refreshRepos();
  }, [refreshRepos]);

  const setActiveRepoId = useCallback((id: string) => {
    if (crloopRepoId) return; // Don't allow switching in crloop view
    setActiveRepoIdState(id);
    writeStorage(id);
  }, [crloopRepoId]);

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
