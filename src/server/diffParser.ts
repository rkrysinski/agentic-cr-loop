import type { DiffHunk, DiffLine, FileChange } from "../shared/types.js";
import { sha256 } from "./hash.js";

type ParseState = {
  current: ParsedFile | null;
  currentHunk: MutableHunk | null;
  files: ParsedFile[];
};

type ParsedFile = Omit<FileChange, "diffFingerprint"> & {
  rawFingerprintLines: string[];
};

type MutableHunk = {
  header: string;
  lines: DiffLine[];
  oldLineNumber: number;
  newLineNumber: number;
};

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseTrackedDiff(patch: string): FileChange[] {
  const state: ParseState = {
    current: null,
    currentHunk: null,
    files: []
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      finalizeHunk(state);
      finalizeFile(state);
      state.current = createFileFromHeader(line);
      continue;
    }

    if (!state.current) {
      continue;
    }

    if (line.startsWith("old mode ") || line.startsWith("new mode ") || line.startsWith("similarity index ")) {
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("rename from ")) {
      state.current.changeType = "renamed";
      state.current.oldPath = line.slice("rename from ".length);
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("rename to ")) {
      state.current.changeType = "renamed";
      state.current.newPath = line.slice("rename to ".length);
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("new file mode ")) {
      state.current.changeType = "added";
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      state.current.changeType = "deleted";
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      state.current.isBinary = true;
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("index ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      updatePathsFromPatchLine(state.current, line);
      appendFingerprintLine(state.current, line);
      continue;
    }

    if (line.startsWith("@@ ")) {
      finalizeHunk(state);
      state.currentHunk = createHunk(line);
      continue;
    }

    if (state.currentHunk && isDiffBodyLine(line)) {
      const diffLine = parseDiffLine(line, state.currentHunk);
      state.currentHunk.lines.push(diffLine);
      if (diffLine.kind !== "context") {
        appendFingerprintLine(state.current, normalizeDiffLine(diffLine));
      }
      continue;
    }

    if (line === "\\ No newline at end of file") {
      appendFingerprintLine(state.current, line);
    }
  }

  finalizeHunk(state);
  finalizeFile(state);

  return state.files
    .map(({ rawFingerprintLines, ...file }) => ({
      ...file,
      diffFingerprint: sha256(rawFingerprintLines.join("\n"))
    }))
    .sort((left, right) => displayPath(left).localeCompare(displayPath(right)));
}

export function createUntrackedChange(filePath: string, content: string): FileChange {
  const lines = content.split(/\r?\n/);
  const visibleLines = lines.at(-1) === "" ? lines.slice(0, -1) : lines;
  const hunkHeader = `@@ -0,0 +1,${Math.max(visibleLines.length, 0)} @@`;
  const diffLines = visibleLines.map<DiffLine>((text, index) => ({
    kind: "added",
    oldLineNumber: null,
    newLineNumber: index + 1,
    text,
    commentableSide: "new"
  }));
  const fingerprintSource = [`untracked:${filePath}`, hunkHeader, ...diffLines.map(normalizeDiffLine)].join("\n");
  const changeId = sha256(`untracked:${filePath}`);

  return {
    changeId,
    changeType: "untracked",
    oldPath: null,
    newPath: filePath,
    isBinary: false,
    diffFingerprint: sha256(fingerprintSource),
    hunks: [
      {
        header: hunkHeader,
        lines: diffLines
      }
    ]
  };
}

export function createBinaryUntrackedChange(filePath: string, content: Buffer): FileChange {
  return {
    changeId: sha256(`untracked:${filePath}`),
    changeType: "untracked",
    oldPath: null,
    newPath: filePath,
    isBinary: true,
    diffFingerprint: sha256(`untracked-binary:${filePath}:${content.toString("base64")}`),
    hunks: []
  };
}

