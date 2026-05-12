import { useState } from 'react';

import type { Diagnostic, SuggestionReviewItem } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPRESSION_TRUNCATE_LENGTH = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestionReviewCardProps {
  item: SuggestionReviewItem;
  onAccept: (targetPath: string) => void;
  onEdit: (targetPath: string) => void;
  onDismiss: (targetPath: string) => void;
  onUndoDismiss: (targetPath: string) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// --- New/Replace badge ---

function NewReplaceBadge({ isNew }: { isNew: boolean }) {
  if (isNew) {
    return (
      <span className="inline-flex items-center rounded border border-blue-500 px-1.5 py-0.5 text-xs font-medium text-blue-400">
        New rule
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded border border-amber-500 px-1.5 py-0.5 text-xs font-medium text-amber-400">
      Replaces existing
    </span>
  );
}

// --- Confidence badge ---

function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const config = {
    high: { dot: 'bg-green-400', label: 'High', text: 'text-green-300' },
    medium: { dot: 'bg-amber-400', label: 'Medium', text: 'text-amber-300' },
    low: { dot: 'bg-red-400', label: 'Low', text: 'text-red-300' },
  }[confidence];

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      {config.label} confidence
    </span>
  );
}

// --- Validation badge ---

type ValidationState = 'valid' | 'warning' | 'invalid';

function getValidationState(
  validation: SuggestionReviewItem['suggestion']['validation'],
): ValidationState | null {
  if (!validation) return null;
  if (!validation.valid) return 'invalid';
  const hasWarnings = validation.diagnostics.some((d) => d.severity === 'warning');
  return hasWarnings ? 'warning' : 'valid';
}

function ValidationBadge({
  validation,
}: {
  validation: SuggestionReviewItem['suggestion']['validation'];
}) {
  const state = getValidationState(validation);
  if (state === null) return null;

  const config = {
    valid: { label: 'Valid ✓', classes: 'bg-green-900/60 text-green-300' },
    warning: { label: 'Warning', classes: 'bg-amber-900/60 text-amber-300' },
    invalid: { label: 'Invalid ✕', classes: 'bg-red-900/60 text-red-300' },
  }[state];

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}

// --- Expression display with truncation ---

function ExpressionDisplay({
  expression,
  label,
  accentClass,
}: {
  expression: string;
  label: string;
  accentClass?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTruncatable = expression.length > EXPRESSION_TRUNCATE_LENGTH;
  const displayText =
    isTruncatable && !expanded
      ? expression.slice(0, EXPRESSION_TRUNCATE_LENGTH) + '…'
      : expression;

  return (
    <div className={['rounded px-2 py-1.5', accentClass].filter(Boolean).join(' ')}>
      <span className="mb-0.5 block text-xs text-slate-500">{label}</span>
      <code className="block break-all font-mono text-xs text-slate-200">{displayText}</code>
      {isTruncatable && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs text-blue-400 hover:text-blue-300 focus:outline-none focus:underline"
        >
          {expanded ? 'Show less' : 'Show full'}
        </button>
      )}
    </div>
  );
}

// --- Diagnostics expansion ---

