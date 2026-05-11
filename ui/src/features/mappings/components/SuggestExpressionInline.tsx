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
import { useEffect, useRef, useState } from 'react';

import type { SuggestExpressionState } from '../hooks/use-suggest-expression';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SuggestExpressionInlineProps {
  /** Current state from useSuggestExpression hook */
  state: SuggestExpressionState;
  /** Target field context for display */
  targetPath: string;
  targetType: string;
  /** Callback: user clicks Generate */
  onGenerate: (instruction: string) => void;
  /** Callback: user clicks Accept */
  onAccept: (expression: string) => void;
  /** Callback: user clicks Dismiss or Cancel */
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestExpressionInline({
  state,
  targetPath,
  targetType,
  onGenerate,
  onAccept,
  onDismiss,
}: SuggestExpressionInlineProps) {
  const [instruction, setInstruction] = useState('');
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
      setInstruction('');
    }
  }, [state.status]);

  if (state.status === 'idle') {
    return null;
  }

  const trimmedInstruction = instruction.trim();
  const canGenerate = trimmedInstruction.length > 0;

  function handleGenerate() {
    if (canGenerate) {
      onGenerate(trimmedInstruction);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

          {/* Result area */}
          <div aria-live="polite">
            <code className="mb-2 block break-all whitespace-pre-wrap rounded border border-slate-700 bg-slate-900/60 p-2 font-mono text-xs text-slate-200">
              {state.result.expression}
            </code>

            {state.result.explanation ? (
              <p className="mb-2 text-xs leading-relaxed text-slate-400">
                {state.result.explanation}
              </p>
            ) : null}
          </div>

          {/* Button row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept(state.result!.expression)}
              aria-label="Accept suggested expression"
              className="flex items-center gap-1.5 rounded border border-blue-700 px-2.5 py-1 text-xs text-blue-400 transition-colors hover:border-blue-500 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
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
