/**
 * BuilderFeedbackArea — pinned feedback panel for the Builder panel (FS-040 T-02).
 *
 * Always visible regardless of Builder/Editor mode. Renders three rows:
 *   1. Expression — syntax-highlighted DSL with label reflecting completeness state.
 *   2. Result     — evaluated output via useExpressionPreview.
 *   3. Validation — Structure badge + Output Type badge.
 *
 * Replaces the Suggested Sources row that previously occupied this slot.
 * The Expression row is read-only (no click-to-edit — use the mode toggle instead).
 */

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslTokenType } from '../lib/dsl-tokenizer';
import { useExpressionPreview } from '../hooks/use-expression-preview';
import type { BuilderValidationState } from '../lib/builder-validation-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuilderFeedbackAreaProps {
  /** Current DSL expression string (generated or typed). */
  readonly expression: string;
  /** Source data for live result evaluation. Pass null for no-data state. */
  readonly sourceData: unknown | null;
  /** Validation state from useBuilderValidation (T-01). */
  readonly validationState: BuilderValidationState;
  /** Current authoring mode — affects Structure badge visibility. */
  readonly mode: 'builder' | 'editor';
  /**
   * Optional replacement for the default ResultRow.
   * When provided, this node is rendered in place of the standard scalar result row.
   * Used by ArrayBuilder (T-13) to inject ArrayResultPreview.
   */
  readonly resultSlot?: React.ReactNode;
  /** Condensed single-line summary mode. */
  readonly compact?: boolean;
  /** Whether the panel can be collapsed. */
  readonly collapsible?: boolean;
  /** Initial collapsed state when collapsible is enabled. */
  readonly defaultCollapsed?: boolean;
  /** Hides Structure/Output Type validation badges row. */
  readonly hideValidation?: boolean;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Token color map (mirrors LiveExpressionDisplay)
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
// Helpers
// ---------------------------------------------------------------------------

