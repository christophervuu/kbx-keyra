import { ChevronDown, ChevronRight, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';

import type { SuggestionWorkspaceItem } from '../types';
import { AiGeneratedStateLabel } from './AiSuggestionReviewPrimitives';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSED_EXPRESSION_LENGTH = 80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceSuggestionCardProps {
  item: SuggestionWorkspaceItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAccept: (targetPath: string) => void;
  onEdit: (targetPath: string) => void;
  onDismiss: (targetPath: string) => void;
  onUndoDismiss: (targetPath: string) => void;
  onRefreshItem?: (targetPath: string) => void;
  /** Preview slot — wired by parent in T-09 */
  previewSlot?: ReactNode;
  /** True when a refresh is in flight — shows loading indicator on the card */
  isRefreshing?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// --- Status badge ---

type StatusConfig = {
  label: string;
  classes: string;
};

const STATUS_CONFIG: Record<SuggestionWorkspaceItem['status'], StatusConfig> = {
  suggested: { label: 'Suggested', classes: 'bg-blue-900/50 text-blue-300 border border-blue-700/50' },
  accepted: { label: 'Accepted', classes: 'bg-green-900/50 text-green-300 border border-green-700/50' },
  edited: { label: 'Edited', classes: 'bg-purple-900/50 text-purple-300 border border-purple-700/50' },
  dismissed: { label: 'Dismissed', classes: 'bg-slate-700/60 text-slate-400 border border-slate-600/50' },
  stale: { label: 'Stale', classes: 'bg-amber-900/50 text-amber-300 border border-amber-700/50' },
};

function StatusBadge({ status }: { status: SuggestionWorkspaceItem['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
        cfg.classes,
      ].join(' ')}
    >
      {cfg.label}
    </span>
  );
}

// --- New/Replace badge ---

function NewReplaceBadge({ isNew }: { isNew: boolean }) {
  if (isNew) {
    return (
      <span
        data-testid="badge-new"
        className="inline-flex items-center rounded border border-blue-600/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-400"
      >
        New rule
      </span>
    );
  }
  return (
    <span
      data-testid="badge-replacing"
      className="inline-flex items-center rounded border border-amber-600/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
    >
      Replaces existing
    </span>
  );
}

// --- Confidence badge ---

function resolveConfidenceLevel(
  confidence: SuggestionWorkspaceItem['confidence'],
): 'high' | 'medium' | 'low' {
  if (confidence === 'high' || confidence === 'medium' || confidence === 'low') return confidence;
  if (typeof confidence === 'number') {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }
  return 'low';
}

const CONFIDENCE_CONFIG = {
  high: { dot: 'bg-green-400', label: 'High confidence', text: 'text-green-300' },
  medium: { dot: 'bg-amber-400', label: 'Medium confidence', text: 'text-amber-300' },
  low: { dot: 'bg-red-400', label: 'Low confidence', text: 'text-red-300' },
};

function ConfidenceBadge({ confidence }: { confidence: SuggestionWorkspaceItem['confidence'] }) {
  const level = resolveConfidenceLevel(confidence);
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <span
      data-testid={`confidence-badge-${level}`}
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${cfg.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

// --- Validation badge ---

type ValidationState = 'valid' | 'warning' | 'invalid';

function getValidationState(
  validation: SuggestionWorkspaceItem['validation'],
): ValidationState | null {
  if (!validation) return null;
  if (!validation.valid) return 'invalid';
  const hasWarnings = validation.diagnostics.some((d) => d.severity === 'warning');
  return hasWarnings ? 'warning' : 'valid';
}

const VALIDATION_CONFIG = {
  valid: { label: 'Valid', classes: 'bg-green-900/50 text-green-300' },
  warning: { label: 'Warning', classes: 'bg-amber-900/50 text-amber-300' },
  invalid: { label: 'Invalid', classes: 'bg-red-900/50 text-red-300' },
};

function ValidationBadge({ validation }: { validation: SuggestionWorkspaceItem['validation'] }) {
  const state = getValidationState(validation);
  if (state === null) return null;
  const cfg = VALIDATION_CONFIG[state];
  return (
    <span
      data-testid={`validation-badge-${state}`}
      className={[
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
        cfg.classes,
      ].join(' ')}
    >
      {cfg.label}
    </span>
  );
}

// --- Diagnostics section ---

function DiagnosticsSection({
  diagnostics,
}: {
  diagnostics: readonly { severity: string; code: string; message: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (diagnostics.length === 0) return null;

  const severityIcon: Record<string, string> = {
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  const severityClass: Record<string, string> = {
    error: 'text-red-400',
    warning: 'text-amber-400',
    info: 'text-blue-400',
  };

  return (
    <div className="mt-1.5" data-testid="diagnostics-section">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:underline"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Diagnostics ({diagnostics.length})
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1 pl-3" data-testid="diagnostics-list">
          {diagnostics.map((d, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px]">
              <span
                className={`mt-px shrink-0 ${severityClass[d.severity] ?? 'text-slate-400'}`}
                aria-hidden="true"
              >
                {severityIcon[d.severity] ?? 'ℹ'}
              </span>
              <span className="text-slate-300">
                <span className="font-mono text-slate-400">[{d.code}]</span> {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Expression display ---

function ExpressionBlock({
  label,
  expression,
  accentClass,
  placeholder,
}: {
  label: string;
  expression: string | null;
  accentClass?: string;
  placeholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTruncatable = expression !== null && expression.length > COLLAPSED_EXPRESSION_LENGTH;
  const displayText =
    expression !== null
      ? isTruncatable && !expanded
        ? expression.slice(0, COLLAPSED_EXPRESSION_LENGTH) + '…'
        : expression
      : null;

  return (
    <div
      className={[
        'rounded px-2 py-1.5',
        accentClass ?? 'bg-slate-800/60',
      ].join(' ')}
    >
      <span className="mb-0.5 block text-[10px] text-slate-500">{label}</span>
      {displayText !== null ? (
        <>
          <code className="block break-all font-mono text-xs text-slate-200">{displayText}</code>
          {isTruncatable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[10px] text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:underline"
            >
              {expanded ? 'Show less' : 'Show full'}
            </button>
          )}
        </>
      ) : (
        <span className="text-xs italic text-slate-500">{placeholder ?? 'No existing rule'}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceSuggestionCard
// ---------------------------------------------------------------------------

/**
 * WorkspaceSuggestionCard — renders a single suggestion in the Auto-Map workspace.
 *
 * Collapsed (default for accepted/edited/dismissed):
 *   - Target path + status badge + one-line expression + expand toggle
 *
 * Expanded (default for suggested/stale):
 *   - Full expression comparison, explanation, confidence/validation badges,
 *     diagnostics, stale indicator, action buttons, preview slot
 */
export function WorkspaceSuggestionCard({
  item,
  isExpanded,
  onToggleExpand,
  onAccept,
  onEdit,
  onDismiss,
  onUndoDismiss,
  onRefreshItem,
  previewSlot,
  isRefreshing = false,
}: WorkspaceSuggestionCardProps) {
  const { targetPath, suggestedExpression, explanation, confidence, validation, status, isNew, existingExpressionAtGeneration } = item;

  const isDismissed = status === 'dismissed';
  const isTerminal = status === 'accepted' || status === 'edited' || status === 'dismissed';
  const isStale = status === 'stale';

  const stopBubbling = (event: MouseEvent) => {
    event.stopPropagation();
  };

  // Dismissed cards always show collapsed single-row
  if (isDismissed) {
    return (
      <div
        data-testid={`suggestion-card-${targetPath}`}
        className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 opacity-60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status="dismissed" />
          <span className="min-w-0 truncate font-mono text-xs text-slate-400">{targetPath}</span>
        </div>
        <button
          type="button"
          data-testid={`undo-dismiss-${targetPath}`}
          onClick={() => onUndoDismiss(targetPath)}
          aria-label={`Undo dismiss for ${targetPath}`}
          className={[
            'flex shrink-0 items-center gap-1 rounded border border-slate-700 bg-slate-800',
            'px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors',
            'hover:bg-slate-700 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <RotateCcw size={10} aria-hidden="true" />
          Undo
        </button>
      </div>
    );
  }

  // Collapsed view for terminal states (accepted/edited) or when explicitly collapsed
  if (!isExpanded) {
    return (
      <div
        data-testid={`suggestion-card-${targetPath}`}
        className={[
          'border-b border-slate-800 px-4 py-2.5',
          'cursor-pointer',
          isTerminal ? 'bg-slate-900/40' : '',
          isRefreshing ? 'opacity-60' : '',
        ].join(' ')}
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              data-testid={`expand-toggle-${targetPath}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand();
              }}
              aria-expanded={false}
              aria-label={`Expand suggestion for ${targetPath}`}
              className="shrink-0 text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
            >
              <ChevronRight size={13} aria-hidden="true" />
            </button>
            <StatusBadge status={status} />
            <span className="min-w-0 truncate font-mono text-xs text-slate-300">{targetPath}</span>
            {isRefreshing && (
              <Loader2
                size={10}
                className="shrink-0 animate-spin text-slate-500"
                aria-label="Refreshing"
              />
            )}
          </div>
          <code className="hidden shrink-0 max-w-[200px] truncate font-mono text-[10px] text-slate-500 sm:block">
            {suggestedExpression.slice(0, COLLAPSED_EXPRESSION_LENGTH)}
            {suggestedExpression.length > COLLAPSED_EXPRESSION_LENGTH ? '…' : ''}
          </code>
        </div>
      </div>
    );
  }

  // Expanded view
  const hasDiagnostics = (validation?.diagnostics?.length ?? 0) > 0;

  return (
    <div
      data-testid={`suggestion-card-${targetPath}`}
      className={[
        'border-b border-slate-800 px-4 py-3',
        isStale ? 'bg-amber-950/10' : 'bg-slate-900/20',
        isRefreshing ? 'opacity-60' : '',
      ].join(' ')}
    >
      {/* Header row */}
      <div
        className="mb-2.5 flex cursor-pointer items-start justify-between gap-2"
        onClick={onToggleExpand}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            data-testid={`expand-toggle-${targetPath}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={true}
            aria-label={`Collapse suggestion for ${targetPath}`}
            className="shrink-0 text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
          >
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <span className="min-w-0 truncate font-mono text-xs font-semibold text-slate-100">
            {targetPath}
          </span>
          {isRefreshing && (
            <Loader2
              size={10}
              className="shrink-0 animate-spin text-slate-500"
              aria-label="Refreshing"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={status} />
          <NewReplaceBadge isNew={isNew} />
        </div>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div
          data-testid="stale-indicator"
          className="mb-2.5 flex items-center justify-between gap-2 rounded border border-amber-700/40 bg-amber-900/20 px-2.5 py-1.5"
        >
          <p className="text-[10px] text-amber-300">
            This suggestion may be outdated — the mapping rules have changed since it was generated.
          </p>
          {onRefreshItem && (
            <button
              type="button"
              data-testid={`refresh-item-${targetPath}`}
              onClick={(event) => {
                event.stopPropagation();
                onRefreshItem(targetPath);
              }}
              aria-label={`Refresh suggestion for ${targetPath}`}
              className={[
                'flex shrink-0 items-center gap-1 rounded border border-amber-700/50 bg-amber-900/30',
                'px-2 py-1 text-[10px] font-medium text-amber-300 transition-colors',
                'hover:bg-amber-900/50 hover:text-amber-200',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              ].join(' ')}
            >
              <RefreshCw size={10} aria-hidden="true" />
              Refresh
            </button>
          )}
        </div>
      )}

      {/* Expression comparison */}
      <AiGeneratedStateLabel testId={`suggestion-generated-label-${targetPath}`} />

      <div className="mb-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <ExpressionBlock
          label="Current rule"
          expression={existingExpressionAtGeneration}
          placeholder="No existing rule"
        />
        <ExpressionBlock
          label="Suggested"
          expression={suggestedExpression}
          accentClass="border-l-2 border-blue-600 bg-slate-800/60"
        />
      </div>

      {/* Explanation */}
      {explanation && (
        <p className="mb-2 text-[10px] text-slate-400">
          <span aria-hidden="true" className="mr-1">💡</span>
          {explanation}
        </p>
      )}

      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={confidence} />
        <ValidationBadge validation={validation} />
      </div>

      {/* Diagnostics */}
      {hasDiagnostics && validation && (
        <DiagnosticsSection diagnostics={validation.diagnostics} />
      )}

      {/* Preview slot (T-09) */}
      {previewSlot && (
        <div className="mt-2.5" data-testid="preview-slot">
          {previewSlot}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2.5">
        <button
          type="button"
          data-testid={`accept-${targetPath}`}
          onClick={(event) => {
            stopBubbling(event);
            onAccept(targetPath);
          }}
          aria-label={`Accept suggestion for ${targetPath}`}
          className={[
            'rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors',
            'hover:bg-blue-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          Accept
        </button>
        <button
          type="button"
          data-testid={`edit-${targetPath}`}
          onClick={(event) => {
            stopBubbling(event);
            onEdit(targetPath);
          }}
          aria-label={`Edit suggestion for ${targetPath}`}
          className={[
            'rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors',
            'hover:border-slate-500 hover:text-slate-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          Edit
        </button>
        <button
          type="button"
          data-testid={`dismiss-${targetPath}`}
          onClick={(event) => {
            stopBubbling(event);
            onDismiss(targetPath);
          }}
          aria-label={isNew ? `Dismiss suggestion for ${targetPath}` : `Keep current rule for ${targetPath}`}
          className={[
            'rounded px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors',
            'hover:bg-slate-700 hover:text-slate-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          {isNew ? 'Dismiss' : 'Keep Current'}
        </button>
      </div>
    </div>
  );
}
