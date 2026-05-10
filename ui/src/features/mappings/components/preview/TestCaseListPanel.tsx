import { useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

import type { ComparisonSnapshot, TestCase, TestRunResult } from '@/lib/types/domain';
import {
  ComparisonSnapshotIndicator,
  ComparisonSnapshotView,
} from '../comparison/ComparisonSnapshotView';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BatchSummary {
  passed: number;
  failed: number;
}

export interface BatchState {
  isRunning: boolean;
  progress: { current: number; total: number } | null;
  summary: BatchSummary | null;
}

export interface TestCaseListPanelProps {
  /** Saved test cases in insertion order. */
  testCases: readonly TestCase[];
  /**
   * ID of the currently selected test case, or `null` when the Scratchpad is
   * selected.
   */
  selectedId: string | null;
  /** Run results keyed by testCaseId. */
  runResults: Readonly<Record<string, TestRunResult>>;
  /** Called when the user selects a saved test case row. */
  onSelect: (testCase: TestCase) => void;
  /** Called when the user selects the Scratchpad pseudo-entry. */
  onSelectScratchpad: () => void;
  /** Called when the user confirms a rename. */
  onRename: (id: string, newName: string) => void;
  /** Called when the user clicks Duplicate on a row. */
  onDuplicate: (id: string) => void;
  /** Called when the user confirms deletion of a row. */
  onDelete: (id: string) => void;
  /**
   * Called when the user clicks "Add New". Parent is responsible for calling
   * `saveTestCase` with an auto-generated name and selecting the new case.
   */
  onAddNew: () => void;
  /**
   * Called when the user confirms "Save As Test Case" with the entered name.
   * Parent is responsible for calling `saveTestCase` with the current source
   * data and the provided name.
   */
  onSaveCurrentInput: (name: string) => void;
  /**
   * Current scratchpad source data. "Save As Test Case" is disabled when this
   * is null or empty.
   */
  sourceDataRaw: string | null;
  /** Called when the user clicks "Run All". */
  onRunAll: () => void;
  /** Called when the user clicks "Rerun Failed". */
  onRerunFailed: () => void;
  /** Called when the user clicks "Cancel" during batch execution. */
  onCancel: () => void;
  /** Batch execution state for progress and summary display. */
  batchState: BatchState;
  /**
   * Optional slot rendered below the batch toolbar row.
   */
  toolbarSlot?: React.ReactNode;
  /**
   * Map of testCaseId → comparison snapshots for that test case.
   * Used to show the comparison indicator badge on rows with linked snapshots.
   */
  snapshotsByTestCase?: Readonly<Record<string, ComparisonSnapshot[]>>;
  /**
   * Called when the user deletes a comparison snapshot from the row view.
   */
  onDeleteSnapshot?: (snapshotId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ result }: { result: TestRunResult | undefined }) {
  if (!result) {
    return (
      <span
        aria-label="Not run"
        title="Not run"
        className="inline-block h-2 w-2 rounded-full bg-zinc-600"
      />
    );
  }
  if (result.status === 'pass') {
    return (
      <CheckCircle2
        size={12}
        className="shrink-0 text-green-400"
        aria-label="Pass"
        title="Pass"
      />
    );
  }
  if (result.status === 'error') {
    return (
      <AlertCircle
        size={12}
        className="shrink-0 text-amber-400"
        aria-label="Error"
        title="Error"
      />
    );
  }
  return (
    <XCircle
      size={12}
      className="shrink-0 text-red-400"
      aria-label="Fail"
      title="Fail"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * TestCaseListPanel — vertical list of saved test cases with selection,
 * pass/fail status badges, inline rename, duplicate, and delete actions.
 * Includes a permanent Scratchpad pseudo-entry at the top.
 *
 * Selection state and CRUD operations are owned by the parent via callbacks.
 */
export function TestCaseListPanel({
  testCases,
  selectedId,
  runResults,
  onSelect,
  onSelectScratchpad,
  onRename,
  onDuplicate,
  onDelete,
  onAddNew,
  onSaveCurrentInput,
  sourceDataRaw,
  onRunAll,
  onRerunFailed,
  onCancel,
  batchState,
  toolbarSlot,
  snapshotsByTestCase = {},
  onDeleteSnapshot,
}: TestCaseListPanelProps) {
  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Save As inline flow state
  const [isSavingAs, setIsSavingAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  // Expanded snapshot rows
  const [expandedSnapshotIds, setExpandedSnapshotIds] = useState<Set<string>>(new Set());

  function toggleSnapshotExpanded(id: string) {
    setExpandedSnapshotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const isScratchpadSelected = selectedId === null;
  const canSaveAs = isScratchpadSelected && sourceDataRaw !== null && sourceDataRaw.trim() !== '';
  const hasFailedCases = Object.values(runResults).some((r) => r.status === 'fail');
  const canRunAll = testCases.length > 0 && !batchState.isRunning;
  const canRerunFailed = hasFailedCases && !batchState.isRunning;

  function startRename(tc: TestCase) {
    setRenamingId(tc.id);
    setRenameValue(tc.name);
  }

  function commitRename() {
    if (renamingId === null) return;
    const trimmed = renameValue.trim();
    if (trimmed !== '') {
      onRename(renamingId, trimmed);
    }
    setRenamingId(null);
    setRenameValue('');
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  function handleDeleteClick(tc: TestCase) {
    if (runResults[tc.id]) {
      setConfirmDeleteId(tc.id);
    } else {
      onDelete(tc.id);
    }
  }

  function confirmDelete() {
    if (confirmDeleteId !== null) {
      onDelete(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  function handleSaveAsConfirm() {
    const trimmed = saveAsName.trim();
    if (trimmed === '') return;
    onSaveCurrentInput(trimmed);
    setIsSavingAs(false);
    setSaveAsName('');
  }

  function handleSaveAsCancel() {
    setIsSavingAs(false);
    setSaveAsName('');
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid="test-case-list-panel"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Primary toolbar: Add New + Save As Test Case                         */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="shrink-0 border-b border-zinc-700 px-3 py-1.5"
        data-testid="primary-toolbar"
      >
        {isSavingAs ? (
          <div className="flex items-center gap-1.5" data-testid="save-as-form">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => { setSaveAsName(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveAsConfirm();
                if (e.key === 'Escape') handleSaveAsCancel();
              }}
              placeholder="Test case name…"
              aria-label="Test case name"
              data-testid="save-as-name-input"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveAsConfirm}
              disabled={saveAsName.trim() === ''}
              aria-disabled={saveAsName.trim() === ''}
              data-testid="save-as-confirm-button"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                saveAsName.trim() !== ''
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-zinc-700 text-zinc-500',
              ].join(' ')}
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleSaveAsCancel}
              aria-label="Cancel save"
              data-testid="save-as-cancel-button"
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAddNew}
              data-testid="add-new-button"
              className="rounded px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              + Add New
            </button>
            <button
              type="button"
              onClick={() => { setIsSavingAs(true); setSaveAsName(''); }}
              disabled={!canSaveAs}
              aria-disabled={!canSaveAs}
              data-testid="save-as-button"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                canSaveAs
                  ? 'text-zinc-300 hover:bg-zinc-700'
                  : 'cursor-not-allowed text-zinc-600',
              ].join(' ')}
              title={!canSaveAs ? 'Enter source data in Scratchpad before saving' : undefined}
            >
              Save As Test Case
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Batch toolbar: Run All / Rerun Failed / progress / summary           */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="shrink-0 border-b border-zinc-700 px-3 py-1.5"
        data-testid="batch-toolbar"
      >
        {batchState.isRunning && batchState.progress !== null ? (
          /* Running: progress + cancel */
          <div className="flex items-center gap-2" data-testid="batch-progress">
            <span className="min-w-0 flex-1 text-xs text-zinc-400">
              Running {batchState.progress.current}/{batchState.progress.total}…
            </span>
            <button
              type="button"
              onClick={onCancel}
              data-testid="cancel-batch-button"
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        ) : batchState.summary !== null ? (
          /* Summary after completion */
          <div className="flex items-center gap-2" data-testid="batch-summary">
            <span className="min-w-0 flex-1 text-xs">
              <span className="text-green-400">{batchState.summary.passed} passed</span>
              {', '}
              <span className="text-red-400">{batchState.summary.failed} failed</span>
            </span>
          </div>
        ) : (
          /* Idle: Run All + Rerun Failed */
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRunAll}
              disabled={!canRunAll}
              aria-disabled={!canRunAll}
              data-testid="run-all-button"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                canRunAll
                  ? 'text-zinc-300 hover:bg-zinc-700'
                  : 'cursor-not-allowed text-zinc-600',
              ].join(' ')}
            >
              ▶ Run All
            </button>
            <button
              type="button"
              onClick={onRerunFailed}
              disabled={!canRerunFailed}
              aria-disabled={!canRerunFailed}
              data-testid="rerun-failed-button"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                canRerunFailed
                  ? 'text-zinc-300 hover:bg-zinc-700'
                  : 'cursor-not-allowed text-zinc-600',
              ].join(' ')}
            >
              ↺ Rerun Failed
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Optional extra toolbar slot                                          */}
      {/* ------------------------------------------------------------------ */}
      {toolbarSlot !== undefined && (
        <div className="shrink-0 border-b border-zinc-700 px-3 py-1.5">
          {toolbarSlot}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* List                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <ul
        role="listbox"
        aria-label="Test cases"
        className="flex-1 overflow-y-auto"
        data-testid="test-case-list"
      >
        {/* Scratchpad pseudo-entry */}
        <li
          role="option"
          aria-selected={isScratchpadSelected}
          data-testid="scratchpad-row"
          onClick={onSelectScratchpad}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectScratchpad();
            }
          }}
          tabIndex={0}
          className={[
            'flex cursor-pointer items-center gap-2 px-3 py-2 text-xs transition-colors',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
            isScratchpadSelected
              ? 'bg-blue-900/40 text-zinc-200'
              : 'text-zinc-400 hover:bg-zinc-800',
          ].join(' ')}
        >
          <span className="min-w-0 flex-1 truncate italic">Scratchpad</span>
        </li>

        {/* Saved test cases */}
        {testCases.map((tc) => {
          const isSelected = selectedId === tc.id;
          const isRenaming = renamingId === tc.id;
          const isConfirmingDelete = confirmDeleteId === tc.id;
          const result = runResults[tc.id];

          return (
            <li
              key={tc.id}
              role="option"
              aria-selected={isSelected}
              data-testid={`test-case-row-${tc.id}`}
              className={[
                'group flex flex-col gap-0.5 px-3 py-2 text-xs transition-colors',
                'focus-within:outline-none',
                isSelected
                  ? 'bg-blue-900/40 text-zinc-200'
                  : 'text-zinc-300 hover:bg-zinc-800',
              ].join(' ')}
            >
              {/* Delete confirmation overlay */}
              {isConfirmingDelete ? (
                <div
                  className="flex items-center gap-2"
                  data-testid={`delete-confirm-${tc.id}`}
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-400">
                    Delete &ldquo;{tc.name}&rdquo;? Run results will be lost.
                  </span>
                  <button
                    type="button"
                    onClick={confirmDelete}
                    data-testid={`delete-confirm-yes-${tc.id}`}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-400 hover:bg-red-900/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={cancelDelete}
                    data-testid={`delete-confirm-cancel-${tc.id}`}
                    className="rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {/* Main row */}
                  <div className="flex items-center gap-2">
                    <StatusBadge result={result} />

                    {/* Name — double-click to rename */}
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => { setRenameValue(e.target.value); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={cancelRename}
                        aria-label="Rename test case"
                        data-testid={`rename-input-${tc.id}`}
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => { onSelect(tc); }}
                        onDoubleClick={() => { startRename(tc); }}
                        data-testid={`test-case-name-${tc.id}`}
                        className="min-w-0 flex-1 truncate text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                      >
                        {tc.name}
                      </button>
                    )}

                    {/* Action buttons — visible on hover / focus-within */}
                    {!isRenaming && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {/* Comparison snapshot indicator */}
                        {(snapshotsByTestCase[tc.id]?.length ?? 0) > 0 && (
                          <ComparisonSnapshotIndicator
                            count={snapshotsByTestCase[tc.id].length}
                            expanded={expandedSnapshotIds.has(tc.id)}
                            onToggle={() => { toggleSnapshotExpanded(tc.id); }}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => { onDuplicate(tc.id); }}
                          aria-label={`Duplicate ${tc.name}`}
                          data-testid={`duplicate-button-${tc.id}`}
                          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                        >
                          {/* Copy icon */}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="h-3 w-3"
                            aria-hidden="true"
                          >
                            <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h4.5A1.5 1.5 0 0 1 13 3.5V9a1.5 1.5 0 0 1-1.5 1.5H11v1.5A1.5 1.5 0 0 1 9.5 13.5H5A1.5 1.5 0 0 1 3.5 12V6.5A1.5 1.5 0 0 1 5 5h.5V3.5ZM7 3a.5.5 0 0 0-.5.5V5H9.5A1.5 1.5 0 0 1 11 6.5V9h.5a.5.5 0 0 0 .5-.5V3.5A.5.5 0 0 0 11.5 3H7ZM5 6a.5.5 0 0 0-.5.5V12a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5V6.5A.5.5 0 0 0 9.5 6H5Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => { handleDeleteClick(tc); }}
                          aria-label={`Delete ${tc.name}`}
                          data-testid={`delete-button-${tc.id}`}
                          className="rounded p-0.5 text-zinc-500 hover:bg-red-900/40 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                        >
                          {/* Trash icon */}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="h-3 w-3"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Last-run timestamp */}
                  {result && (
                    <div className="pl-4 text-zinc-600">
                      {formatRelativeTime(result.executedAt)}
                    </div>
                  )}

                  {/* Comparison snapshot view — expanded when indicator is clicked */}
                  {expandedSnapshotIds.has(tc.id) && (
                    <ComparisonSnapshotView
                      snapshots={snapshotsByTestCase[tc.id] ?? []}
                      onDelete={(snapshotId) => { onDeleteSnapshot?.(snapshotId); }}
                    />
                  )}
                </>
              )}
            </li>
          );
        })}

        {/* Empty state */}
        {testCases.length === 0 && (
          <li
            className="px-3 py-4 text-center text-xs text-zinc-600"
            data-testid="empty-state"
          >
            No test cases yet. Click Add New to create one.
          </li>
        )}
      </ul>
    </div>
  );
}
