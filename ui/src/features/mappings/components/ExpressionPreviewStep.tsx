/**
 * ExpressionPreviewStep — Step 4 of the guided DSL builder.
 *
 * Displays the fully-generated DSL expression string with:
 *  - Syntax highlighting (via tokenizeDsl from T-02)
 *  - Validation status (✓ valid / ✗ error with message)
 *  - "Copy expression" button
 *  - Placeholder for live evaluation (T-10)
 */

import { useCallback, useState } from 'react';

import { tokenizeDsl } from '../lib/dsl-tokenizer';

// ---------------------------------------------------------------------------
// Token colour map (mirrors RawDslEditor colour scheme)
// ---------------------------------------------------------------------------

const TOKEN_COLOURS: Record<string, string> = {
  function: 'text-blue-300',
  string: 'text-green-300',
  number: 'text-orange-300',
  boolean: 'text-yellow-300',
  null: 'text-zinc-400',
  punctuation: 'text-zinc-300',
  operator: 'text-pink-300',
  identifier: 'text-zinc-100',
  whitespace: '',
  unknown: 'text-zinc-400',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionPreviewStepProps {
  readonly expression: string;
  readonly isValid: boolean;
  readonly validationError?: string;
  readonly onUseExpression: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpressionPreviewStep({
  expression,
  isValid,
  validationError,
  onUseExpression,
}: ExpressionPreviewStepProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(expression);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    } catch {
      // Clipboard API unavailable — silently fail
    }
  }, [expression]);

  const tokens = tokenizeDsl(expression);

  return (
    <div className="flex flex-col gap-4 p-2" data-testid="expression-preview-step">
      {/* Syntax-highlighted expression */}
      <div>
        <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">Generated Expression</p>
        <div
          className="font-mono text-sm bg-zinc-900 border border-zinc-700 rounded p-3 overflow-x-auto"
          aria-label="Generated DSL expression"
          data-testid="expression-preview-highlighted"
        >
          {tokens.map((token, i) => (
            <span
              key={i}
              className={TOKEN_COLOURS[token.type] ?? ''}
            >
              {token.text}
            </span>
          ))}
        </div>
      </div>

      {/* Validation status */}
      <div
        role="status"
        aria-live="polite"
        className={[
          'flex items-center gap-2 text-sm rounded px-3 py-2',
          isValid
            ? 'bg-green-900/40 border border-green-800/50 text-green-300'
            : 'bg-red-900/40 border border-red-800/50 text-red-300',
        ].join(' ')}
        data-testid="expression-validation-status"
      >
        {isValid ? (
          <>
            <span aria-hidden="true">✓</span>
            <span>Expression is valid</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">✗</span>
            <span>{validationError ?? 'Expression contains errors'}</span>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onUseExpression}
          disabled={!isValid}
          className="px-3 py-1.5 text-sm rounded font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          data-testid="use-expression-btn"
        >
          Use Expression
        </button>
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          aria-label="Copy expression to clipboard"
          className="px-3 py-1.5 text-sm rounded font-medium bg-zinc-700 text-zinc-200 hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          data-testid="copy-expression-btn"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Evaluation placeholder (T-10) */}
      <div className="text-xs text-zinc-500 italic">
        Load sample data to see a live evaluation result (available in T-10).
      </div>
    </div>
  );
}
