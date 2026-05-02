export type DiffChangeType = 'added' | 'removed' | 'changed';

export interface DiffEntry {
  readonly path: string;
  readonly type: DiffChangeType;
  readonly actual?: unknown;
  readonly expected?: unknown;
}

export interface DiffResult {
  readonly entries: readonly DiffEntry[];
  readonly isEqual: boolean;
}