function DiagnosticsSection({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const [open, setOpen] = useState(false);

  if (diagnostics.length === 0) return null;

  const severityConfig = {
    error: { icon: '✕', classes: 'text-red-400' },
    warning: { icon: '⚠', classes: 'text-amber-400' },
    info: { icon: 'ℹ', classes: 'text-blue-400' },
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 focus:outline-none focus:underline"
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Diagnostics ({diagnostics.length})
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1 pl-3">
          {diagnostics.map((d, i) => {
            const cfg = severityConfig[d.severity] ?? severityConfig.info;
            return (
              <li key={i} className="flex items-start gap-1.5 text-xs">
                <span className={`mt-px shrink-0 ${cfg.classes}`} aria-hidden="true">
                  {cfg.icon}
                </span>
                <span className="text-slate-300">
                  <span className="font-mono text-slate-400">[{d.code}]</span> {d.message}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuggestionReviewCard
// ---------------------------------------------------------------------------

/**
 * Renders a single Auto-Map suggestion with target path, expression comparison,
 * explanation, confidence/validation badges, diagnostics, and action buttons.
 *
 * Visual states:
 * - pending   → full card, all actions available
 * - accepted  → collapsed, green "Accepted ✓" indicator
 * - edited    → collapsed, blue "Editing" indicator
 * - dismissed → collapsed/faded, Undo button visible
 */
export function SuggestionReviewCard({
  item,
  onAccept,
  onEdit,
  onDismiss,
  onUndoDismiss,
}: SuggestionReviewCardProps) {
  const { suggestion, currentExpression, reviewStatus, isNew } = item;
  const target = suggestion.target;

  // -------------------------------------------------------------------------
  // Accepted state — collapsed
  // -------------------------------------------------------------------------

  if (reviewStatus === 'accepted') {
    return (
      <div className="rounded-lg border border-green-800/50 bg-slate-800/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="mr-1.5 text-green-400" aria-hidden="true">✓</span>
            <span className="text-sm font-medium text-slate-200">{target}</span>
            <code className="mt-0.5 block truncate font-mono text-xs text-slate-400">
              {suggestion.expression}
            </code>
          </div>
          <span className="shrink-0 text-xs font-medium text-green-400">Accepted</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Edited state — collapsed
  // -------------------------------------------------------------------------

  if (reviewStatus === 'edited') {
    return (
      <div className="rounded-lg border border-blue-800/50 bg-slate-800/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="mr-1.5 text-blue-400" aria-hidden="true">✎</span>
            <span className="text-sm font-medium text-slate-200">{target}</span>
            <code className="mt-0.5 block truncate font-mono text-xs text-slate-400">
              {suggestion.expression}
            </code>
          </div>
          <span className="shrink-0 text-xs font-medium text-blue-400">Editing</span>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Dismissed state — collapsed/faded with Undo
  // -------------------------------------------------------------------------

  if (reviewStatus === 'dismissed') {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2.5 opacity-60">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="mr-1.5 text-slate-500" aria-hidden="true">✕</span>
            <span className="text-sm font-medium text-slate-400">{target}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-slate-500">Dismissed</span>
            <button
              type="button"
              onClick={() => onUndoDismiss(target)}
              className="rounded px-2 py-0.5 text-xs font-medium text-blue-400 hover:bg-slate-700 hover:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              Undo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Pending state — full card
  // -------------------------------------------------------------------------

  const hasDiagnostics =
    (suggestion.validation?.diagnostics?.length ?? 0) > 0;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
      {/* Header row: target path + new/replace badge */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100">{target}</span>
        <NewReplaceBadge isNew={isNew} />
      </div>

      {/* Expression comparison */}
      <div className="mb-2 flex flex-col gap-1.5">
        {currentExpression !== null ? (
          <ExpressionDisplay label="Current" expression={currentExpression} />
        ) : (
          <div className="rounded px-2 py-1.5">
            <span className="mb-0.5 block text-xs text-slate-500">Current</span>
            <span className="text-xs italic text-slate-500">No existing rule</span>
          </div>
        )}
        <ExpressionDisplay
          label="Suggested"
          expression={suggestion.expression}
          accentClass="border-l-2 border-blue-600 bg-slate-700/40"
        />
      </div>

      {/* Explanation */}
      {suggestion.explanation && (
        <p className="mb-2 text-xs text-slate-400">
          <span aria-hidden="true" className="mr-1">💡</span>
          {suggestion.explanation}
        </p>
      )}

      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ConfidenceBadge confidence={suggestion.confidence} />
        <ValidationBadge validation={suggestion.validation} />
      </div>

      {/* Diagnostics */}
      {hasDiagnostics && suggestion.validation && (
        <DiagnosticsSection diagnostics={suggestion.validation.diagnostics} />
      )}

      {/* Action buttons */}
      <div className="mt-3 flex items-center gap-2 border-t border-slate-700 pt-2.5">
        <button
          type="button"
          onClick={() => onAccept(target)}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => onEdit(target)}
          className="rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDismiss(target)}
          className="rounded px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
