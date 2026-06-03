import { ArrowLeft, CheckCheck, RefreshCw, XCircle } from 'lucide-react';

import { formatRelativeTime } from './VersionHistoryDrawer';
import type { BatchAcceptResult } from '../hooks';
import type { AutoMapWorkspaceSummary } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceHeaderProps {
  /** The section path being reviewed, e.g. "Order" */
  sectionPath: string | null;
  /** Workspace summary counts */
  summary: AutoMapWorkspaceSummary;
  /** ISO timestamp of last refresh (null if never refreshed) */
  lastRefreshedAt: string | null;
  /** Called when "Back to Editor" is clicked */
  onExitWorkspace: () => void;
  onAcceptAllValid?: () => void;
  onRefreshUnmapped?: () => void;
  onRefreshAll?: () => void;
  onToggleExpandAll?: () => void;
  batchAcceptResult?: BatchAcceptResult | null;
  onClearBatchAcceptResult?: () => void;
  allExpanded?: boolean;
  isRefreshing?: boolean;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CountBadgeProps {
  label: string;
  count: number;
  colorClass: string;
  testId?: string;
}

function CountBadge({ label, count, colorClass, testId }: CountBadgeProps) {
  return (
    <span
      data-testid={testId}
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        colorClass,
      ].join(' ')}
    >
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{count}</span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * WorkspaceHeader — sticky header for the Auto-Map Review Workspace.
 *
 * Displays:
 * - Section path ("Auto-Map: {sectionPath}")
 * - Summary count badges (valid, invalid, replacing, accepted, dismissed, stale)
 * - Last refreshed timestamp (relative)
 * - "Back to Editor" button
 */
export function WorkspaceHeader({
  sectionPath,
  summary,
  lastRefreshedAt,
  onExitWorkspace,
  onAcceptAllValid,
  onRefreshUnmapped,
  onRefreshAll,
  onToggleExpandAll,
  batchAcceptResult = null,
  onClearBatchAcceptResult,
  allExpanded = false,
  isRefreshing = false,
  className = '',
}: WorkspaceHeaderProps) {
  const hasValidPending = summary.validCount > 0 && summary.pending > 0;
  const hasUnmapped = summary.pending > 0;

  return (
    <div
      data-testid="workspace-header"
      className={[
        'shrink-0 border-b border-slate-800 bg-slate-950 px-3 py-2',
        className,
      ].join(' ')}
    >
      {/* Top row: title + back button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
            Auto-Map
          </span>
          <h2
            className="min-w-0 truncate text-xs font-semibold text-slate-200"
            data-testid="workspace-header-section-path"
            title={sectionPath ?? 'All fields'}
          >
            {sectionPath ?? 'All fields'}
          </h2>
        </div>

        <button
          type="button"
          data-testid="workspace-back-to-editor"
          onClick={onExitWorkspace}
          className={[
            'flex shrink-0 items-center gap-1.5 rounded border border-slate-700 bg-slate-800',
            'px-2 py-1 text-xs font-medium text-slate-300 transition-colors',
            'hover:bg-slate-700 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <ArrowLeft size={11} aria-hidden="true" />
          Back to Editor
        </button>
      </div>

      {/* Bottom row: count badges + last refreshed */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Suggestion quality badges */}
          {summary.validCount > 0 && (
            <CountBadge
              label="valid"
              count={summary.validCount}
              colorClass="bg-green-900/40 text-green-300"
              testId="badge-valid"
            />
          )}
          {summary.invalidCount > 0 && (
            <CountBadge
              label="invalid"
              count={summary.invalidCount}
              colorClass="bg-red-900/40 text-red-300"
              testId="badge-invalid"
            />
          )}
          {summary.total - summary.pending > 0 && summary.total > 0 && (
            <CountBadge
              label="replacing"
              count={summary.total - summary.pending}
              colorClass="bg-amber-900/40 text-amber-300"
              testId="badge-replacing"
            />
          )}

          {/* Divider */}
          {(summary.accepted > 0 || summary.dismissed > 0 || summary.stale > 0) && (
            <span className="text-slate-700" aria-hidden="true">·</span>
          )}

          {/* Review status badges */}
          {summary.accepted > 0 && (
            <CountBadge
              label="accepted"
              count={summary.accepted}
              colorClass="bg-green-900/40 text-green-400"
              testId="badge-accepted"
            />
          )}
          {summary.dismissed > 0 && (
            <CountBadge
              label="dismissed"
              count={summary.dismissed}
              colorClass="bg-slate-700/60 text-slate-400"
              testId="badge-dismissed"
            />
          )}
          {summary.stale > 0 && (
            <CountBadge
              label="stale"
              count={summary.stale}
              colorClass="bg-yellow-900/40 text-yellow-300"
              testId="badge-stale"
            />
          )}

          {/* Last refreshed */}
          {lastRefreshedAt && (
            <>
              <span className="text-slate-700" aria-hidden="true">·</span>
              <span
                className="text-[10px] text-slate-500"
                data-testid="workspace-last-refreshed"
              >
                Refreshed {formatRelativeTime(lastRefreshedAt)}
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {onAcceptAllValid && (
            <button
              type="button"
              data-testid="bulk-accept-all-valid"
              onClick={onAcceptAllValid}
              disabled={!hasValidPending || isRefreshing}
              aria-label="Accept all valid suggestions"
              className={[
                'flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                !hasValidPending || isRefreshing
                  ? 'cursor-not-allowed bg-blue-900/20 text-blue-500/50'
                  : 'bg-blue-700 text-white hover:bg-blue-600',
              ].join(' ')}
            >
              <CheckCheck size={11} aria-hidden="true" />
              Accept All Valid
            </button>
          )}

          {onRefreshUnmapped && (
            <button
              type="button"
              data-testid="bulk-refresh-unmapped"
              onClick={onRefreshUnmapped}
              disabled={!hasUnmapped || isRefreshing}
              aria-label="Refresh unmapped suggestions"
              className={[
                'flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                !hasUnmapped || isRefreshing
                  ? 'cursor-not-allowed border-slate-700 text-slate-600'
                  : 'border-slate-600 text-slate-300 hover:border-slate-500 hover:text-slate-100',
              ].join(' ')}
            >
              <RefreshCw size={10} aria-hidden="true" />
              Refresh Unmapped
            </button>
          )}

          {onRefreshAll && (
            <button
              type="button"
              data-testid="bulk-refresh-all"
              onClick={onRefreshAll}
              disabled={isRefreshing}
              aria-label="Refresh all suggestions"
              className={[
                'flex items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                isRefreshing
                  ? 'cursor-not-allowed border-slate-700 text-slate-600'
                  : 'border-slate-600 text-slate-300 hover:border-slate-500 hover:text-slate-100',
              ].join(' ')}
            >
              <RefreshCw size={10} aria-hidden="true" />
              Refresh All
            </button>
          )}

          {onToggleExpandAll && (
            <button
              type="button"
              data-testid="workspace-toggle-expand-all"
              onClick={onToggleExpandAll}
              className={[
                'inline-flex items-center rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors',
                'hover:bg-slate-800 hover:text-slate-100',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              ].join(' ')}
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>
      </div>

      {batchAcceptResult && (
        <div
          data-testid="workspace-batch-result"
          className="mt-2 flex flex-wrap items-start justify-between gap-2 rounded border border-slate-700/80 bg-slate-900/70 px-2.5 py-2"
        >
          <div className="min-w-0">
            <p className="text-[11px] text-slate-200" data-testid="workspace-batch-result-summary">
              Batch accept applied {batchAcceptResult.applied} of {batchAcceptResult.attempted} suggestion
              {batchAcceptResult.attempted === 1 ? '' : 's'}.
              {batchAcceptResult.skipped > 0
                ? ` Skipped ${batchAcceptResult.skipped} ineligible suggestion${batchAcceptResult.skipped === 1 ? '' : 's'}.`
                : ''}
            </p>
            {batchAcceptResult.skipped > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400" data-testid="workspace-batch-result-reasons">
                {Object.entries(batchAcceptResult.skippedByReason)
                  .filter(([, count]) => count > 0)
                  .map(([reason, count]) => (
                    <span
                      key={reason}
                      className="rounded border border-slate-700 px-1.5 py-0.5"
                      data-testid={`workspace-batch-skip-${reason}`}
                    >
                      {reason}: {count}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {onClearBatchAcceptResult && (
            <button
              type="button"
              data-testid="workspace-batch-result-dismiss"
              onClick={onClearBatchAcceptResult}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              aria-label="Dismiss batch accept summary"
            >
              <XCircle size={11} aria-hidden="true" />
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
