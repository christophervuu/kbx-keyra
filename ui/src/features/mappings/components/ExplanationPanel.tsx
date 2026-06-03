/**
 * ExplanationPanel — inline panel for displaying AI-generated rule explanations.
 *
 * Renders below the AI action row in ScalarFieldBuilder and ChainBuilderShell.
 * Shows success (explanation text) or error (message + retry) states.
 * Not shown during loading — the Explain button itself shows loading state.
 */

import { AlertTriangle, Lightbulb, X } from 'lucide-react';

import type { ExplainRuleState } from '../hooks/use-explain-rule';
import { AiGeneratedStateLabel } from './AiSuggestionReviewPrimitives';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExplanationPanelProps {
  state: ExplainRuleState;
  onDismiss: () => void;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExplanationPanel({ state, onDismiss, onRetry }: ExplanationPanelProps) {
  if (state.status !== 'success' && state.status !== 'error') {
    return null;
  }

  const isError = state.status === 'error';

  return (
    <div
      data-testid="explanation-panel"
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      className={[
        'mt-2 rounded-lg border p-3',
        isError
          ? 'border-amber-700/60 bg-slate-800/80'
          : 'border-slate-700 bg-slate-800/80',
      ].join(' ')}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isError ? (
            <AlertTriangle
              size={13}
              className="shrink-0 text-amber-400"
              aria-hidden="true"
            />
          ) : (
            <Lightbulb
              size={13}
              className="shrink-0 text-blue-400"
              aria-hidden="true"
            />
          )}
          <span className="text-xs font-medium text-slate-300">
            {isError ? 'Explain Error' : 'Explanation'}
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss explanation"
          className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      {isError ? (
        <>
          <p className="mb-2 text-xs leading-relaxed text-slate-400">{state.error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <AiGeneratedStateLabel
            mode="explanation"
            testId="explanation-assistance-label"
          />
          <p className="text-xs leading-relaxed text-slate-200">
            {state.result?.explanation}
          </p>
        </>
      )}
    </div>
  );
}
