/**
 * UnsavedDiffPanel — per-target-property unsaved changes viewer (FS-040 T-05).
 *
 * Renders a collapsible panel triggered by a "View unsaved changes" button.
 * When expanded, shows a stacked comparison of the last-saved expression vs.
 * the current draft, with a status badge and optional "Revert to saved" action.
 *
 * Implements AE-05 and AE-06.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslTokenType } from '../lib/dsl-tokenizer';
import type { UnsavedDiffState, UnsavedDiffStatus } from '../hooks/use-unsaved-diff';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnsavedDiffPanelProps {
  readonly diffState: UnsavedDiffState;
  readonly targetPath: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly onRevert: () => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Token color map (mirrors BuilderFeedbackArea)
// ---------------------------------------------------------------------------

const TOKEN_CLASS: Record<DslTokenType, string> = {
  'function-name': 'text-blue-400',
  'string-literal': 'text-green-400',
  'number-literal': 'text-amber-400',
  'boolean-literal': 'text-purple-400',
  'null-literal': 'text-slate-400',
  punctuation: 'text-zinc-500',
  comma: 'text-zinc-500',
  brace: 'text-zinc-500',
  colon: 'text-zinc-500',
  whitespace: '',
  unknown: 'text-zinc-300',
};

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
  UnsavedDiffStatus,
  { label: string; className: string }
> = {
  'no-mapping': { label: 'No mapping', className: 'bg-slate-800 text-slate-500' },
  new: { label: 'New mapping', className: 'bg-blue-900/50 text-blue-300' },
  modified: { label: 'Modified', className: 'bg-amber-900/50 text-amber-300' },
  removed: { label: 'Mapping removed', className: 'bg-red-900/50 text-red-300' },
  unchanged: { label: 'No changes', className: 'bg-green-900/40 text-green-400' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function HighlightedExpression({ expression }: { expression: string | null }) {
  if (!expression || expression.trim() === '') {
    return (
      <span className="italic text-zinc-600" data-testid="diff-no-expression">
        No mapping
      </span>
    );
  }
  const tokens = tokenizeDsl(expression);
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={TOKEN_CLASS[token.type]}>
          {token.text}
        </span>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UnsavedDiffPanel({
  diffState,
  targetPath,
  isExpanded,
  onToggle,
  onRevert,
  className = '',
}: UnsavedDiffPanelProps) {
  const { status, savedExpression, currentExpression, hasUnsavedChanges } = diffState;
  const badge = STATUS_BADGE[status];
  const canRevert = status === 'modified' || status === 'removed';
  const panelId = `unsaved-diff-content-${targetPath.replace(/\./g, '-')}`;

  return (
    <div
      data-testid="unsaved-diff-panel"
      className={[
        'shrink-0 border-b border-slate-700',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Trigger row */}
      <button
        type="button"
        data-testid="unsaved-diff-trigger"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-slate-400 transition-colors hover:bg-slate-800/40 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        {isExpanded ? (
          <ChevronDown size={12} aria-hidden="true" />
        ) : (
          <ChevronRight size={12} aria-hidden="true" />
        )}
        <span>View unsaved changes</span>
        {hasUnsavedChanges && (
          <span
            data-testid="unsaved-diff-badge"
            className="ml-1 rounded bg-amber-900/50 px-1.5 py-0.5 text-[9px] font-medium text-amber-300"
          >
            {badge.label}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          id={panelId}
          data-testid="unsaved-diff-content"
          aria-labelledby={`${panelId}-label`}
          className="border-t border-slate-800 bg-slate-900/40 px-4 py-3 space-y-3"
        >
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span
              id={`${panelId}-label`}
              data-testid="unsaved-diff-status-badge"
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
            {canRevert && (
              <button
                type="button"
                data-testid="revert-to-saved-btn"
                onClick={onRevert}
                className="ml-auto rounded border border-slate-600 px-2 py-1 text-xs text-slate-400 transition-colors hover:border-amber-500/60 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
              >
                Revert to saved
              </button>
            )}
          </div>

          {/* Last saved */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Last saved
            </span>
            <div
              data-testid="diff-saved-expression"
              className="min-h-[2rem] rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed"
            >
              <HighlightedExpression expression={savedExpression} />
            </div>
          </div>

          {/* Current draft */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Current draft
            </span>
            <div
              data-testid="diff-current-expression"
              className="min-h-[2rem] rounded border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed"
            >
              <HighlightedExpression expression={currentExpression} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
