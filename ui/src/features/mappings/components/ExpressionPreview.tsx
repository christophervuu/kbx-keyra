/**
 * ExpressionPreview — Displays the current DSL expression and its evaluated result.
 *
 * Renders:
 * - The final DSL expression string (syntax-highlighted)
 * - The live evaluated result (formatted by type) or a placeholder/error
 * - A loading indicator while debounce/evaluation is in progress
 *
 * @see useExpressionPreview hook
 * @see AE-08
 */

import { tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslTokenType } from '../lib/dsl-tokenizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpressionPreviewProps {
  /** The DSL expression string (may be empty). */
  readonly expression: string;
  /** Evaluated result value — null if no data, empty expression, or error. */
  readonly result: unknown | null;
  /** Error message when evaluation fails — null on success. */
  readonly error: string | null;
  /** True while evaluation is debouncing or running. */
  readonly isEvaluating: boolean;
  /** Whether sample source data is available. Controls placeholder vs result display. */
  readonly hasSourceData: boolean;
}

// ---------------------------------------------------------------------------
// Token class map (mirrors RawDslEditor)
// ---------------------------------------------------------------------------

const TOKEN_CLASS: Record<DslTokenType, string> = {
  'function-name': 'text-blue-400',
  'string-literal': 'text-green-400',
  'number-literal': 'text-orange-400',
  'boolean-literal': 'text-purple-400',
  'null-literal': 'text-gray-400',
  punctuation: 'text-slate-300',
  comma: 'text-slate-400',
  brace: 'text-yellow-300',
  colon: 'text-yellow-300',
  whitespace: '',
  unknown: 'text-red-400',
};

// ---------------------------------------------------------------------------
// Result formatting helpers
// ---------------------------------------------------------------------------

/** Returns the Tailwind color class for a primitive result value. */
function resultColorClass(value: unknown): string {
  if (value === null) return 'text-zinc-400';
  if (typeof value === 'string') return 'text-green-400';
  if (typeof value === 'number') return 'text-orange-400';
  if (typeof value === 'boolean') return 'text-purple-400';
  return 'text-zinc-200';
}

/** Formats a result value for display. Complex values are JSON-stringified. */
function formatResult(value: unknown): { display: string; isComplex: boolean } {
  if (value === null) return { display: 'null', isComplex: false };
  if (typeof value === 'string') return { display: `"${value}"`, isComplex: false };
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { display: String(value), isComplex: false };
  }
  // Object or Array — truncate to 10 lines
  const full = JSON.stringify(value, null, 2);
  const lines = full.split('\n');
  const truncated = lines.length > 10
    ? lines.slice(0, 10).join('\n') + '\n  ...'
    : full;
  return { display: truncated, isComplex: true };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SyntaxHighlightedExpression({ expression }: { readonly expression: string }) {
  const tokens = tokenizeDsl(expression);
  return (
    <code className="font-mono text-xs break-all" data-testid="preview-expression-highlighted">
      {tokens.map((token) => {
        const cls = TOKEN_CLASS[token.type];
        return cls ? (
          <span key={token.start} className={cls}>{token.text}</span>
        ) : (
          <span key={token.start}>{token.text}</span>
        );
      })}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Expression preview area — always visible below the editor/builder.
 * Shows the expression string and the live evaluated result (or placeholders).
 */
export function ExpressionPreview({
  expression,
  result,
  error,
  isEvaluating,
  hasSourceData,
}: ExpressionPreviewProps) {
  const isEmpty = expression.trim() === '';

  return (
    <div
      className="border border-zinc-700 rounded-md overflow-hidden text-xs"
      data-testid="expression-preview"
    >
      {/* Expression section */}
      <div className="px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/60">
        <span className="text-zinc-500 uppercase tracking-wide text-[10px] font-semibold mr-2">
          Expression
        </span>
        {isEmpty ? (
          <span className="text-zinc-600 italic" data-testid="preview-expression-empty">
            No expression
          </span>
        ) : (
          <SyntaxHighlightedExpression expression={expression} />
        )}
      </div>

      {/* Result section */}
      <div className="px-3 py-2 bg-zinc-900/40">
        <span className="text-zinc-500 uppercase tracking-wide text-[10px] font-semibold mr-2">
          Result
        </span>

        {/* Empty expression */}
        {isEmpty && (
          <span className="text-zinc-600 italic" data-testid="preview-result-no-expression">
            Enter an expression above to see a preview.
          </span>
        )}

        {/* No source data */}
        {!isEmpty && !hasSourceData && !isEvaluating && (
          <span className="text-zinc-500 italic" data-testid="preview-result-no-data">
            Load sample data in the Preview panel to see live results.
          </span>
        )}

        {/* Evaluating / loading */}
        {!isEmpty && hasSourceData && isEvaluating && (
          <span
            className="inline-flex items-center gap-1.5 text-zinc-400"
            role="status"
            aria-label="Evaluating expression"
            data-testid="preview-result-loading"
          >
            <span
              className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-blue-400 rounded-full animate-spin"
              aria-hidden="true"
            />
            Evaluating…
          </span>
        )}

        {/* Error */}
        {!isEmpty && hasSourceData && !isEvaluating && error !== null && (
          <span
            className="inline-flex items-center gap-1 text-red-400"
            role="alert"
            data-testid="preview-result-error"
          >
            <span className="font-mono bg-red-900/40 px-1 rounded text-red-300">error</span>
            {error}
          </span>
        )}

        {/* Success result */}
        {!isEmpty && hasSourceData && !isEvaluating && error === null && result !== null && (
          (() => {
            const { display, isComplex } = formatResult(result);
            return isComplex ? (
              <pre
                className="mt-1 font-mono text-zinc-200 whitespace-pre-wrap overflow-x-auto"
                data-testid="preview-result-complex"
              >
                {display}
              </pre>
            ) : (
              <span
                className={['font-mono', resultColorClass(result)].join(' ')}
                data-testid="preview-result-primitive"
              >
                {display}
              </span>
            );
          })()
        )}

        {/* null result (without error) */}
        {!isEmpty && hasSourceData && !isEvaluating && error === null && result === null && (
          <span className="font-mono text-zinc-400" data-testid="preview-result-null">
            null
          </span>
        )}
      </div>
    </div>
  );
}
