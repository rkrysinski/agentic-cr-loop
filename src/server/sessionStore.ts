import fs from "node:fs/promises";
import path from "node:path";
import { REVIEW_STORAGE_DIRECTORY } from "./commentStore.js";

export type SessionStatus = "agent-review" | "human-review" | "agent-addressing" | "complete";

export type SessionState = {
  status: SessionStatus;
  iteration: number;
  headId: string;
  startedAt: string;
  updatedAt: string;
};

const SESSION_FILE = "session.json";

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  "agent-review": ["human-review"],
  "human-review": ["agent-addressing", "complete"],
  "agent-addressing": ["agent-review"],
  "complete": [],
};

function defaultSession(): SessionState {
  const now = new Date().toISOString();
  return {
    status: "agent-review",
    iteration: 1,
    headId: "",
    startedAt: now,
    updatedAt: now,
  };
}

function sessionFilePath(repoPath: string): string {
  return path.join(repoPath, REVIEW_STORAGE_DIRECTORY, SESSION_FILE);
}

export async function readSession(repoPath: string): Promise<SessionState> {
  try {
    const content = await fs.readFile(sessionFilePath(repoPath), "utf8");
    return JSON.parse(content) as SessionState;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultSession();
    }
    throw error;
  }
}

export async function writeSession(repoPath: string, state: SessionState): Promise<void> {
  const filePath = sessionFilePath(repoPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function transitionSession(repoPath: string, targetStatus: SessionStatus): Promise<SessionState> {
  const current = await readSession(repoPath);
  const allowed = VALID_TRANSITIONS[current.status];

  if (!allowed.includes(targetStatus)) {
    throw new Error(`Invalid transition: ${current.status} → ${targetStatus}`);
  }

  const updated: SessionState = {
    ...current,
    status: targetStatus,
    updatedAt: new Date().toISOString(),
    iteration: targetStatus === "agent-review" ? current.iteration + 1 : current.iteration,
  };

  await writeSession(repoPath, updated);
  return updated;
}
