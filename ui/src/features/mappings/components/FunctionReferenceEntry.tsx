/**
 * FunctionReferenceEntry — A single function card in the Function Reference Panel.
 *
 * Renders the function name (monospace bold), its derived signature, one-line
 * description, and example usage with optional syntax highlighting.
 * Clickable and keyboard-accessible (Enter key fires onInsert).
 */

import type { FunctionCatalogEntry } from '@/lib/data/dsl-functions';
import { tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslTokenType } from '../lib/dsl-tokenizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionReferenceEntryProps {
  readonly entry: FunctionCatalogEntry;
  readonly onInsert: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable parameter signature string. */
function buildSignature(entry: FunctionCatalogEntry): string {
  const params = entry.parameters
    .map((p) => {
      const prefix = p.variadic ? '...' : '';
      const optional = !p.required && !p.variadic ? '?' : '';
      return `${prefix}${p.name}${optional}: ${p.type}`;
    })
    .join(', ');
  return `${entry.name}(${params}): ${entry.returnType}`;
}

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

/** Render a DSL expression string with syntax highlighting. */
function SyntaxHighlightedExample({ expression }: { readonly expression: string }) {
  const tokens = tokenizeDsl(expression);
  return (
    <code className="font-mono text-xs">
      {tokens.map((token) => {
        const cls = TOKEN_CLASS[token.type];
        return cls ? (
          <span key={token.start} className={cls}>
            {token.text}
          </span>
        ) : (
          <span key={token.start}>{token.text}</span>
        );
      })}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a single function catalog entry card.
 * Keyboard accessible: the entire card is a focusable button.
 */
export function FunctionReferenceEntry({ entry, onInsert }: FunctionReferenceEntryProps) {
  const signature = buildSignature(entry);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onInsert();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Insert ${entry.name}: ${entry.description}`}
      onClick={onInsert}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer px-3 py-2.5 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
      data-testid={`fn-entry-${entry.name}`}
    >
      {/* Name + return type inline */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold text-blue-300 group-hover:text-blue-200">
          {entry.name}
        </span>
        <span className="text-xs text-zinc-500 font-mono shrink-0">→ {entry.returnType}</span>
      </div>

      {/* Signature */}
      <div className="mt-0.5 text-xs text-zinc-400 font-mono leading-snug truncate" title={signature}>
        {signature}
      </div>

      {/* Description */}
      <p className="mt-1 text-xs text-zinc-400 group-hover:text-zinc-300 leading-snug line-clamp-2">
        {entry.description}
      </p>

      {/* Example */}
      <div className="mt-1.5 px-2 py-1 bg-zinc-800 group-hover:bg-zinc-750 rounded text-xs leading-relaxed overflow-x-auto">
        <SyntaxHighlightedExample expression={entry.example} />
      </div>
    </div>
  );
}
