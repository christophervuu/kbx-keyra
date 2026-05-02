/**
 * TransformPicker — Step 2 of the guided DSL builder.
 *
 * Renders the DSL function catalog in categorized accordion sections.
 * Users can search by function name and click a function to advance to argument
 * configuration (Step 3).
 *
 * Filters out the `SourceAccess` category — those are handled via SourceFieldPicker.
 *
 * @see DSL_FUNCTION_CATALOG in `ui/src/lib/data/dsl-functions.ts`
 */

import { useMemo, useState } from 'react';

import type { FunctionCatalogEntry, FunctionCategory } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransformPickerProps {
  /** Source field paths selected in Step 1 — used for soft type-compatibility hints */
  readonly selectedSourceFields: readonly string[];
  readonly onFunctionSelect: (functionName: string) => void;
  readonly catalog: readonly FunctionCatalogEntry[];
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Categories shown in the picker — SourceAccess is excluded */
const PICKER_CATEGORIES: FunctionCategory[] = [
  'String',
  'Date',
  'Math',
  'Conditional',
  'Lookup',
  'Array',
  'NullHandling',
  'TypeConversion',
];

const CATEGORY_LABEL: Record<FunctionCategory, string> = {
  String: 'String',
  Date: 'Date & Time',
  Math: 'Math',
  Conditional: 'Conditional',
  Lookup: 'Lookup',
  Array: 'Array',
  NullHandling: 'Null Handling',
  TypeConversion: 'Type Conversion',
  SourceAccess: 'Source Access',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paramLabel(count: FunctionCatalogEntry['parameterCount']): string {
  if (typeof count === 'number') return `${count} param${count === 1 ? '' : 's'}`;
  return `${count} params`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Categorized function picker for Step 2 of the guided builder.
 * All categories default to collapsed except the first one with results.
 */
export function TransformPicker({
  onFunctionSelect,
  catalog,
  className,
}: TransformPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<FunctionCategory>>(
    new Set(['String']),
  );

  // Filter catalog to picker categories and apply search
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return catalog.filter(
      (fn) =>
        PICKER_CATEGORIES.includes(fn.category) &&
        (q === '' || fn.name.toLowerCase().includes(q) || fn.description.toLowerCase().includes(q)),
    );
  }, [catalog, searchQuery]);

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<FunctionCategory, FunctionCatalogEntry[]>();
    for (const cat of PICKER_CATEGORIES) {
      map.set(cat, []);
    }
    for (const fn of filtered) {
      map.get(fn.category)?.push(fn);
    }
    return map;
  }, [filtered]);

  const toggleCategory = (cat: FunctionCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  // Auto-expand all categories when searching
  const effectiveExpanded = searchQuery !== '' ? new Set(PICKER_CATEGORIES) : expandedCategories;

  return (
    <div className={['space-y-1', className ?? ''].filter(Boolean).join(' ')}>
      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); }}
          placeholder="Search functions…"
          aria-label="Search transform functions"
          className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500 italic py-2 text-center">No functions match your search.</p>
      )}

      {/* Category accordions */}
      {PICKER_CATEGORIES.map((cat) => {
        const fns = byCategory.get(cat) ?? [];
        if (fns.length === 0) return null;
        const isExpanded = effectiveExpanded.has(cat);
        const headingId = `transform-cat-${cat.toLowerCase()}`;

        return (
          <div key={cat} className="border border-zinc-700 rounded-md overflow-hidden">
            {/* Category header */}
            <button
              type="button"
              onClick={() => { toggleCategory(cat); }}
              aria-expanded={isExpanded}
              aria-controls={`${headingId}-panel`}
              id={headingId}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-sm font-medium text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
            >
              <span>{CATEGORY_LABEL[cat]}</span>
              <span className="text-xs text-zinc-400 flex items-center gap-2">
                <span className="tabular-nums">{fns.length}</span>
                <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
              </span>
            </button>

            {/* Function list */}
            {isExpanded && (
              <ul
                id={`${headingId}-panel`}
                role="list"
                aria-label={`${CATEGORY_LABEL[cat]} functions`}
                className="divide-y divide-zinc-700/50"
              >
                {fns.map((fn) => (
                  <li key={fn.name} role="listitem">
                    <button
                      type="button"
                      onClick={() => { onFunctionSelect(fn.name); }}
                      aria-label={`${fn.name}: ${fn.description}`}
                      className="w-full text-left flex items-start gap-3 px-3 py-2.5 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none group transition-colors"
                    >
                      {/* Function name */}
                      <span className="font-mono text-sm font-semibold text-blue-300 group-hover:text-blue-200 shrink-0 min-w-[7rem]">
                        {fn.name}
                      </span>
                      {/* Description */}
                      <span className="text-xs text-zinc-400 group-hover:text-zinc-300 leading-snug flex-1">
                        {fn.description}
                      </span>
                      {/* Param count badge */}
                      <span className="shrink-0 text-xs bg-zinc-700 text-zinc-300 rounded px-1.5 py-0.5 font-mono">
                        {paramLabel(fn.parameterCount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
