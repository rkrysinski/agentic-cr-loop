import type { DiffHunk, DiffLine, FileChange, ReviewComment } from "../shared/types.js";

type DiffViewerProps = {
  change: FileChange;
  comments: ReviewComment[];
  mode: "unified" | "side-by-side";
  selectedAnchorKey: string | null;
  onSelectLine: (payload: { side: "old" | "new"; oldLineNumber: number | null; newLineNumber: number | null; hunkHeader: string }) => void;
};

type SideBySideRow = {
  key: string;
  left: DiffLine | null;
  right: DiffLine | null;
};

export function DiffViewer({ change, comments, mode, selectedAnchorKey, onSelectLine }: DiffViewerProps) {
  if (change.isBinary) {
    return (
      <div className="binary-state">
        <h3>Binary diff</h3>
        <p>This file cannot be reviewed line-by-line in the current version.</p>
      </div>
    );
  }

  if (mode === "unified") {
    return (
      <div className="diff-scroll">
        {change.hunks.map((hunk) => (
          <section key={hunk.header} className="hunk-block">
            <div className="hunk-header">{hunk.header}</div>
            <table className="diff-table unified-table">
              <tbody>
                {hunk.lines.map((line, index) => {
                  const anchorKey = getAnchorKey(hunk.header, line);
                  const commentCount = countComments(comments, hunk.header, line);
                  return (
                    <tr
                      key={`${hunk.header}-${index}`}
                      className={`diff-row diff-row-${line.kind} ${selectedAnchorKey === anchorKey ? "diff-row-selected" : ""}`}
                    >
                      <td className="gutter">{line.oldLineNumber ?? ""}</td>
                      <td className="gutter">{line.newLineNumber ?? ""}</td>
                      <td className="marker-cell">
                        {line.commentableSide ? (
                          <button
                            type="button"
                            className="line-action"
                            onClick={() =>
                              onSelectLine({
                                side: line.commentableSide,
                                oldLineNumber: line.oldLineNumber,
                                newLineNumber: line.newLineNumber,
                                hunkHeader: hunk.header
                              })
                            }
                          >
                            Comment
                          </button>
                        ) : null}
                        {commentCount > 0 ? <span className="comment-badge">{commentCount}</span> : null}
                      </td>
                      <td className="code-cell">{line.text || " "}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="diff-scroll">
      {change.hunks.map((hunk) => (
        <section key={hunk.header} className="hunk-block">
          <div className="hunk-header">{hunk.header}</div>
          <table className="diff-table side-table">
            <tbody>
              {pairHunkLines(hunk).map((row) => (
                <tr key={row.key} className="diff-row">
                  <SideCell
                    line={row.left}
                    hunkHeader={hunk.header}
                    comments={comments}
                    selectedAnchorKey={selectedAnchorKey}
                    onSelectLine={onSelectLine}
                  />
                  <SideCell
                    line={row.right}
                    hunkHeader={hunk.header}
                    comments={comments}
                    selectedAnchorKey={selectedAnchorKey}
                    onSelectLine={onSelectLine}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function SideCell({
  line,
  hunkHeader,
  comments,
  selectedAnchorKey,
  onSelectLine
}: {
  line: DiffLine | null;
  hunkHeader: string;
  comments: ReviewComment[];
  selectedAnchorKey: string | null;
  onSelectLine: DiffViewerProps["onSelectLine"];
}) {
  if (!line) {
    return <td className="side-cell empty-cell" colSpan={4} />;
  }

  const anchorKey = getAnchorKey(hunkHeader, line);
  const commentCount = countComments(comments, hunkHeader, line);

  return (
    <>
      <td className={`gutter ${selectedAnchorKey === anchorKey ? "selected-cell" : ""}`}>{line.oldLineNumber ?? ""}</td>
      <td className={`gutter ${selectedAnchorKey === anchorKey ? "selected-cell" : ""}`}>{line.newLineNumber ?? ""}</td>
      <td className={`marker-cell ${selectedAnchorKey === anchorKey ? "selected-cell" : ""}`}>
        {line.commentableSide ? (
          <button
            type="button"
            className="line-action"
            onClick={() =>
              onSelectLine({
                side: line.commentableSide,
                oldLineNumber: line.oldLineNumber,
                newLineNumber: line.newLineNumber,
                hunkHeader
              })
            }
          >
            Comment
          </button>
        ) : null}
        {commentCount > 0 ? <span className="comment-badge">{commentCount}</span> : null}
      </td>
      <td className={`code-cell line-${line.kind} ${selectedAnchorKey === anchorKey ? "selected-cell" : ""}`}>{line.text || " "}</td>
    </>
  );
}

export function pairHunkLines(hunk: DiffHunk): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let index = 0;

  while (index < hunk.lines.length) {
    const line = hunk.lines[index];

    if (line.kind === "context") {
      rows.push({
        key: `${hunk.header}:${index}`,
        left: line,
        right: line
      });
      index += 1;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];

    while (index < hunk.lines.length && hunk.lines[index].kind !== "context") {
      const current = hunk.lines[index];
      if (current.kind === "removed") {
        removed.push(current);
      } else if (current.kind === "added") {
        added.push(current);
      }
      index += 1;
    }

    const width = Math.max(removed.length, added.length);
    for (let offset = 0; offset < width; offset += 1) {
      rows.push({
        key: `${hunk.header}:${index}:${offset}`,
        left: removed[offset] ?? null,
        right: added[offset] ?? null
      });
    }
  }

  return rows;
}

function countComments(comments: ReviewComment[], hunkHeader: string, line: DiffLine): number {
  return comments.filter(
    (comment) =>
      comment.hunkHeader === hunkHeader &&
      comment.oldLineNumber === line.oldLineNumber &&
      comment.newLineNumber === line.newLineNumber
  ).length;
}

export function getAnchorKey(
  hunkHeader: string,
  line: Pick<DiffLine, "oldLineNumber" | "newLineNumber" | "commentableSide">
): string | null {
  if (!line.commentableSide) {
    return null;
  }

  return `${hunkHeader}:${line.commentableSide}:${line.oldLineNumber ?? "-"}:${line.newLineNumber ?? "-"}`;
}
