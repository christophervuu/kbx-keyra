/**
 * ArrayResultPreview.tsx — FS-043 T-13
 *
 * Array-specific result preview for the Array Builder's feedback area.
 *
 * Handles four result states:
 *   1. No source data  — "Load test data to see preview"
 *   2. Evaluating      — animated pulse skeleton
 *   3. Error           — red error message
 *   4. null result     — "No result" with contextual hint
 *   5. Empty array []  — "Empty array" with mode-specific hint (AE-03)
 *   6. Array result    — item count badge + first 10 items as formatted JSON
 *                        + "Showing N of M items" summary + expand toggle (AE-01)
 *                        + merge branch contribution summary when derivable (AE-04)
 *
 * Merge branch contribution (AE-04):
 *   - For `merge(a, b, ...)` expressions, each branch sub-expression is evaluated
 *     separately to get individual item counts.
 *   - If sub-evaluation is impractical, positional heuristic is used and marked "(estimated)".
 *
 * Props:
 *   - `result`         — evaluated result from useExpressionPreview
 *   - `error`          — error string from useExpressionPreview
 *   - `isEvaluating`   — debounce/evaluation pending flag
 *   - `sourceData`     — raw source data (null = no data loaded)
 *   - `mode`           — current ArrayBuilderMode (drives contextual hints)
 *   - `expression`     — current DSL expression (used for merge branch sub-evaluation)
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, GitMerge, List } from 'lucide-react';

import { evaluateExpression, resolvePath } from '@/lib/engine';
import type { ArrayBuilderMode, ObjectFieldsCollectionState } from '../lib/array-builder-state';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TRUNCATION = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrayResultPreviewProps {
  /** Evaluated result value from useExpressionPreview. */
  readonly result: unknown | null;
  /** Error message from useExpressionPreview. */
  readonly error: string | null;
  /** True while debounce/evaluation is pending. */
  readonly isEvaluating: boolean;
  /** Source data passed to the preview engine. Null = no data loaded. */
  readonly sourceData: unknown | null;
  /** Current Array Builder mode — drives contextual hint messages. */
  readonly mode: ArrayBuilderMode;
  /** Current DSL expression — used for merge branch sub-evaluation. */
  readonly expression: string;
  /** Optional objectFields state for object-fields preview summaries. */
  readonly objectFieldsState?: ObjectFieldsCollectionState | null;
}

