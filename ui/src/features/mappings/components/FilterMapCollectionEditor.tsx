/**
 * FilterMapCollectionEditor.tsx — FS-043 T-05
 *
 * Collection editor for Filter + Map mode.
 * Extends MapCollectionEditor with a filter predicate section below the source picker.
 *
 * Shows a collapsed summary "Filter: [predicate summary]" when the predicate section
 * is collapsed. Expands to show FilterPredicateEditor.
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { MapCollectionEditor } from './MapCollectionEditor';
import { FilterPredicateEditor } from './FilterPredicateEditor';
import type { FilterPredicateState } from '../lib/array-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterMapCollectionEditorProps {
  readonly sourceArrayPath: string;
  readonly filterPredicate: FilterPredicateState;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly onSourceArrayPathChange: (path: string) => void;
  readonly onFilterPredicateChange: (predicate: FilterPredicateState) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function predicateSummary(predicate: FilterPredicateState): string {
  if (predicate.kind === 'raw') {
    const dsl = predicate.dsl.trim();
    return dsl ? (dsl.length > 40 ? dsl.slice(0, 40) + '…' : dsl) : 'No condition set';
  }
  const { left, operator, right } = predicate;
  const leftStr =
    left.kind === 'itemField' && left.fieldPath
      ? `item("${left.fieldPath}")`
      : '…';
  const opLabels: Record<string, string> = {
    eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
    isNull: 'is null', isNotNull: 'is not null',
  };
  const opStr = opLabels[operator] ?? operator;
  if (operator === 'isNull' || operator === 'isNotNull') {
    return `${leftStr} ${opStr}`;
  }
  const rightStr =
    right.kind === 'static' && right.value
      ? right.value
      : right.kind === 'sourceField' && right.path
        ? `source("${right.path}")`
        : '…';
  return `${leftStr} ${opStr} ${rightStr}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FilterMapCollectionEditor({
  sourceArrayPath,
  filterPredicate,
  parsedSourceSchema,
  onSourceArrayPathChange,
  onFilterPredicateChange,
  className = '',
}: FilterMapCollectionEditorProps) {
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);

  const summary = predicateSummary(filterPredicate);

  return (
    <div
      data-testid="filter-map-collection-editor"
      className={['space-y-4', className].filter(Boolean).join(' ')}
    >
      {/* Source array picker — reused from Map mode */}
      <MapCollectionEditor
        sourceArrayPath={sourceArrayPath}
        parsedSourceSchema={parsedSourceSchema}
        onSourceArrayPathChange={onSourceArrayPathChange}
      />

      {/* Divider */}
      <div className="h-px bg-slate-700/60" />

      {/* Filter predicate section */}
      <div className="space-y-2">
        {/* Section header with collapse toggle */}
        <button
          type="button"
          data-testid="filter-section-toggle"
          aria-expanded={isFilterExpanded}
          aria-controls="filter-predicate-body"
          onClick={() => { setIsFilterExpanded((prev) => !prev); }}
          className="flex w-full items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
        >
          {isFilterExpanded ? (
            <ChevronDown size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Filter
          </span>
          {!isFilterExpanded && (
            <span
              className="ml-1 min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500"
              data-testid="filter-predicate-summary"
            >
              {summary}
            </span>
          )}
        </button>

        {/* Filter predicate editor */}
        {isFilterExpanded && (
          <div
            id="filter-predicate-body"
            className="rounded-lg border border-slate-700 bg-slate-800/40 p-3"
          >
            <FilterPredicateEditor
              predicate={filterPredicate}
              parsedSourceSchema={parsedSourceSchema}
              onPredicateChange={onFilterPredicateChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
