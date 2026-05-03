import { useState } from 'react';

import type { VersionDiff, RuleDiff, ConfigDiff } from '../lib';
import { ConfirmDialog } from './ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VersionDiffViewProps {
  diff: VersionDiff;
  selectedVersion: number;
  currentVersion: number;
  hasUnsavedChanges: boolean;
  onRestore: (version: number) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RuleDiffEntry({ entry }: { entry: RuleDiff }) {
  const isAdded = entry.type === 'added';
  const isModified = entry.type === 'modified';
  const isRemoved = entry.type === 'removed';

  const indicator = isAdded ? '+' : isModified ? '~' : '-';
  const indicatorClass = isAdded
    ? 'text-green-400'
    : isModified
      ? 'text-yellow-400'
      : 'text-red-400';
  const rowClass = isAdded
    ? 'border-green-800/40 bg-green-950/30'
    : isModified
      ? 'border-yellow-800/40 bg-yellow-950/30'
      : 'border-red-800/40 bg-red-950/30';

  return (
    <div className={`rounded border px-3 py-2 ${rowClass}`}>
      <div className="flex items-start gap-2">
        <span className={`shrink-0 font-mono text-xs font-bold ${indicatorClass}`} aria-hidden="true">
          {indicator}
        </span>
        <span className="font-mono text-xs text-slate-200 break-all">{entry.targetPath}</span>
      </div>

      {isAdded && entry.newExpression && (
        <div className="mt-1 pl-4">
          <code className="block truncate font-mono text-xs text-green-300" title={entry.newExpression}>
            {entry.newExpression}
          </code>
        </div>
      )}

      {isModified && (
        <div className="mt-1 pl-4 flex flex-col gap-0.5">
          {entry.oldExpression !== undefined && (
            <code
              className="block truncate font-mono text-xs text-slate-500 line-through"
              title={entry.oldExpression}
            >
              {entry.oldExpression}
            </code>
          )}
          {entry.newExpression !== undefined && (
            <code className="block truncate font-mono text-xs text-yellow-300" title={entry.newExpression}>
              {entry.newExpression}
            </code>
          )}
        </div>
      )}

      {isRemoved && entry.oldExpression && (
        <div className="mt-1 pl-4">
          <code
            className="block truncate font-mono text-xs text-red-300 line-through"
            title={entry.oldExpression}
          >
            {entry.oldExpression}
          </code>
        </div>
      )}
    </div>
  );
}

function ConfigDiffEntry({ entry }: { entry: ConfigDiff }) {
  const oldStr = entry.oldValue === undefined ? '(none)' : JSON.stringify(entry.oldValue);
  const newStr = entry.newValue === undefined ? '(none)' : JSON.stringify(entry.newValue);

  return (
    <div className="rounded border border-slate-700 bg-slate-800/40 px-3 py-2">
      <div className="text-xs font-mono text-slate-300">{entry.field}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <code className="text-slate-500 line-through truncate" title={oldStr}>{oldStr}</code>
        <span className="shrink-0 text-slate-500" aria-hidden="true">→</span>
        <code className="text-slate-200 truncate" title={newStr}>{newStr}</code>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VersionDiffView
// ---------------------------------------------------------------------------

export function VersionDiffView({
  diff,
  selectedVersion,
  currentVersion,
  hasUnsavedChanges,
  onRestore,
  onBack,
}: VersionDiffViewProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { added, modified, removed } = diff.summary;
  const hasNoChanges = added === 0 && modified === 0 && removed === 0 && diff.configDiffs.length === 0;

  const addedRules = diff.ruleDiffs.filter((r) => r.type === 'added');
  const modifiedRules = diff.ruleDiffs.filter((r) => r.type === 'modified');
  const removedRules = diff.ruleDiffs.filter((r) => r.type === 'removed');

  const confirmMessage = hasUnsavedChanges
    ? `This will restore version v${selectedVersion} as a new version (v${currentVersion + 1}). Your current unsaved changes will be lost.`
    : `This will restore version v${selectedVersion} as a new version (v${currentVersion + 1}).`;

  function handleRestoreClick() {
    setConfirmOpen(true);
  }

  function handleConfirm() {
    setConfirmOpen(false);
    onRestore(selectedVersion);
  }

  function handleCancel() {
    setConfirmOpen(false);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-700 px-1 pb-3 pt-1">
        <button
          type="button"
          aria-label="Back to version list"
          onClick={onBack}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs text-slate-300">
          Changes from{' '}
          <span className="font-mono font-semibold text-slate-100">v{selectedVersion}</span>
          {' '}to current
        </span>
        <button
          type="button"
          onClick={handleRestoreClick}
          className="ml-auto rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          Restore v{selectedVersion}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 py-3">
        {/* Summary */}
        {hasNoChanges ? (
          <p className="text-center text-xs text-slate-400">No changes between these versions</p>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            {added > 0 && (
              <span className="font-medium text-green-400">+{added} added</span>
            )}
            {modified > 0 && (
              <span className="font-medium text-yellow-400">~{modified} modified</span>
            )}
            {removed > 0 && (
              <span className="font-medium text-red-400">-{removed} removed</span>
            )}
          </div>
        )}

        {/* Added rules */}
        {addedRules.length > 0 && (
          <section aria-label="Added rules">
            <h3 className="mb-1.5 text-xs font-semibold text-green-400">Added</h3>
            <div className="flex flex-col gap-1">
              {addedRules.map((r, i) => (
                <RuleDiffEntry key={`added-${r.targetPath}-${i}`} entry={r} />
              ))}
            </div>
          </section>
        )}

        {/* Modified rules */}
        {modifiedRules.length > 0 && (
          <section aria-label="Modified rules">
            <h3 className="mb-1.5 text-xs font-semibold text-yellow-400">Modified</h3>
            <div className="flex flex-col gap-1">
              {modifiedRules.map((r, i) => (
                <RuleDiffEntry key={`modified-${r.targetPath}-${i}`} entry={r} />
              ))}
            </div>
          </section>
        )}

        {/* Removed rules */}
        {removedRules.length > 0 && (
          <section aria-label="Removed rules">
            <h3 className="mb-1.5 text-xs font-semibold text-red-400">Removed</h3>
            <div className="flex flex-col gap-1">
              {removedRules.map((r, i) => (
                <RuleDiffEntry key={`removed-${r.targetPath}-${i}`} entry={r} />
              ))}
            </div>
          </section>
        )}

        {/* Config changes */}
        {diff.configDiffs.length > 0 && (
          <section aria-label="Configuration changes">
            <h3 className="mb-1.5 text-xs font-semibold text-slate-300">Configuration changes</h3>
            <div className="flex flex-col gap-1">
              {diff.configDiffs.map((c, i) => (
                <ConfigDiffEntry key={`config-${c.field}-${i}`} entry={c} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Restore confirmation modal */}
      <ConfirmDialog
        open={confirmOpen}
        title="Restore version"
        message={confirmMessage}
        confirmLabel="Restore"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
