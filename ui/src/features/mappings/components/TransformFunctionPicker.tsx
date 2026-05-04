/**
 * TransformFunctionPicker — dropdown/popover for selecting a transform function
 * to add to the pipeline in the UnifiedExpressionBuilder (FS-023 T-04).
 *
 * Shows all DSL functions except SourceAccess, grouped by category with search.
 */

import { useMemo, useState } from 'react';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import type { FunctionCatalogEntry, FunctionCategory } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
// Types
// ---------------------------------------------------------------------------

export interface TransformFunctionPickerProps {
  readonly onSelect: (functionName: string) => void;
  readonly onClose: () => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Categorized function picker for the transform pipeline.
 * Renders inline (caller is responsible for positioning/overlay).
 */
export function TransformFunctionPicker({
  onSelect,
  onClose,
  className,
}: TransformFunctionPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<FunctionCategory>>(
    new Set(['String']),
  );

  const filtered = useMemo<FunctionCatalogEntry[]>(() => {
    const q = searchQuery.toLowerCase();
    return DSL_FUNCTION_CATALOG.filter(
      (fn) =>
        PICKER_CATEGORIES.includes(fn.category) &&
        (q === '' || fn.name.toLowerCase().includes(q) || fn.description.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  const byCategory = useMemo(() => {
    const map = new Map<FunctionCategory, FunctionCatalogEntry[]>();
    for (const cat of PICKER_CATEGORIES) map.set(cat, []);
    for (const fn of filtered) map.get(fn.category)?.push(fn);
    return map;
  }, [filtered]);

  const effectiveExpanded =
    searchQuery !== '' ? new Set(PICKER_CATEGORIES) : expandedCategories;

  const toggleCategory = (cat: FunctionCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleSelect = (name: string) => {
    onSelect(name);
    onClose();
  };

  return (
    <div
      className={[
        'bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-80 max-h-96 overflow-y-auto',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="transform-function-picker"
    >
      {/* Search */}
      <div className="sticky top-0 bg-zinc-900 border-b border-zinc-700 p-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); }}
          placeholder="Search functions…"
          aria-label="Search transform functions"
          autoFocus
          className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
          data-testid="transform-function-search"
        />
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500 italic py-4 text-center">
          No functions match your search.
        </p>
      )}

      {/* Category accordions */}
      <div className="p-1 space-y-1">
        {PICKER_CATEGORIES.map((cat) => {
          const fns = byCategory.get(cat) ?? [];
          if (fns.length === 0) return null;
          const isExpanded = effectiveExpanded.has(cat);
          const headingId = `tfp-cat-${cat.toLowerCase()}`;

          return (
            <div key={cat} className="border border-zinc-700 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => { toggleCategory(cat); }}
                aria-expanded={isExpanded}
                id={headingId}
                className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-300 uppercase tracking-wide focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                data-testid={`transform-category-${cat.toLowerCase()}`}
              >
                <span>{CATEGORY_LABEL[cat]}</span>
                <span aria-hidden="true" className="text-zinc-500">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <ul role="list" aria-label={`${CATEGORY_LABEL[cat]} functions`}>
                  {fns.map((fn) => (
                    <li key={fn.name}>
                      <button
                        type="button"
                        onClick={() => { handleSelect(fn.name); }}
                        title={fn.example}
                        aria-label={`${fn.name}: ${fn.description}`}
                        className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none group transition-colors"
                        data-testid={`transform-fn-${fn.name}`}
                      >
                        <span className="font-mono text-sm font-semibold text-blue-300 group-hover:text-blue-200 shrink-0 min-w-[6rem]">
                          {fn.name}
                        </span>
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-300 leading-snug flex-1 truncate">
                          {fn.description}
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

      {/* Close / cancel */}
      <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700 p-2">
        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
          data-testid="transform-function-picker-close"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
