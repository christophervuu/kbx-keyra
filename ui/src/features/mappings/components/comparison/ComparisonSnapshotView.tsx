import { GitCompare } from 'lucide-react';

import type { ComparisonSnapshot } from '@/lib/types/domain';

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

function formatMode(mode: ComparisonSnapshot['mode']): string {
  switch (mode) {
    case 'current-vs-saved': return 'Current vs Saved';
    case 'current-vs-dev': return 'Current vs DEV';
    case 'current-vs-qa': return 'Current vs QA';
    case 'dev-vs-qa': return 'DEV vs QA';
    case 'qa-vs-prod': return 'QA vs PROD';
    default: return mode;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparisonSnapshotIndicatorProps {
  /** Number of snapshots linked to this test case */
  count: number;
  /** Whether the snapshot list is currently expanded */
  expanded: boolean;
  /** Toggle the expanded state */
  onToggle: () => void;
}

export interface ComparisonSnapshotViewProps {
  /** Snapshots to display (already filtered for the relevant test case) */
  snapshots: ComparisonSnapshot[];
  /** Called when the user clicks the delete button on a snapshot */
  onDelete: (snapshotId: string) => void;
}

// ---------------------------------------------------------------------------
// Indicator badge
// ---------------------------------------------------------------------------

/**
 * Small icon+count badge shown on test case rows that have linked comparison snapshots.
 * Clicking toggles the snapshot list expansion.
 */
export function ComparisonSnapshotIndicator({
  count,
  expanded,
  onToggle,
}: ComparisonSnapshotIndicatorProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-label={`${count} comparison snapshot${count === 1 ? '' : 's'} — click to ${expanded ? 'collapse' : 'expand'}`}
      aria-expanded={expanded}
      data-testid="comparison-snapshot-indicator"
      className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-blue-400 hover:bg-blue-900/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
    >
      <GitCompare size={10} aria-hidden={true} />
      <span>{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Snapshot list view
// ---------------------------------------------------------------------------

/**
 * Read-only expandable view of comparison snapshots linked to a test case.
 *
 * Shows for each snapshot:
 * - Mode label
 * - Captured timestamp (relative)
 * - Summary: "Outputs match" or "N differences"
 * - Left/right labels
 */
export function ComparisonSnapshotView({ snapshots, onDelete }: ComparisonSnapshotViewProps) {
  if (snapshots.length === 0) {
    return (
      <div
        className="px-3 py-2 text-xs text-zinc-600"
        data-testid="comparison-snapshot-view-empty"
      >
        No snapshots
      </div>
    );
  }

  return (
    <ul
      role="list"
      aria-label="Comparison snapshots"
      className="flex flex-col gap-1 px-3 py-2"
      data-testid="comparison-snapshot-view"
    >
      {snapshots.map((snap) => {
        const diffCount = snap.diffEntries.length;
        const isMatch = diffCount === 0;

        return (
          <li
            key={snap.id}
            className="flex flex-col gap-0.5 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs"
            data-testid={`comparison-snapshot-item-${snap.id}`}
          >
            {/* Header row: mode + timestamp + delete */}
            <div className="flex items-center gap-1.5">
              <GitCompare size={10} className="shrink-0 text-blue-400" aria-hidden={true} />
              <span className="font-medium text-zinc-300">{formatMode(snap.mode)}</span>
              <span className="text-zinc-600">{formatRelativeTime(snap.capturedAt)}</span>
              <span className="flex-1" aria-hidden="true" />
              <button
                type="button"
                onClick={() => { onDelete(snap.id); }}
                aria-label="Delete snapshot"
                data-testid={`delete-snapshot-${snap.id}`}
                className="rounded p-0.5 text-zinc-600 hover:bg-red-900/40 hover:text-red-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
              >
                ×
              </button>
            </div>

            {/* Labels */}
            <div className="text-zinc-500">
              {snap.leftResult.label} vs {snap.rightResult.label}
            </div>

            {/* Summary */}
            {isMatch ? (
              <div className="text-green-400" data-testid={`snapshot-match-${snap.id}`}>
                Outputs match
              </div>
            ) : (
              <div className="text-amber-400" data-testid={`snapshot-diff-count-${snap.id}`}>
                {diffCount} {diffCount === 1 ? 'difference' : 'differences'}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