function createFileFromHeader(line: string): ParsedFile {
  const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
  const oldPath = match?.[1] ?? null;
  const newPath = match?.[2] ?? null;

  return {
    changeId: sha256(`tracked:${oldPath ?? ""}:${newPath ?? ""}`),
    changeType: inferInitialChangeType(oldPath, newPath),
    oldPath,
    newPath,
    isBinary: false,
    hunks: [],
    rawFingerprintLines: [line]
  };
}

function inferInitialChangeType(oldPath: string | null, newPath: string | null): FileChange["changeType"] {
  if (!oldPath && newPath) {
    return "added";
  }

  if (oldPath && !newPath) {
    return "deleted";
  }

  return "modified";
}

function finalizeHunk(state: ParseState): void {
  if (!state.current || !state.currentHunk || state.current.isBinary) {
    state.currentHunk = null;
    return;
  }

  state.current.hunks.push({
    header: state.currentHunk.header,
    lines: state.currentHunk.lines
  });
  state.currentHunk = null;
}

function finalizeFile(state: ParseState): void {
  if (!state.current) {
    return;
  }

  state.current.changeId = sha256(
    `${state.current.changeType}:${state.current.oldPath ?? ""}:${state.current.newPath ?? ""}`
  );
  state.files.push(state.current);
  state.current = null;
}

function appendFingerprintLine(file: ParsedFile, line: string): void {
  file.rawFingerprintLines.push(line);
}

function updatePathsFromPatchLine(file: ParsedFile, line: string): void {
  if (!line.startsWith("--- ") && !line.startsWith("+++ ")) {
    return;
  }

  const rawPath = line.slice(4).trim();
  const parsed = rawPath === "/dev/null" ? null : stripPatchPrefix(rawPath);

  if (line.startsWith("--- ")) {
    file.oldPath = parsed;
  } else {
    file.newPath = parsed;
  }
}

function stripPatchPrefix(value: string): string {
  return value.replace(/^[ab]\//, "");
}

function createHunk(headerLine: string): MutableHunk {
  const match = HUNK_RE.exec(headerLine);

  if (!match) {
    throw new Error(`Invalid hunk header: ${headerLine}`);
  }

  return {
    header: `@@ -${match[1]}${match[2] ? `,${match[2]}` : ""} +${match[3]}${match[4] ? `,${match[4]}` : ""} @@${match[5]}`,
    lines: [],
    oldLineNumber: Number(match[1]),
    newLineNumber: Number(match[3])
  };
}

function isDiffBodyLine(line: string): boolean {
  return line.startsWith(" ") || line.startsWith("+") || line.startsWith("-");
}

function parseDiffLine(line: string, hunk: MutableHunk): DiffLine {
  const text = line.slice(1);

  if (line.startsWith(" ")) {
    const diffLine: DiffLine = {
      kind: "context",
      oldLineNumber: hunk.oldLineNumber,
      newLineNumber: hunk.newLineNumber,
      text,
      commentableSide: null
    };
    hunk.oldLineNumber += 1;
    hunk.newLineNumber += 1;
    return diffLine;
  }

  if (line.startsWith("+")) {
    const diffLine: DiffLine = {
      kind: "added",
      oldLineNumber: null,
      newLineNumber: hunk.newLineNumber,
      text,
      commentableSide: "new"
    };
    hunk.newLineNumber += 1;
    return diffLine;
  }

  const diffLine: DiffLine = {
    kind: "removed",
    oldLineNumber: hunk.oldLineNumber,
    newLineNumber: null,
    text,
    commentableSide: "old"
  };
  hunk.oldLineNumber += 1;
  return diffLine;
}

function normalizeDiffLine(line: DiffLine): string {
  return [line.kind, line.oldLineNumber ?? "-", line.newLineNumber ?? "-", line.text].join("|");
}

function displayPath(change: Pick<FileChange, "newPath" | "oldPath">): string {
  return change.newPath ?? change.oldPath ?? "(unknown)";
}