interface ObjectFieldsPreviewSummary {
  readonly configuredCount: number;
  readonly includedCount: number;
  readonly skippedCount: number;
  readonly generatedCount: number;
  readonly outputOrder: readonly string[];
  readonly parentMissing: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a single array item as compact JSON (2-space indent, max 200 chars).
 */
function formatItem(item: unknown): string {
  try {
    const json = JSON.stringify(item, null, 2);
    if (json.length > 200) {
      return json.slice(0, 197) + '…';
    }
    return json;
  } catch {
    return String(item);
  }
}

/**
 * Derive a brief structural summary for an item (field count or primitive type).
 */
function itemSummary(item: unknown): string {
  if (item === null) return 'null';
  if (Array.isArray(item)) return `[${item.length} items]`;
  if (typeof item === 'object') {
    const keys = Object.keys(item as object);
    return `{${keys.length} field${keys.length !== 1 ? 's' : ''}}`;
  }
  return typeof item;
}

/**
 * Parse a `merge(a, b, ...)` expression and return the sub-expressions.
 * Returns null if the expression is not a top-level merge call.
 */
function parseMergeBranchExpressions(expression: string): string[] | null {
  const trimmed = expression.trim();
  // Match merge(...) at the top level
  const mergeMatch = trimmed.match(/^merge\s*\(([\s\S]*)\)$/);
  if (!mergeMatch) return null;

  // Split on top-level commas (respecting nested parens/brackets/braces)
  const inner = mergeMatch[1];
  const branches: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      branches.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = inner.slice(start).trim();
  if (last) branches.push(last);

  return branches.length >= 2 ? branches : null;
}

/**
 * Evaluate each branch sub-expression and return item counts.
 * Returns null if evaluation fails for any branch.
 */
function evaluateBranchCounts(
  branches: string[],
  sourceData: unknown,
): { counts: number[]; estimated: boolean } | null {
  try {
    const counts: number[] = [];
    for (const branch of branches) {
      const { value, error } = evaluateExpression(branch, sourceData as Record<string, unknown>);
      if (error || !Array.isArray(value)) return null;
      counts.push(value.length);
    }
    return { counts, estimated: false };
  } catch {
    return null;
  }
}

function deriveObjectFieldsSummary(
  sourceData: unknown,
  result: unknown,
  objectFieldsState: ObjectFieldsCollectionState | null | undefined,
): ObjectFieldsPreviewSummary | null {
  if (!objectFieldsState) return null;

  const configuredCount = objectFieldsState.orderedChildKeys.length;
  const generatedCount = Array.isArray(result) ? result.length : 0;

  if (configuredCount === 0) {
    return {
      configuredCount: 0,
      includedCount: 0,
      skippedCount: 0,
      generatedCount,
      outputOrder: [],
      parentMissing: false,
    };
  }

  if (objectFieldsState.parent.input.kind !== 'primary') {
    const includedCount = Math.min(configuredCount, generatedCount);
    return {
      configuredCount,
      includedCount,
      skippedCount: configuredCount - includedCount,
      generatedCount,
      outputOrder: objectFieldsState.orderedChildKeys.slice(0, includedCount),
      parentMissing: false,
    };
  }

  const parentPath = objectFieldsState.parent.objectPath.trim();
  const parentValue = parentPath ? resolvePath(sourceData, parentPath) : null;
  if (parentValue === null || parentValue === undefined || typeof parentValue !== 'object' || Array.isArray(parentValue)) {
    return {
      configuredCount,
      includedCount: 0,
      skippedCount: configuredCount,
      generatedCount,
      outputOrder: [],
      parentMissing: true,
    };
  }

  const objectRecord = parentValue as Record<string, unknown>;
  const includedKeys: string[] = [];
  for (const key of objectFieldsState.orderedChildKeys) {
    const value = objectRecord[key];
    if (value !== null && value !== undefined) includedKeys.push(key);
  }

  return {
    configuredCount,
    includedCount: includedKeys.length,
    skippedCount: configuredCount - includedKeys.length,
    generatedCount,
    outputOrder: includedKeys,
    parentMissing: false,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ItemCountBadge({ count }: { count: number }) {
  return (
    <span
      data-testid="array-preview-item-count"
      className="inline-flex items-center gap-1 rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-300"
    >
      <List size={9} aria-hidden="true" />
      {count} {count === 1 ? 'item' : 'items'}
    </span>
  );
}

function MergeBranchSummary({
  expression,
  sourceData,
  totalCount,
}: {
  expression: string;
  sourceData: unknown;
  totalCount: number;
}) {
  const contribution = useMemo(() => {
    const branches = parseMergeBranchExpressions(expression);
    if (!branches) return null;

    // Attempt real sub-evaluation
    const real = evaluateBranchCounts(branches, sourceData);
    if (real) return real;

    // Heuristic: assume items appear in branch order with equal distribution
    // (best-effort only — mark as estimated)
    const perBranch = Math.floor(totalCount / branches.length);
    const remainder = totalCount % branches.length;
    const counts = branches.map((_, i) => perBranch + (i < remainder ? 1 : 0));
    return { counts, estimated: true };
  }, [expression, sourceData, totalCount]);

  if (!contribution) return null;

  return (
    <div
      data-testid="array-preview-branch-summary"
      className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400"
    >
      <GitMerge size={9} aria-hidden="true" className="text-violet-400" />
      {contribution.counts.map((count, i) => (
        <span key={i}>
          <span className="text-slate-500">Branch {i + 1}:</span>{' '}
          <span className="text-slate-300">{count} {count === 1 ? 'item' : 'items'}</span>
          {i < contribution.counts.length - 1 && (
            <span className="text-slate-600 ml-1">•</span>
          )}
        </span>
      ))}
      {contribution.estimated && (
        <span className="text-slate-600">(estimated)</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArrayResultPreview({
  result,
  error,
  isEvaluating,
  sourceData,
  mode,
  expression,
  objectFieldsState,
}: ArrayResultPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const objectFieldsSummary = useMemo(
    () => (mode === 'objectFields' ? deriveObjectFieldsSummary(sourceData, result, objectFieldsState) : null),
    [mode, objectFieldsState, result, sourceData],
  );

  // No source data
  if (sourceData === null || sourceData === undefined) {
    return (
      <span
        className="italic text-zinc-600"
        data-testid="array-preview-no-data"
      >
        Load test data to see preview.
      </span>
    );
  }

  // Evaluating
  if (isEvaluating) {
    return (
      <span
        className="inline-block h-3 w-24 animate-pulse rounded bg-zinc-700"
        role="status"
        aria-label="Evaluating…"
        data-testid="array-preview-loading"
      />
    );
  }

  // Error
  if (error !== null) {
    return (
      <span className="text-red-400" data-testid="array-preview-error">
        {error}
      </span>
    );
  }

  // Null result
  if (result === null || result === undefined) {
    const hint =
      mode === 'map' || mode === 'filterMap'
        ? 'Source array path may not exist in the test data.'
        : mode === 'mergeArrayBranches'
          ? 'One or more branch source arrays may not exist in the test data.'
          : 'The expression returned no result.';
    return (
      <div data-testid="array-preview-null" className="space-y-1">
        <span className="text-zinc-500">No result</span>
        <p className="text-[10px] text-zinc-600">{hint}</p>
      </div>
    );
  }

  // Empty array
  if (Array.isArray(result) && result.length === 0) {
    const hint =
      mode === 'objectFields' && objectFieldsSummary?.parentMissing
        ? 'Parent object is missing in source data; configured fields were skipped.'
        : mode === 'filterMap'
        ? 'Filter condition excluded all elements.'
        : mode === 'buildFromValues'
          ? 'No value entries produced output.'
          : mode === 'mergeArrayBranches'
            ? 'All branches returned empty arrays.'
            : 'The source array is empty.';
    return (
      <div data-testid="array-preview-empty" className="space-y-1">
        {objectFieldsSummary && (
          <div
            data-testid="array-preview-objectfields-summary"
            className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1.5 text-[10px] text-slate-300"
          >
            <div>
              configured: <span data-testid="array-preview-of-configured">{objectFieldsSummary.configuredCount}</span> • included: <span data-testid="array-preview-of-included">{objectFieldsSummary.includedCount}</span> • skipped: <span data-testid="array-preview-of-skipped">{objectFieldsSummary.skippedCount}</span> • generated: <span data-testid="array-preview-of-generated">{objectFieldsSummary.generatedCount}</span>
            </div>
            <div data-testid="array-preview-of-order" className="mt-0.5 text-slate-400">
              output order: {objectFieldsSummary.outputOrder.length > 0 ? objectFieldsSummary.outputOrder.join(', ') : '(none)'}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="font-mono text-zinc-400">[]</span>
          <span className="text-[10px] text-zinc-500">Empty array</span>
        </div>
        <p className="text-[10px] text-zinc-600">{hint}</p>
      </div>
    );
  }

  // Non-array result (expression returned a scalar — shouldn't happen for array mode but handle gracefully)
  if (!Array.isArray(result)) {
    return (
      <span className="text-amber-400" data-testid="array-preview-non-array">
        {JSON.stringify(result)}
      </span>
    );
  }

  // Array result
  const totalCount = result.length;
  const isTruncated = totalCount > DEFAULT_TRUNCATION && !expanded;
  const visibleItems = isTruncated ? result.slice(0, DEFAULT_TRUNCATION) : result;

  return (
    <div data-testid="array-preview-result" className="space-y-2">
      {objectFieldsSummary && (
        <div
          data-testid="array-preview-objectfields-summary"
          className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1.5 text-[10px] text-slate-300"
        >
          <div>
            configured: <span data-testid="array-preview-of-configured">{objectFieldsSummary.configuredCount}</span> • included: <span data-testid="array-preview-of-included">{objectFieldsSummary.includedCount}</span> • skipped: <span data-testid="array-preview-of-skipped">{objectFieldsSummary.skippedCount}</span> • generated: <span data-testid="array-preview-of-generated">{objectFieldsSummary.generatedCount}</span>
          </div>
          <div data-testid="array-preview-of-order" className="mt-0.5 text-slate-400">
            output order: {objectFieldsSummary.outputOrder.length > 0 ? objectFieldsSummary.outputOrder.join(', ') : '(none)'}
          </div>
        </div>
      )}

      {/* Header: item count badge + merge branch summary */}
      <div className="flex flex-wrap items-center gap-2">
        <ItemCountBadge count={totalCount} />
        {mode === 'mergeArrayBranches' && (
          <MergeBranchSummary
            expression={expression}
            sourceData={sourceData}
            totalCount={totalCount}
          />
        )}
      </div>

      {/* Item list */}
      <ol
        className="space-y-1"
        aria-label={`Array preview — ${totalCount} items`}
        data-testid="array-preview-items"
      >
        {visibleItems.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5"
          >
            <span className="shrink-0 text-[9px] text-zinc-600 mt-0.5 w-4 text-right">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <span className="text-[9px] text-zinc-600">{itemSummary(item)}</span>
              <pre className="font-mono text-[10px] text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                {formatItem(item)}
              </pre>
            </div>
          </li>
        ))}
      </ol>

      {/* Truncation summary + expand toggle */}
      {totalCount > DEFAULT_TRUNCATION && (
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] text-zinc-500"
            data-testid="array-preview-truncation-summary"
          >
            {expanded
              ? `Showing all ${totalCount} items`
              : `Showing ${DEFAULT_TRUNCATION} of ${totalCount} items`}
          </span>
          <button
            type="button"
            data-testid="array-preview-expand-toggle"
            onClick={() => setExpanded((v) => !v)}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700',
            ].join(' ')}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse to first 10 items' : `Expand to show all ${totalCount} items`}
          >
            {expanded ? (
              <>
                <ChevronUp size={9} aria-hidden="true" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown size={9} aria-hidden="true" />
                Show all
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
