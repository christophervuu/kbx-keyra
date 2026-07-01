import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useContext, useState, type ReactNode } from 'react';

import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceSuggestionCard } from './WorkspaceSuggestionCard';
import { WorkspaceSuggestionPreview } from './WorkspaceSuggestionPreview';
import { PreviewContext } from '../context/preview-context';
import type { BatchAcceptResult } from '../hooks';
import type { AutoMapWorkspaceSummary, SuggestionWorkspaceItem } from '../types';

import type { AutoMapRunSummary } from '@/lib/api/types';
import type { AutoMapRunStatus, SuggestionApplyBlockReason } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoMapWorkspaceProps {
  /** Current fetch/lifecycle status */
  status: 'idle' | 'loading' | 'success' | 'error';
  /** Error message (when status === 'error') */
  error: string | null;
  /** All suggestion items (unfiltered) */
  items: readonly SuggestionWorkspaceItem[];
  /** Filtered items (after active filter chips applied) */
  filteredItems: readonly SuggestionWorkspaceItem[];
  /** Workspace summary counts */
  summary: AutoMapWorkspaceSummary;
  /** The section path being reviewed */
  sectionPath: string | null;
  /** Called to retry after an error */
  onRetry: () => void;
  /** Called to refresh all suggestions */
  onRefreshAll: () => void;
  /** Called to refresh unresolved unmapped suggestions */
  onRefreshUnmapped?: () => void;
  /** Called to bulk-accept valid pending suggestions */
  onAcceptAllValid?: () => void;
  batchAcceptResult?: BatchAcceptResult | null;
  onClearBatchAcceptResult?: () => void;
  /** Called to exit the workspace and return to the editor */
  onExitWorkspace: () => void;
  /** Called when a suggestion is accepted */
  onAccept?: (targetPath: string) => void;
  /** Called when a suggestion is sent to the expression editor */
  onEdit?: (targetPath: string) => void;
  /** Called when a suggestion is dismissed */
  onDismiss?: (targetPath: string) => void;
  /** Called when a dismissed suggestion is restored */
  onUndoDismiss?: (targetPath: string) => void;
  /** Called when an accepted/edited suggestion is reverted to suggested */
  onUndoAccept?: (targetPath: string) => void;
  /** Called to refresh a single stale suggestion */
  onRefreshItem?: (targetPath: string) => void;
  /** True when previous suggestions are available for restoration after an error */
  previousSuggestionsAvailable: boolean;
  /** Called to restore previous suggestions after an error */
  onRestorePrevious: () => void;
  /** ISO timestamp of last refresh */
  generatedAt: string | null;
  /**
   * Suggestion card list — rendered by the parent (T-06).
   * When undefined, a placeholder is shown.
   */
  children?: ReactNode;
  /**
   * Toolbar slot (T-07, optional).
   * Rendered between the header and the card list.
   */
  toolbarSlot?:
    | ReactNode
    | ((controls: { onToggleExpandAll: () => void; allExpanded: boolean }) => ReactNode);
  /**
   * Inline confirmation banner slot (T-08, optional).
   * Rendered between the toolbar and the card list.
   */
  confirmationSlot?: ReactNode;
  /**
   * No-source-data callout slot (T-09, optional).
   * Rendered above the card list when no sample source data is loaded.
   */
  noSourceDataSlot?: ReactNode;
  /** Optional className for the outer container */
  className?: string;
  /** Optional enrichment payloads keyed by alias for suggestion preview context. */
  previewExternalSources?: Readonly<Record<string, unknown>>;
  /** Required enrichment aliases for suggestion preview context. */
  requiredEnrichmentAliases?: readonly string[];

  // Progressive run status (FS-101 T-14)
  runStatus?: AutoMapRunStatus | null;
  runProgress?: AutoMapRunSummary['progress'] | null;
  runCounts?: AutoMapRunSummary['counts'] | null;
  runFailure?: AutoMapRunSummary['failure'] | null;
  isPolling?: boolean;
  pollingWarning?: string | null;
  onRetryFailed?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when every item is in a terminal state (accepted / edited / dismissed). */
function allResolved(items: readonly SuggestionWorkspaceItem[]): boolean {
  if (items.length === 0) return false;
  return items.every(
    (i) => i.status === 'accepted' || i.status === 'edited' || i.status === 'dismissed',
  );
}

function deriveAcceptBlockReason(item: SuggestionWorkspaceItem): SuggestionApplyBlockReason | null {
  if (item.validation && item.validation.valid !== true) return 'invalid';
  if (item.status === 'stale') return 'stale';
  if (item.status === 'dismissed') return 'dismissed';
  if (item.status === 'accepted' || item.status === 'edited') return 'already-reviewed';
  return null;
}

function acceptBlockedReasonToMessage(reason: SuggestionApplyBlockReason | null): string | null {
  switch (reason) {
    case 'invalid':
      return 'Accept is disabled because this suggestion has blocking validation diagnostics.';
    case 'stale':
      return 'Accept is disabled because this suggestion is stale. Refresh it first.';
    case 'dismissed':
      return 'Accept is disabled because this suggestion is dismissed. Undo dismiss to review again.';
    case 'already-reviewed':
      return 'Accept is disabled because this suggestion is already reviewed.';
    case 'not-ready':
      return 'Accept is disabled because this suggestion is not ready.';
    default:
      return null;
  }
}

function SuggestionPreviewSlot({
  currentExpression,
  expression,
  targetPath,
  externalSources,
  requiredEnrichmentAliases,
}: {
  currentExpression: string | null;
  expression: string;
  targetPath: string;
  externalSources: Readonly<Record<string, unknown>>;
  requiredEnrichmentAliases: readonly string[];
}) {
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  return (
    <div
      className="rounded border border-slate-800 bg-slate-900/50 px-2.5 py-2"
      data-testid={`workspace-preview-${targetPath}`}
    >
      <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Preview</p>
      <WorkspaceSuggestionPreview
        currentExpression={currentExpression}
        suggestedExpression={expression}
        sourceData={sourceData}
        externalSources={externalSources as Record<string, unknown>}
        requiredEnrichmentAliases={requiredEnrichmentAliases}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingBody({ sectionPath }: { sectionPath: string | null }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      data-testid="workspace-loading"
    >
      <Loader2
        size={28}
        className="animate-spin text-violet-400"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-slate-300">
        Generating mapping suggestions
        {sectionPath ? (
          <>
            {' for '}
            <span className="font-semibold text-slate-100">{sectionPath}</span>
          </>
        ) : null}
        …
      </p>
      <p className="text-xs text-slate-500">This may take a few seconds</p>
    </div>
  );
}

interface ErrorBodyProps {
  error: string;
  onRetry: () => void;
  previousSuggestionsAvailable: boolean;
  onRestorePrevious: () => void;
}

function ErrorBody({
  error,
  onRetry,
  previousSuggestionsAvailable,
  onRestorePrevious,
}: ErrorBodyProps) {
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      data-testid="workspace-error"
    >
      <AlertCircle size={28} className="text-red-400" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-200">Auto-Map failed</p>
        <p className="text-xs text-slate-400">{error}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          data-testid="workspace-retry-button"
          onClick={onRetry}
          className={[
            'flex items-center gap-1.5 rounded border border-slate-600 bg-slate-800',
            'px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors',
            'hover:bg-slate-700 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <RefreshCw size={11} aria-hidden="true" />
          Try Again
        </button>
        {previousSuggestionsAvailable && (
          <button
            type="button"
            data-testid="workspace-restore-previous"
            onClick={onRestorePrevious}
            className={[
              'text-xs text-violet-400 underline underline-offset-2',
              'hover:text-violet-300',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded',
            ].join(' ')}
          >
            Show previous suggestions
          </button>
        )}
      </div>
    </div>
  );
}

interface EmptyBodyProps {
  onExitWorkspace: () => void;
  onRefreshAll: () => void;
  noContextReason?: string | null;
}

function EmptyBody({ onExitWorkspace, onRefreshAll, noContextReason }: EmptyBodyProps) {
  const isNoContext = typeof noContextReason === 'string' && noContextReason.trim() !== '';
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      data-testid="workspace-empty"
    >
      <p className="text-sm font-medium text-slate-300">
        {isNoContext ? 'No relevant source context found' : 'No suggestions generated'}
      </p>
      <p className="text-xs text-slate-500" data-testid="workspace-empty-reason">
        {isNoContext
          ? noContextReason
          : 'No eligible target fields were found in this section, or all fields are already mapped.'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="workspace-empty-back"
          onClick={onExitWorkspace}
          className={[
            'rounded border border-slate-700 bg-slate-800 px-3 py-1.5',
            'text-xs font-medium text-slate-300 transition-colors',
            'hover:bg-slate-700 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          Back to Editor
        </button>
        <button
          type="button"
          data-testid="workspace-empty-refresh"
          onClick={onRefreshAll}
          className={[
            'flex items-center gap-1.5 rounded border border-violet-700 bg-violet-900/30 px-3 py-1.5',
            'text-xs font-medium text-violet-300 transition-colors',
            'hover:bg-violet-900/50 hover:text-violet-200',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <RefreshCw size={11} aria-hidden="true" />
          Refresh All
        </button>
      </div>
    </div>
  );
}

interface CompletionBannerProps {
  summary: AutoMapWorkspaceSummary;
  onRefreshAll: () => void;
}

function CompletionBanner({ summary, onRefreshAll }: CompletionBannerProps) {
  return (
    <div
      data-testid="workspace-completion-banner"
      className={[
        'shrink-0 border-t border-green-800/40 bg-green-950/30 px-4 py-3',
        'flex items-center justify-between gap-3',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="shrink-0 text-green-400" aria-hidden="true" />
        <p className="text-xs text-green-300">
          All {summary.total} suggestion{summary.total !== 1 ? 's' : ''} reviewed.{' '}
          <span className="font-medium">
            {summary.accepted} accepted
            {summary.edited > 0 ? `, ${summary.edited} edited` : ''}
            {summary.dismissed > 0 ? `, ${summary.dismissed} dismissed` : ''}
          </span>
          .
        </p>
      </div>
      <button
        type="button"
        data-testid="workspace-completion-refresh"
        onClick={onRefreshAll}
        className={[
          'flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-800',
          'px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors',
          'hover:bg-slate-700 hover:text-slate-200',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        ].join(' ')}
      >
        <RefreshCw size={10} aria-hidden="true" />
        Refresh All
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AutoMapWorkspace — center panel shell for the Auto-Map Review Workspace (FS-048).
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │  WorkspaceHeader (sticky)               │
 * ├─────────────────────────────────────────┤
 * │  toolbarSlot (T-07, optional)           │
 * ├─────────────────────────────────────────┤
 * │  Body (loading | error | empty | cards) │
 * │  (overflow-y-auto, flex-1)              │
 * ├─────────────────────────────────────────┤
 * │  CompletionBanner (when all resolved)   │
 * └─────────────────────────────────────────┘
 */
export function AutoMapWorkspace({
  status,
  error,
  items,
  filteredItems,
  summary,
  sectionPath,
  onRetry,
  onRefreshAll,
  onRefreshUnmapped,
  onAcceptAllValid,
  batchAcceptResult,
  onClearBatchAcceptResult,
  onExitWorkspace,
  onAccept,
  onEdit,
  onDismiss,
  onUndoDismiss,
  onUndoAccept,
  onRefreshItem,
  previousSuggestionsAvailable,
  onRestorePrevious,
  generatedAt,
  children,
  toolbarSlot,
  confirmationSlot,
  noSourceDataSlot,
  className = '',
  previewExternalSources = {},
  requiredEnrichmentAliases = [],
  runStatus = null,
  runProgress = null,
  runCounts = null,
  runFailure = null,
  isPolling = false,
  pollingWarning = null,
  onRetryFailed,
}: AutoMapWorkspaceProps) {
  const resolved = status === 'success' && allResolved(items);

  // Expand/collapse state keyed by targetPath.
  // Suggested/stale items start expanded; terminal items start collapsed.
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => {
    const initial = new Set<string>();
    for (const item of items) {
      if (item.status === 'suggested' || item.status === 'stale') {
        initial.add(item.targetPath);
      }
    }
    return initial;
  });

  const expandableTargetPaths = filteredItems
    .filter((item) => item.status !== 'dismissed')
    .map((item) => item.targetPath);
  const allExpanded =
    expandableTargetPaths.length > 0 &&
    expandableTargetPaths.every((targetPath) => expandedPaths.has(targetPath));

  const toggleExpand = useCallback((targetPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(targetPath)) {
        next.delete(targetPath);
      } else {
        next.add(targetPath);
      }
      return next;
    });
  }, []);

  const toggleExpandAll = () => {
    setExpandedPaths((prev) => {
      if (expandableTargetPaths.length === 0) {
        return prev;
      }

      const next = new Set(prev);
      const shouldCollapse = expandableTargetPaths.every((targetPath) => next.has(targetPath));

      if (shouldCollapse) {
        for (const targetPath of expandableTargetPaths) {
          next.delete(targetPath);
        }
      } else {
        for (const targetPath of expandableTargetPaths) {
          next.add(targetPath);
        }
      }

      return next;
    });
  };

  const handleAcceptAndAdvance = useCallback(
    (targetPath: string) => {
      onAccept?.(targetPath);

      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(targetPath);

        const currentIndex = filteredItems.findIndex((item) => item.targetPath === targetPath);
        for (let i = currentIndex + 1; i < filteredItems.length; i += 1) {
          const candidate = filteredItems[i];
          if (!candidate || candidate.status === 'dismissed') {
            continue;
          }
          next.add(candidate.targetPath);
          break;
        }

        return next;
      });
    },
    [onAccept, filteredItems],
  );

  return (
    <div
      role="region"
      aria-label="Auto-Map Review Workspace"
      data-testid="automap-workspace"
      className={[
        'flex h-full flex-col overflow-hidden bg-slate-950',
        className,
      ].join(' ')}
    >
      {/* Header — always visible */}
      <WorkspaceHeader
        sectionPath={sectionPath}
        summary={summary}
        lastRefreshedAt={generatedAt}
        onExitWorkspace={onExitWorkspace}
        onAcceptAllValid={onAcceptAllValid}
        batchAcceptResult={batchAcceptResult}
        onClearBatchAcceptResult={onClearBatchAcceptResult}
        onRefreshUnmapped={onRefreshUnmapped}
        onRefreshAll={onRefreshAll}
        onToggleExpandAll={toggleExpandAll}
        allExpanded={allExpanded}
        isRefreshing={status === 'loading'}
        runStatus={runStatus}
        runProgress={runProgress}
        runCounts={runCounts}
        runFailure={runFailure}
        isPolling={isPolling}
        pollingWarning={pollingWarning}
        onRetryFailed={onRetryFailed}
      />

      {/* Toolbar slot (T-07) */}
      {typeof toolbarSlot === 'function'
        ? toolbarSlot({ onToggleExpandAll: toggleExpandAll, allExpanded })
        : toolbarSlot}

      {/* Confirmation slot (T-08) */}
      {confirmationSlot}

      {/* Body */}
      {status === 'loading' ? (
        <LoadingBody sectionPath={sectionPath} />
      ) : status === 'error' && error !== null ? (
        <ErrorBody
          error={error}
          onRetry={onRetry}
          previousSuggestionsAvailable={previousSuggestionsAvailable}
          onRestorePrevious={onRestorePrevious}
        />
      ) : status === 'success' && items.length === 0 ? (
        <EmptyBody
          onExitWorkspace={onExitWorkspace}
          onRefreshAll={onRefreshAll}
          noContextReason={summary.noContextReason}
        />
      ) : (
        /* Card list — scrollable */
        <div
          className="flex-1 overflow-y-auto"
          data-testid="workspace-card-list"
          aria-label={`${filteredItems.length} suggestion${filteredItems.length !== 1 ? 's' : ''}`}
        >
          {/* No source data callout (T-09) */}
          {noSourceDataSlot}

          {children ?? (
            /* Default card list — uses WorkspaceSuggestionCard (T-06) */
            <div className="flex flex-col divide-y divide-slate-800/60">
              {filteredItems.map((item) => (
                <WorkspaceSuggestionCard
                  key={item.targetPath}
                  item={item}
                  isExpanded={expandedPaths.has(item.targetPath)}
                  onToggleExpand={() => toggleExpand(item.targetPath)}
                  onAccept={handleAcceptAndAdvance}
                  onEdit={onEdit ?? (() => undefined)}
                  onDismiss={onDismiss ?? (() => undefined)}
                  onUndoDismiss={onUndoDismiss ?? (() => undefined)}
                  onUndoAccept={onUndoAccept}
                  onRefreshItem={onRefreshItem}
                  canAccept={deriveAcceptBlockReason(item) === null}
                  acceptBlockedReason={acceptBlockedReasonToMessage(deriveAcceptBlockReason(item))}
                  previewSlot={
                    <SuggestionPreviewSlot
                      expression={item.suggestedExpression}
                      currentExpression={item.existingExpressionAtGeneration}
                      targetPath={item.targetPath}
                      externalSources={previewExternalSources}
                      requiredEnrichmentAliases={requiredEnrichmentAliases}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Completion banner */}
      {resolved && (
        <CompletionBanner summary={summary} onRefreshAll={onRefreshAll} />
      )}
    </div>
  );
}
