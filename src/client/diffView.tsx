import type { KeyboardEvent } from "react";
import type { CommentsResponse } from "../shared/api.js";
import type { DiffHunk, DiffLine, FileChange, ReviewComment } from "../shared/types.js";
import { DiffSyntaxLine } from "./codeSyntax.js";

type CommentAnchor = {
  side: "old" | "new";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  hunkHeader: string;
};

type DiffViewerProps = {
  change: FileChange;
  comments: CommentsResponse;
  mode: "unified" | "side-by-side";
  hideRemovedCode: boolean;
  selectedAnchorKey: string | null;
  draftComment: string;
  editingCommentId: string | null;
  editingBody: string;
  submitting: boolean;
  pendingCommentActionId: string | null;
  onSelectLine: (payload: CommentAnchor) => void;
  onDraftCommentChange: (value: string) => void;
  onSubmitComment: () => void;
  onCancelNewComment: () => void;
  onBeginEdit: (comment: ReviewComment) => void;
  onCancelEdit: () => void;
  onChangeEditingBody: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: (commentId: string) => void;
};

type SideBySideRow = {
  key: string;
  left: DiffLine | null;
  right: DiffLine | null;
};

type InlineThreadProps = {
  line: DiffLine;
  currentComments: ReviewComment[];
  outdatedComments: ReviewComment[];
  isComposerOpen: boolean;
  draftComment: string;
  editingCommentId: string | null;
  editingBody: string;
  submitting: boolean;
  pendingCommentActionId: string | null;
  onDraftCommentChange: (value: string) => void;
  onSubmitComment: () => void;
  onCancelNewComment: () => void;
  onBeginEdit: (comment: ReviewComment) => void;
  onCancelEdit: () => void;
  onChangeEditingBody: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: (commentId: string) => void;
};

