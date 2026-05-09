/**
 * ConnectorPrompt — automatically appears when 2+ standalone source cards
 * exist without a wrapping function (AE-04, FS-029 T-05).
 *
 * This is a pure presentational component. The "automatic" behaviour is driven
 * by the parent rendering ConnectorPrompt whenever the builder state is in the
 * `PendingConnector` variant. The component itself just asks the user how to
 * combine the sources and emits the chosen function name.
 *
 * Connector candidates are derived from DSL_FUNCTION_CATALOG by filtering for:
 *   - 2+ required parameters OR a variadic parameter (multi-input capable)
 *   - Not in the `SourceAccess` or `Array` categories
 *
 * Usage:
 *   <ConnectorPrompt
 *     sources={['order.firstName', 'order.lastName']}
 *     onFunctionSelected={(name) => { ... }}
 *   />
 */

import { useState } from 'react';
import { Link2 } from 'lucide-react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { FunctionCatalogEntry } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Connector candidate derivation
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set(['SourceAccess', 'Array']);

/**
 * Returns true if a catalog entry is a valid connector candidate:
 * it accepts 2+ inputs (multi-required params or variadic) and is not
 * in an excluded category.
 */
function isConnectorCandidate(entry: FunctionCatalogEntry): boolean {
  if (EXCLUDED_CATEGORIES.has(entry.category)) return false;
  const requiredCount = entry.parameters.filter((p) => p.required).length;
  const hasVariadic = entry.parameters.some((p) => p.variadic);
  return requiredCount >= 2 || hasVariadic;
}

/**
 * Ordered list of connector candidate entries derived from the catalog.
 * Stable across renders — computed once at module load time.
 */
export const CONNECTOR_CANDIDATES: readonly FunctionCatalogEntry[] = DSL_FUNCTION_CATALOG.filter(
  isConnectorCandidate,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectorPromptProps {
  /**
   * The source field paths currently pending combination.
   * The prompt only renders when this has 2 or more entries.
   */
  readonly sources: readonly string[];
  /**
   * Called when the user selects a combining function.
   * The parent uses this to transition state from PendingConnector → FunctionCall.
   */
  readonly onFunctionSelected: (functionName: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a compact "How should these be combined?" prompt with a function
 * dropdown. Only renders when `sources.length >= 2`.
 */
export function ConnectorPrompt({ sources, onFunctionSelected }: ConnectorPromptProps) {
  const [selected, setSelected] = useState('');

  // Guard: only render with 2+ sources
  if (sources.length < 2) return null;

  const handleChange = (value: string) => {
    setSelected(value);
    if (value !== '') {
      onFunctionSelected(value);
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-dashed border-blue-700/60 bg-blue-950/20"
      data-testid="connector-prompt"
      role="region"
      aria-label="Connector prompt"
    >
      {/* Bridge icon */}
      <Link2
        className="h-4 w-4 text-blue-400 shrink-0"
        aria-hidden="true"
        data-testid="connector-prompt-icon"
      />

      {/* Prompt text */}
      <span
        className="text-xs text-zinc-300 shrink-0"
        data-testid="connector-prompt-label"
      >
        How should these be combined?
      </span>

      {/* Source count badge */}
      <span
        className="text-xs font-mono text-blue-400 bg-blue-900/40 px-1.5 py-0.5 rounded shrink-0"
        data-testid="connector-prompt-source-count"
        aria-label={`${sources.length} sources`}
      >
        {sources.length} sources
      </span>

      {/* Function selector */}
      <select
        value={selected}
        onChange={(e) => { handleChange(e.target.value); }}
        aria-label="Select combining function"
        className="ml-auto bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-blue-500 min-w-[140px]"
        data-testid="connector-prompt-select"
      >
        <option value="" disabled>
          Choose function…
        </option>
        {CONNECTOR_CANDIDATES.map((entry) => (
          <option key={entry.name} value={entry.name} data-testid={`connector-option-${entry.name}`}>
            {entry.name} — {entry.description}
          </option>
        ))}
      </select>
    </div>
  );
}