function formatResult(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ExpressionRow({
  expression,
  structureValid,
  mode,
}: {
  expression: string;
  structureValid: boolean;
  mode: 'builder' | 'editor';
}) {
  const tokens = expression ? tokenizeDsl(expression) : [];

  // Determine label
  let label = 'Expression';
  if (expression && mode === 'builder' && !structureValid) {
    label = 'Expression (incomplete)';
  }

  return (
    <div className="space-y-1" data-testid="feedback-expression">
      {expression ? (
        <>
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {label}
          </span>
          <div
            aria-live="polite"
            aria-label="Current expression"
            className="min-h-[2rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed"
          >
            {tokens.map((token, i) => (
              <span key={i} className={TOKEN_CLASS[token.type]}>
                {token.text}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div
          aria-live="polite"
          className="min-h-[2rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed"
          data-testid="feedback-expression-placeholder"
        >
          <span className="italic text-zinc-600">No expression yet</span>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  expression,
  sourceData,
}: {
  expression: string;
  sourceData: unknown | null;
}) {
  const { result, error, isEvaluating } = useExpressionPreview({
    expression,
    sourceData,
  });

  return (
    <div className="space-y-1" data-testid="feedback-result">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Result</span>
      <div
        aria-live="polite"
        aria-label="Evaluation result"
        className="min-h-[2rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {sourceData === null || sourceData === undefined ? (
          <span className="italic text-zinc-600" data-testid="feedback-result-no-data">
            Load test data to see live results.
          </span>
        ) : isEvaluating ? (
          <span
            className="inline-block h-3 w-24 animate-pulse rounded bg-zinc-700"
            role="status"
            aria-label="Evaluating…"
            data-testid="feedback-result-loading"
          />
        ) : error !== null ? (
          <span className="text-red-400" data-testid="feedback-result-error">
            {error}
          </span>
        ) : result !== null ? (
          <span className="text-green-400" data-testid="feedback-result-value">
            {formatResult(result)}
          </span>
        ) : (
          <span className="italic text-zinc-600" data-testid="feedback-result-no-data">
            Load test data to see live results.
          </span>
        )}
      </div>
    </div>
  );
}

function ValidationRow({
  validationState,
  mode,
}: {
  validationState: BuilderValidationState;
  mode: 'builder' | 'editor';
}) {
  const { structureValid, structureIssues, outputTypeValid, outputTypeMismatch } = validationState;
  const firstIssue = structureIssues[0]?.message ?? '';

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="feedback-validation"
    >
      {/* Structure badge — hidden in Editor mode */}
      {mode === 'builder' ? (
        <div
          role="status"
          aria-label={structureValid ? 'Structure valid' : `Structure invalid: ${firstIssue}`}
          data-testid="validation-structure-badge"
          className={[
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
            structureValid
              ? 'bg-green-900/40 text-green-400'
              : 'bg-red-900/40 text-red-400',
          ].join(' ')}
        >
          {structureValid ? (
            <CheckCircle2 size={10} aria-hidden="true" />
          ) : (
            <XCircle size={10} aria-hidden="true" />
          )}
          <span className="truncate max-w-[180px]">
            {structureValid ? 'Structure' : firstIssue || 'Incomplete'}
          </span>
        </div>
      ) : (
        <div
          role="status"
          aria-label="Structure check not applicable in Editor mode"
          data-testid="validation-structure-badge"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
        >
          <span>—</span>
          <span>Structure</span>
        </div>
      )}

      {/* Output Type badge */}
      <div
        role="status"
        aria-label={
          outputTypeValid
            ? 'Output type compatible'
            : `Output type mismatch: ${outputTypeMismatch?.message ?? ''}`
        }
        data-testid="validation-output-type-badge"
        className={[
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
          outputTypeMismatch !== null
            ? 'bg-amber-900/40 text-amber-400'
            : outputTypeValid
              ? 'bg-green-900/40 text-green-400'
              : 'text-zinc-600',
        ].join(' ')}
      >
        {outputTypeMismatch !== null ? (
          <AlertTriangle size={10} aria-hidden="true" />
        ) : outputTypeValid ? (
          <CheckCircle2 size={10} aria-hidden="true" />
        ) : null}
        <span className="truncate max-w-[180px]">
          {outputTypeMismatch !== null
            ? outputTypeMismatch.message
            : 'Output type'}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuilderFeedbackArea({
  expression,
  sourceData,
  validationState,
  mode,
  resultSlot,
  compact = false,
  collapsible = false,
  defaultCollapsed = false,
  hideValidation = false,
  className = '',
}: BuilderFeedbackAreaProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const preview = useExpressionPreview({
    expression,
    sourceData,
  });

  const compactResult = useMemo(() => {
    if (sourceData === null || sourceData === undefined) return 'no test data';
    if (preview.isEvaluating) return 'evaluating...';
    if (preview.error) return preview.error;
    if (preview.result === null || preview.result === undefined) return 'null';
    const text = formatResult(preview.result);
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }, [preview.error, preview.isEvaluating, preview.result, sourceData]);

  const compactExpression = useMemo(() => {
    const value = expression.trim();
    if (!value) return '(empty)';
    return value.length > 72 ? `${value.slice(0, 69)}...` : value;
  }, [expression]);

  const compactStatus = useMemo<'valid' | 'issue' | 'neutral'>(() => {
    if (!expression.trim()) return 'neutral';
    if (preview.error !== null) return 'issue';
    if (!validationState.structureValid) return 'issue';
    if (validationState.outputTypeMismatch !== null) return 'issue';
    return 'valid';
  }, [expression, preview.error, validationState.outputTypeMismatch, validationState.structureValid]);

  const compactDetailItems = useMemo(() => {
    const details: string[] = [];
    for (const issue of validationState.structureIssues) {
      details.push(issue.message);
    }
    if (validationState.outputTypeMismatch !== null) {
      details.push(validationState.outputTypeMismatch.message);
    }
    if (preview.error !== null) {
      details.push(preview.error);
    }
    return details;
  }, [preview.error, validationState.outputTypeMismatch, validationState.structureIssues]);

  const statusLabel =
    compactStatus === 'valid'
      ? 'Expression status: valid'
      : compactStatus === 'issue'
        ? 'Expression status: has issues'
        : 'Expression status: not set';

  return (
    <section
      role="region"
      aria-label="Expression feedback"
      data-testid="builder-feedback-area"
      className={[
        'shrink-0 border-b border-slate-700 px-4 py-3 space-y-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {compact && (
        <div className="space-y-1.5" data-testid="feedback-compact-block">
          <div className="flex items-center gap-2" data-testid="feedback-compact-expression-row">
            <span
              role="status"
              aria-label={statusLabel}
              data-testid="feedback-compact-status"
              className={[
                'inline-flex h-4 w-4 items-center justify-center rounded-full',
                compactStatus === 'valid'
                  ? 'text-green-400'
                  : compactStatus === 'issue'
                    ? 'text-amber-400'
                    : 'text-zinc-500',
              ].join(' ')}
            >
              {compactStatus === 'valid' ? (
                <CheckCircle2 size={12} aria-hidden="true" />
              ) : compactStatus === 'issue' ? (
                <AlertTriangle size={12} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} aria-hidden="true" />
              )}
            </span>
            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300" data-testid="feedback-compact-expression-summary">
              <span className="text-zinc-400">Expression:</span> {compactExpression}
            </p>
            {collapsible && (
              <button
                type="button"
                onClick={() => { setCollapsed((prev) => !prev); }}
                className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                aria-label={collapsed ? 'Expand feedback details' : 'Collapse feedback details'}
                data-testid="feedback-collapse-toggle"
              >
                {collapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
              </button>
            )}
          </div>
          <p className="min-w-0 truncate pl-6 font-mono text-[11px] text-zinc-300" data-testid="feedback-compact-result-summary">
            <span className="text-zinc-400">Result:</span> {compactResult}
          </p>
        </div>
      )}

      {compact ? (
        collapsible && !collapsed ? (
          <div
            className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
            data-testid="feedback-details-panel"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Mapping details</span>
            {compactDetailItems.length > 0 ? (
              <div className="space-y-1" data-testid="feedback-details-list">
                {compactDetailItems.map((item, index) => (
                  <p key={`${item}-${index}`} className="text-xs text-zinc-300">
                    {item}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500" data-testid="feedback-details-placeholder">
                Additional mapping diagnostics will appear here.
              </p>
            )}
          </div>
        ) : null
      ) : (
        <>
          <ExpressionRow
            expression={expression}
            structureValid={validationState.structureValid}
            mode={mode}
          />
          {resultSlot !== undefined ? (
            <div className="space-y-1" data-testid="feedback-result">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Result</span>
              <div
                aria-live="polite"
                aria-label="Evaluation result"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed"
              >
                {resultSlot}
              </div>
            </div>
          ) : (
            <ResultRow expression={expression} sourceData={sourceData} />
          )}
          {!hideValidation && <ValidationRow validationState={validationState} mode={mode} />}
        </>
      )}
    </section>
  );
}