export function DiffViewer({
  change,
  comments,
  mode,
  hideRemovedCode,
  selectedAnchorKey,
  draftComment,
  editingCommentId,
  editingBody,
  submitting,
  pendingCommentActionId,
  onSelectLine,
  onDraftCommentChange,
  onSubmitComment,
  onCancelNewComment,
  onBeginEdit,
  onCancelEdit,
  onChangeEditingBody,
  onSaveEdit,
  onDelete
}: DiffViewerProps) {
  const syntaxFilePath = change.newPath ?? change.oldPath ?? "";

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
                {hunk.lines.flatMap((line, index) => {
                  const anchorKey = getAnchorKey(hunk.header, line);
                  const commentableSide = line.commentableSide;
                  const currentComments = getCommentsForLine(comments.current, hunk.header, line);
                  const outdatedComments = getCommentsForLine(comments.outdated, hunk.header, line);
                  const showThread = shouldShowThread(anchorKey, selectedAnchorKey, currentComments, outdatedComments);
                  const hideLineRow = hideRemovedCode && line.kind === "removed";
                  const rowInteractionProps =
                    commentableSide === null
                      ? undefined
                      : getLineInteractionProps(
                          {
                            side: commentableSide,
                            oldLineNumber: line.oldLineNumber,
                            newLineNumber: line.newLineNumber,
                            hunkHeader: hunk.header
                          },
                          onSelectLine
                        );

                  return [
                    hideLineRow ? null : (
                      <tr
                        key={`${hunk.header}-${index}`}
                        className={`diff-row diff-row-${line.kind} ${
                          anchorKey && selectedAnchorKey === anchorKey ? "diff-row-selected" : ""
                        } ${
                          commentableSide ? "diff-row-clickable" : ""
                        }`}
                        {...rowInteractionProps}
                      >
                        <td className={`gutter gutter-old gutter-${line.kind}`}>{line.oldLineNumber ?? ""}</td>
                        <td className={`gutter gutter-new gutter-${line.kind}`}>{line.newLineNumber ?? ""}</td>
                        <td className={`code-cell code-cell-${line.kind}`}>
                          <DiffSyntaxLine filePath={syntaxFilePath} lineText={line.text} />
                        </td>
                      </tr>
                    ),
                    showThread && commentableSide ? (
                      <tr key={`${hunk.header}-${index}-thread`} className="inline-thread-row">
                        <td colSpan={2} className="inline-thread-gutter-spacer" aria-hidden="true" />
                        <td className="inline-thread-cell inline-thread-cell-code">
                          <InlineThread
                            line={line}
                            currentComments={currentComments}
                            outdatedComments={outdatedComments}
                            isComposerOpen={selectedAnchorKey === anchorKey}
                            draftComment={draftComment}
                            editingCommentId={editingCommentId}
                            editingBody={editingBody}
                            submitting={submitting}
                            pendingCommentActionId={pendingCommentActionId}
                            onDraftCommentChange={onDraftCommentChange}
                            onSubmitComment={onSubmitComment}
                            onCancelNewComment={onCancelNewComment}
                            onBeginEdit={onBeginEdit}
                            onCancelEdit={onCancelEdit}
                            onChangeEditingBody={onChangeEditingBody}
                            onSaveEdit={onSaveEdit}
                            onDelete={onDelete}
                          />
                        </td>
                      </tr>
                    ) : null
                  ];
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
              {pairHunkLines(hunk).flatMap((row) => {
                const leftAnchorKey = row.left ? getAnchorKey(hunk.header, row.left) : null;
                const rightAnchorKey = row.right ? getAnchorKey(hunk.header, row.right) : null;
                const leftCurrentComments = row.left ? getCommentsForLine(comments.current, hunk.header, row.left) : [];
                const rightCurrentComments = row.right ? getCommentsForLine(comments.current, hunk.header, row.right) : [];
                const leftOutdatedComments = row.left ? getCommentsForLine(comments.outdated, hunk.header, row.left) : [];
                const rightOutdatedComments = row.right ? getCommentsForLine(comments.outdated, hunk.header, row.right) : [];
                const showLeftThread = shouldShowThread(
                  leftAnchorKey,
                  selectedAnchorKey,
                  leftCurrentComments,
                  leftOutdatedComments
                );
                const showRightThread = shouldShowThread(
                  rightAnchorKey,
                  selectedAnchorKey,
                  rightCurrentComments,
                  rightOutdatedComments
                );

                return [
                  <tr key={row.key} className="diff-row">
                    <SideCell
                      line={row.left}
                      lane="left"
                      filePath={syntaxFilePath}
                      hunkHeader={hunk.header}
                      selectedAnchorKey={selectedAnchorKey}
                      onSelectLine={onSelectLine}
                    />
                    <SideCell
                      line={row.right}
                      lane="right"
                      filePath={syntaxFilePath}
                      hunkHeader={hunk.header}
                      selectedAnchorKey={selectedAnchorKey}
                      onSelectLine={onSelectLine}
                    />
                  </tr>,
                  showLeftThread || showRightThread ? (
                    <tr key={`${row.key}-thread`} className="inline-thread-row side-inline-thread-row">
                      <td
                        className="gutter gutter-old gutter-context side-inline-thread-gutter-spacer lane-left"
                        aria-hidden="true"
                      />
                      <td
                        className="gutter gutter-new gutter-context side-inline-thread-gutter-spacer lane-left"
                        aria-hidden="true"
                      />
                      <td className="code-cell code-cell-context inline-thread-cell side-inline-thread-code-cell lane-left">
                        {showLeftThread && row.left?.commentableSide ? (
                          <InlineThread
                            line={row.left}
                            currentComments={leftCurrentComments}
                            outdatedComments={leftOutdatedComments}
                            isComposerOpen={selectedAnchorKey === leftAnchorKey}
                            draftComment={draftComment}
                            editingCommentId={editingCommentId}
                            editingBody={editingBody}
                            submitting={submitting}
                            pendingCommentActionId={pendingCommentActionId}
                            onDraftCommentChange={onDraftCommentChange}
                            onSubmitComment={onSubmitComment}
                            onCancelNewComment={onCancelNewComment}
                            onBeginEdit={onBeginEdit}
                            onCancelEdit={onCancelEdit}
                            onChangeEditingBody={onChangeEditingBody}
                            onSaveEdit={onSaveEdit}
                            onDelete={onDelete}
                          />
                        ) : null}
                      </td>
                      <td
                        className="gutter gutter-old gutter-context side-inline-thread-gutter-spacer lane-right"
                        aria-hidden="true"
                      />
                      <td
                        className="gutter gutter-new gutter-context side-inline-thread-gutter-spacer lane-right"
                        aria-hidden="true"
                      />
                      <td className="code-cell code-cell-context inline-thread-cell side-inline-thread-code-cell lane-right">
                        {showRightThread && row.right?.commentableSide ? (
                          <InlineThread
                            line={row.right}
                            currentComments={rightCurrentComments}
                            outdatedComments={rightOutdatedComments}
                            isComposerOpen={selectedAnchorKey === rightAnchorKey}
                            draftComment={draftComment}
                            editingCommentId={editingCommentId}
                            editingBody={editingBody}
                            submitting={submitting}
                            pendingCommentActionId={pendingCommentActionId}
                            onDraftCommentChange={onDraftCommentChange}
                            onSubmitComment={onSubmitComment}
                            onCancelNewComment={onCancelNewComment}
                            onBeginEdit={onBeginEdit}
                            onCancelEdit={onCancelEdit}
                            onChangeEditingBody={onChangeEditingBody}
                            onSaveEdit={onSaveEdit}
                            onDelete={onDelete}
                          />
                        ) : null}
                      </td>
                    </tr>
                  ) : null
                ];
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function SideCell({
  line,
  lane,
  filePath,
  hunkHeader,
  selectedAnchorKey,
  onSelectLine
}: {
  line: DiffLine | null;
  lane: "left" | "right";
  filePath: string;
  hunkHeader: string;
  selectedAnchorKey: string | null;
  onSelectLine: DiffViewerProps["onSelectLine"];
}) {
  if (!line) {
    return (
      <>
        <td className={`gutter gutter-old gutter-context lane-${lane} empty-gutter`} aria-hidden="true" />
        <td className={`gutter gutter-new gutter-context lane-${lane} empty-gutter`} aria-hidden="true" />
        <td className={`code-cell code-cell-context side-cell empty-cell lane-${lane}`} aria-hidden="true" />
      </>
    );
  }

  const anchorKey = getAnchorKey(hunkHeader, line);
  const commentableSide = line.commentableSide;
  const cellInteractionProps =
    commentableSide === null
      ? undefined
      : getLineInteractionProps(
          {
            side: commentableSide,
            oldLineNumber: line.oldLineNumber,
            newLineNumber: line.newLineNumber,
            hunkHeader
          },
          onSelectLine
        );
  const cellClassName = `${anchorKey && selectedAnchorKey === anchorKey ? "selected-cell " : ""}${
    commentableSide ? "line-clickable-cell" : ""
  }`;

  return (
    <>
      <td className={`gutter gutter-old gutter-${line.kind} lane-${lane} ${cellClassName}`} {...cellInteractionProps}>
        {line.oldLineNumber ?? ""}
      </td>
      <td className={`gutter gutter-new gutter-${line.kind} lane-${lane} ${cellClassName}`} {...cellInteractionProps}>
        {line.newLineNumber ?? ""}
      </td>
      <td className={`code-cell code-cell-${line.kind} line-${line.kind} lane-${lane} ${cellClassName}`} {...cellInteractionProps}>
        <DiffSyntaxLine filePath={filePath} lineText={line.text} />
      </td>
    </>
  );
}

function InlineThread({
  line,
  currentComments,
  outdatedComments,
  isComposerOpen,
  draftComment,
  editingCommentId,
  editingBody,
  submitting,
  pendingCommentActionId,
  onDraftCommentChange,
  onSubmitComment,
  onCancelNewComment,
  onBeginEdit,
  onCancelEdit,
  onChangeEditingBody,
  onSaveEdit,
  onDelete
}: InlineThreadProps) {
  const lineNumber = line.commentableSide === "old" ? line.oldLineNumber : line.newLineNumber;

  return (
    <div className="inline-thread-panel">
      {currentComments.map((comment) => (
        <InlineCommentCard
          key={comment.commentId}
          comment={comment}
          editingCommentId={editingCommentId}
          editingBody={editingBody}
          pendingCommentActionId={pendingCommentActionId}
          onBeginEdit={onBeginEdit}
          onCancelEdit={onCancelEdit}
          onChangeEditingBody={onChangeEditingBody}
          onSaveEdit={onSaveEdit}
          onDelete={onDelete}
        />
      ))}

      {outdatedComments.map((comment) => (
        <InlineCommentCard
          key={comment.commentId}
          comment={comment}
          outdated
          editingCommentId={editingCommentId}
          editingBody={editingBody}
          pendingCommentActionId={pendingCommentActionId}
          onBeginEdit={onBeginEdit}
          onCancelEdit={onCancelEdit}
          onChangeEditingBody={onChangeEditingBody}
          onSaveEdit={onSaveEdit}
          onDelete={onDelete}
        />
      ))}

      {isComposerOpen ? (
        <section className="comment-card inline-composer">
          <p className="comment-anchor">
            New comment on {line.commentableSide} line {lineNumber}
          </p>
          <textarea
            aria-label={`Add comment for ${line.commentableSide} line ${lineNumber ?? "unknown"}`}
            value={draftComment}
            onChange={(event) => onDraftCommentChange(event.target.value)}
            rows={5}
          />
          <div className="comment-actions">
            <button type="button" disabled={submitting || draftComment.trim().length === 0} onClick={onSubmitComment}>
              Save comment
            </button>
            <button type="button" className="ghost-button" disabled={submitting} onClick={onCancelNewComment}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {currentComments.length === 0 && outdatedComments.length === 0 && !isComposerOpen ? (
        <div className="empty-panel compact-empty-panel">No comments for this line.</div>
      ) : null}
    </div>
  );
}

function InlineCommentCard({
  comment,
  outdated = false,
  editingCommentId,
  editingBody,
  pendingCommentActionId,
  onBeginEdit,
  onCancelEdit,
  onChangeEditingBody,
  onSaveEdit,
  onDelete
}: {
  comment: ReviewComment;
  outdated?: boolean;
  editingCommentId: string | null;
  editingBody: string;
  pendingCommentActionId: string | null;
  onBeginEdit: (comment: ReviewComment) => void;
  onCancelEdit: () => void;
  onChangeEditingBody: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: (commentId: string) => void;
}) {
  const isEditing = editingCommentId === comment.commentId;
  const isPending = pendingCommentActionId === comment.commentId;

  return (
    <article className={`comment-card comment-card-inline ${outdated ? "comment-card-muted" : ""}`}>
      <div className="comment-card-header">
        <p className="comment-anchor">
          {comment.side} line {comment.side === "old" ? comment.oldLineNumber : comment.newLineNumber}
        </p>
        {outdated ? <span className="comment-status">Outdated</span> : null}
      </div>
      {isEditing ? (
        <textarea
          aria-label={`Edit comment ${comment.commentId}`}
          value={editingBody}
          onChange={(event) => onChangeEditingBody(event.target.value)}
          rows={5}
        />
      ) : (
        <p className="comment-body">{comment.body}</p>
      )}
      <p className="comment-date">{new Date(comment.createdAt).toLocaleString()}</p>
      <div className="comment-actions comment-card-actions">
        {isEditing ? (
          <>
            <button type="button" disabled={isPending || editingBody.trim().length === 0} onClick={onSaveEdit}>
              Save
            </button>
            <button type="button" className="ghost-button" disabled={isPending} onClick={onCancelEdit}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ghost-button" disabled={Boolean(pendingCommentActionId)} onClick={() => onBeginEdit(comment)}>
              Edit
            </button>
            <button
              type="button"
              className="ghost-button danger-button"
              disabled={Boolean(pendingCommentActionId)}
              onClick={() => onDelete(comment.commentId)}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </article>
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

function getCommentsForLine(comments: ReviewComment[], hunkHeader: string, line: DiffLine): ReviewComment[] {
  void hunkHeader;
  return comments.filter(
    (comment) =>
      comment.oldLineNumber === line.oldLineNumber &&
      comment.newLineNumber === line.newLineNumber
  );
}

function shouldShowThread(
  anchorKey: string | null,
  selectedAnchorKey: string | null,
  currentComments: ReviewComment[],
  outdatedComments: ReviewComment[]
): boolean {
  return Boolean(anchorKey) && (selectedAnchorKey === anchorKey || currentComments.length > 0 || outdatedComments.length > 0);
}

function getLineInteractionProps(anchor: CommentAnchor, onSelectLine: DiffViewerProps["onSelectLine"]) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: () => onSelectLine(anchor),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectLine(anchor);
      }
    }
  };
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
