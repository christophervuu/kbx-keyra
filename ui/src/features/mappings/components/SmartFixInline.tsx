import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, WandSparkles, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import type { SmartFixState } from '../hooks/use-smart-fix';
import { AiGeneratedStateLabel, AiSuggestionComparisonBlock } from './AiSuggestionReviewPrimitives';

import { defaultRegistry, inferExpressionType, parse } from '@/lib/engine';
import type { Diagnostic } from '@/lib/types/domain';

export interface SmartFixInlineProps {
  state: SmartFixState;
  targetPath: string;
  targetType: string;
  currentExpression?: string | null;
  localStaleMessage?: string | null;
  onAccept: (expression: string) => void;
  onRetry: () => void;
  onRerunLatest: () => void;
  onDismiss: () => void;
}

function normalizeType(type: string): string {
  return type === 'integer' ? 'number' : type;
}

function validateExpression(
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
          message: 'Expression is required before applying Smart Fix.',
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
      diagnostics: diagnostics.length > 0
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

export function SmartFixInline({
  state,
  targetPath,
  targetType,
  currentExpression = null,
  localStaleMessage = null,
  onAccept,
  onRetry,
  onRerunLatest,
  onDismiss,
}: SmartFixInlineProps) {
  const isLoading = state.status === 'loading';
  const isSuccess = state.status === 'success-valid' || state.status === 'success-invalid';
  const isError = state.status === 'error';
  const isStale = state.status === 'stale-mismatch' || localStaleMessage !== null;

  const [reviewExpression, setReviewExpression] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isSuccess && state.result) {
      setReviewExpression(state.result.suggestedExpression);
      setIsEditing(state.status === 'success-invalid');
    }
  }, [isSuccess, state.result, state.status]);

  useEffect(() => {
    if (isEditing) {
      editorRef.current?.focus();
    }
  }, [isEditing]);

  const trimmedReview = reviewExpression.trim();
  const localValidation = useMemo(() => validateExpression(trimmedReview, targetType), [trimmedReview, targetType]);

  if (state.status === 'idle') {
    return null;
  }

  const isUneditedSuggestion =
    isSuccess && state.result
      ? trimmedReview === state.result.suggestedExpression.trim()
      : false;

  const diagnosticsToShow =
    isSuccess && state.result && isUneditedSuggestion
      ? state.result.validation.diagnostics
      : localValidation.diagnostics;

  const canAccept =
    isSuccess && state.result
      ? isStale
        ? false
        : isUneditedSuggestion
          ? state.status === 'success-valid' && state.result.readyToApply
          : localValidation.valid
      : false;

  function handleEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canAccept) {
      e.preventDefault();
      onAccept(trimmedReview);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  }

  return (
    <div
      data-testid="smart-fix-inline"
      role="region"
      aria-label="Smart Fix"
      className="mt-2 rounded-lg border border-slate-700 bg-slate-800/80 p-3"
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-slate-300" data-testid="smart-fix-loading">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          Generating Smart Fix…
        </div>
      )}

      {isStale && (
        <div className="rounded border border-amber-700/60 bg-slate-900/40 p-2" data-testid="smart-fix-stale">
          <p className="text-xs text-amber-300">
            {localStaleMessage ?? state.error ?? 'Suggestion is stale and cannot be applied directly.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRerunLatest}
              aria-label="Re-run fix on latest rule"
              className="flex items-center gap-1.5 rounded border border-amber-600 px-2.5 py-1 text-xs text-amber-200 transition-colors hover:border-amber-500 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              <RefreshCw size={11} aria-hidden="true" />
              Re-run on latest rule
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss Smart Fix"
              className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isSuccess && state.result && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <WandSparkles size={13} className="shrink-0 text-blue-400" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-300">Smart Fix suggestion</span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close Smart Fix panel"
              className="rounded p-0.5 text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>

          <AiGeneratedStateLabel testId="smart-fix-assistance-label" />

          <p className="mb-2 text-xs text-slate-500">
            Fix suggestion for <span className="font-mono text-slate-400">{targetPath}</span>
          </p>

          <AiSuggestionComparisonBlock
            testId="smart-fix-comparison"
            currentExpression={currentExpression ?? state.result.originalExpression}
            suggestedExpression={state.result.suggestedExpression}
            currentLabel="Current expression"
            suggestedLabel="Generated fix"
            emptyCurrentText="No existing expression"
          />

          <div aria-live="polite">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor="smart-fix-review" className="text-xs text-slate-400">
                Suggested expression
              </label>
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                aria-label={isEditing ? 'Stop editing Smart Fix suggestion' : 'Edit Smart Fix suggestion'}
                data-testid="smart-fix-edit-btn"
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              >
                {isEditing ? 'Editing' : 'Edit'}
              </button>
            </div>

            <textarea
              id="smart-fix-review"
              ref={editorRef}
              aria-label="Smart Fix expression editor"
              value={reviewExpression}
              onChange={(e) => setReviewExpression(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              readOnly={!isEditing}
              rows={4}
              className={[
                'mb-2 block w-full resize-y rounded border bg-slate-900/60 p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500',
                isEditing
                  ? 'border-slate-700 text-slate-200'
                  : 'border-slate-800 text-slate-400',
              ].join(' ')}
            />

            <p className="mb-2 text-xs leading-relaxed text-slate-400" data-testid="smart-fix-explanation">
              {state.result.explanation}
            </p>

            {diagnosticsToShow.length > 0 ? (
              <div
                className="mb-2 rounded border border-amber-700/60 bg-slate-900/40 p-2"
                data-testid="smart-fix-validation"
              >
                <p className="mb-1 text-[11px] font-medium text-amber-300">
                  Validation issues must be fixed before accepting.
                </p>
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
                  {diagnosticsToShow.map((diagnostic, idx) => (
                    <li key={`${diagnostic.code}-${idx}`}>{diagnostic.message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mb-2 text-[11px] text-green-300" data-testid="smart-fix-valid">
                Expression is valid and ready to apply.
              </p>
            )}

            {!canAccept && (
              <p className="mb-2 text-[11px] text-amber-300" data-testid="smart-fix-accept-gated">
                Accept is disabled until the reviewed expression validates.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept(trimmedReview)}
              disabled={!canAccept}
              aria-label="Accept Smart Fix"
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
              aria-label="Dismiss Smart Fix"
              className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              Dismiss
            </button>
          </div>
        </>
      )}

      {isError && !isStale && (
        <>
          <div className="mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-400" aria-hidden="true" />
            <span className="text-xs font-medium text-slate-300">Smart Fix failed</span>
          </div>
          <div className="rounded border border-amber-700/60 bg-slate-900/40 p-2" data-testid="smart-fix-error">
            <p className="text-xs text-slate-300">{state.error}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              aria-label="Retry Smart Fix"
              className="flex items-center gap-1.5 rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <Sparkles size={11} aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss Smart Fix error"
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
