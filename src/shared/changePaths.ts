export type ChangePathLike = {
  oldPath: string | null;
  newPath: string | null;
};

export function getChangePath(change: ChangePathLike): string {
  return change.newPath ?? change.oldPath ?? "(unknown)";
}
