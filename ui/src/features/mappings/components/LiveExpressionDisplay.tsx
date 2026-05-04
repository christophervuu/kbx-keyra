/**
 * LiveExpressionDisplay — always-visible generated DSL expression (FS-023 T-07).
 *
 * Shows the current expression in a styled code block. Clicking the expression
 * fires `onClickToEdit` to switch to Editor mode.
 */

import { Pencil } from 'lucide-react';
import { tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslTokenType } from '../lib/dsl-tokenizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveExpressionDisplayProps {
  /** The current generated DSL expression string. */
  readonly expression: string;
  /** Fires when the user clicks the expression to switch to Editor mode. */
  readonly onClickToEdit: () => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Token color map
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
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the generated DSL expression with syntax highlighting.
 * Clicking the expression triggers `onClickToEdit`.
 */
export function LiveExpressionDisplay({
  expression,
  onClickToEdit,
  className,
}: LiveExpressionDisplayProps) {
  const tokens = expression ? tokenizeDsl(expression) : [];

  return (
    <div
      className={['space-y-1', className ?? ''].filter(Boolean).join(' ')}
      data-testid="live-expression-display"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Expression
        </span>
        {expression && (
          <button
            type="button"
            onClick={onClickToEdit}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
            title="Click to edit in raw editor mode"
            aria-label="Edit expression in raw editor"
            data-testid="live-expression-edit-btn"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit
          </button>
        )}
      </div>

      <div
        role="button"
        tabIndex={expression ? 0 : -1}
        onClick={expression ? onClickToEdit : undefined}
        onKeyDown={(e) => {
          if (expression && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClickToEdit();
          }
        }}
        title={expression ? 'Click to edit in raw editor mode' : undefined}
        className={[
          'min-h-[2.5rem] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs leading-relaxed',
          expression
            ? 'cursor-pointer hover:border-zinc-500 hover:bg-zinc-800 transition-colors'
            : 'cursor-default',
        ].join(' ')}
        data-testid="live-expression-code"
        aria-label={expression ? 'Generated expression — click to edit' : undefined}
      >
        {expression ? (
          tokens.map((token, i) => (
            <span key={i} className={TOKEN_CLASS[token.type]}>
              {token.text}
            </span>
          ))
        ) : (
          <span className="text-zinc-600 italic" data-testid="live-expression-placeholder">
            Select a source field or enter a static value to begin.
          </span>
        )}
      </div>
    </div>
  );
}
