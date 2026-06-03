/**
 * SuggestExpressionInline — inline NL → Rule interaction surface.
 *
 * Renders below the AI action row in ScalarFieldBuilder and ChainBuilderShell.
 * Handles two phases:
 *   1. Instruction input (inputting / loading states)
 *   2. Suggestion result display (success / error states)
 *
 * State is driven externally via the `useSuggestExpression` hook.
 * Instruction text is owned locally within this component.
 */

import { AlertTriangle, Check, Loader2, Sparkles, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import type { SuggestExpressionState } from '../hooks/use-suggest-expression';
import { AiGeneratedStateLabel, AiSuggestionComparisonBlock } from './AiSuggestionReviewPrimitives';

import { defaultRegistry, inferExpressionType, parse } from '@/lib/engine';
import type { Diagnostic } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SuggestExpressionInlineProps {
  /** Current state from useSuggestExpression hook */
  state: SuggestExpressionState;
  /** Target field context for display */
  targetPath: string;
  targetType: string;
  currentExpression?: string | null;
  /** Callback: user clicks Generate */
  onGenerate: (instruction: string) => void;
  /** Callback: user clicks Accept */
  onAccept: (expression: string) => void;
  /** Callback: user clicks Dismiss or Cancel */
  onDismiss: () => void;
}

function normalizeType(type: string): string {
  return type === 'integer' ? 'number' : type;
}

function validateReviewExpression(
  expression: string,
  targetType: string,
): { valid: boolean; diagnostics: Diagnostic[] } {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      valid: false,
      diagnostics: [
        {
          code: 'EMPTY_EXPRESSION',
          severity: 'error',
          message: 'Expression is required before accepting this suggestion.',
        },
      ],
    };
  }

  const parsed = parse(trimmed, { registry: defaultRegistry });
  if (!parsed.success || parsed.ast === null) {
    const diagnostics = parsed.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
      } satisfies Diagnostic));

    return {
      valid: false,
      diagnostics:
        diagnostics.length > 0
          ? diagnostics
          : [
              {
                code: 'PARSE_ERROR',
                severity: 'error',
                message: 'Expression could not be parsed.',
              },
            ],
    };
  }

  const inferred = inferExpressionType(parsed.ast);
  const normalizedTarget = normalizeType(targetType);
  const normalizedInferred = inferred ? normalizeType(inferred) : undefined;

  if (
    normalizedInferred !== undefined
    && normalizedInferred !== 'any'
    && normalizedTarget !== 'any'
    && normalizedInferred !== normalizedTarget
  ) {
    return {
      valid: false,
      diagnostics: [
        {
          code: 'TYPE_MISMATCH',
          severity: 'error',
          message: `Expression returns ${normalizedInferred} but target expects ${normalizedTarget}.`,
        },
      ],
    };
  }

  return { valid: true, diagnostics: [] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestExpressionInline({
  state,
  targetPath,
  targetType,
  currentExpression = null,
  onGenerate,
  onAccept,
  onDismiss,
}: SuggestExpressionInlineProps) {
  const [instruction, setInstruction] = useState('');
  const [reviewExpression, setReviewExpression] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isInputPhase = state.status === 'inputting' || state.status === 'loading';
  const isLoading = state.status === 'loading';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';

  // Auto-focus textarea when entering input phase
  useEffect(() => {
    if (state.status === 'inputting') {
      textareaRef.current?.focus();
    }
  }, [state.status]);

  // Clear instruction when transitioning back to inputting from a result state
  useEffect(() => {
    if (state.status === 'inputting') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstruction('');
    }
  }, [state.status]);

  // Sync review editor with latest suggestion payload.
  useEffect(() => {
    if (state.status === 'success' && state.result) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReviewExpression(state.result.expression);
    }
  }, [state.status, state.result]);

  if (state.status === 'idle') {
    return null;
  }

  const trimmedInstruction = instruction.trim();
  const canGenerate = trimmedInstruction.length > 0;
  const normalizedReviewExpression = reviewExpression.trim();
  const isUneditedSuggestion =
    isSuccess && state.result
      ? normalizedReviewExpression === state.result.expression.trim()
      : false;
  const localValidation = validateReviewExpression(normalizedReviewExpression, targetType);
  const diagnosticsToShow =
    isSuccess && state.result && isUneditedSuggestion
      ? state.result.validation.diagnostics
      : localValidation.diagnostics;
  const canAccept =
    isSuccess && state.result
      ? isUneditedSuggestion
        ? state.readyToApply
        : localValidation.valid
      : false;

  function handleGenerate() {
    if (canGenerate) {
      onGenerate(trimmedInstruction);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canGenerate) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  }

  return (
    <div
      data-testid="suggest-expression-inline"
      role="region"
      aria-label="Suggest expression"
      className="mt-2 rounded-lg border border-slate-700 bg-slate-800/80 p-3"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Input phase (inputting + loading)                                   */}
      {/* ------------------------------------------------------------------ */}
      {isInputPhase && (
        <>
          {/* Context line */}
          <p className="mb-2 text-xs text-slate-500">
            Suggest expression for{' '}
            <span className="font-mono text-slate-400">{targetPath}</span>
            {targetType ? (
              <span className="text-slate-500"> ({targetType})</span>
            ) : null}
          </p>

          {/* Instruction textarea */}
          <textarea
            ref={textareaRef}
            aria-label="Natural language instruction"
            placeholder="Describe the mapping logic…"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={3}
            className={[
              'mb-2 w-full resize-none rounded border bg-slate-900/60 px-2 py-1.5 text-xs text-slate-200',
              'placeholder:text-slate-600',
              'focus:outline-none focus:ring-1 focus:ring-blue-500',
              isLoading
                ? 'cursor-not-allowed border-slate-700 opacity-50'
                : 'border-slate-700',
            ].join(' ')}
          />

          {/* Button row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate || isLoading}
              aria-label={
                isLoading
                  ? 'Generating…'
                  : !canGenerate
                    ? 'Generate (enter an instruction first)'
                    : 'Generate expression'
              }
              className={[
                'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                !canGenerate || isLoading
                  ? 'cursor-not-allowed border-slate-700 text-slate-600'
                  : 'border-blue-700 text-blue-400 hover:border-blue-500 hover:text-blue-300',
              ].join(' ')}
            >
              {isLoading ? (
                <>
                  <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={11} aria-hidden="true" />
                  Generate
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Cancel suggest expression"
              className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Success phase                                                        */}
      {/* ------------------------------------------------------------------ */}
      {isSuccess && state.result && (
        <>
          {/* Header */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="shrink-0 text-blue-400" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-300">Suggested Expression</span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close suggestion panel"
              className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>

          <AiGeneratedStateLabel testId="suggest-expression-assistance-label" />

          <AiSuggestionComparisonBlock
            testId="suggest-expression-comparison"
            currentExpression={currentExpression}
            suggestedExpression={state.result.expression}
            currentLabel="Current expression"
            suggestedLabel="Generated suggestion"
            emptyCurrentText="No existing expression"
          />

          {/* Result area */}
          <div aria-live="polite">
            <label htmlFor="suggest-expression-review" className="mb-1 block text-xs text-slate-400">
              Review and edit expression
            </label>
            <textarea
              id="suggest-expression-review"
              aria-label="Suggested expression editor"
              value={reviewExpression}
              onChange={(e) => {
                setReviewExpression(e.target.value);
              }}
              rows={4}
              className="mb-2 block w-full resize-y rounded border border-slate-700 bg-slate-900/60 p-2 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            {state.result.explanation ? (
              <p className="mb-2 text-xs leading-relaxed text-slate-400">
                {state.result.explanation}
              </p>
            ) : null}

            {diagnosticsToShow.length > 0 ? (
              <div
                className="mb-2 rounded border border-amber-700/60 bg-slate-900/40 p-2"
                data-testid="suggest-expression-validation"
              >
                <p className="mb-1 text-[11px] font-medium text-amber-300">
                  Validation issues must be fixed before accepting.
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
                  {diagnosticsToShow.map((diagnostic, idx) => (
                    <li key={`${diagnostic.code}-${idx}`}>
                      {diagnostic.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-2 text-[11px] text-green-300" data-testid="suggest-expression-valid">
                Expression is valid and ready to apply.
              </p>
            )}

            {!canAccept ? (
              <p className="mb-2 text-[11px] text-amber-300" data-testid="suggest-expression-accept-gated">
                Accept is disabled until the reviewed expression validates.
              </p>
            ) : null}
          </div>

          {/* Button row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onAccept(normalizedReviewExpression);
              }}
              disabled={!canAccept}
              aria-label="Accept suggested expression"
              className={[
                'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                canAccept
                  ? 'border-blue-700 text-blue-400 hover:border-blue-500 hover:text-blue-300'
                  : 'cursor-not-allowed border-slate-700 text-slate-600',
              ].join(' ')}
            >
              <Check size={11} aria-hidden="true" />
              Accept
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss suggestion"
              className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error phase                                                          */}
      {/* ------------------------------------------------------------------ */}
      {isError && (
        <>
          {/* Header */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                size={13}
                className="shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-slate-300">Suggest Error</span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss suggestion error"
              className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>

          <div
            aria-live="polite"
            className="rounded border border-amber-700/60 bg-slate-900/40 p-2"
          >
            <p className="mb-2 text-xs leading-relaxed text-slate-400">{state.error}</p>
          </div>

          {/* Button row */}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Re-open input so user can try again
                onDismiss();
              }}
              aria-label="Try again"
              className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Try again
            </button>

            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss suggestion error"
              className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
