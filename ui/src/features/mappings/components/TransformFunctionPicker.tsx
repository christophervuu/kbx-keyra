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
  readonly includeSourceAccess?: boolean;
  /**
   * When provided, only functions whose names are in this set are shown.
   * Functions not in the set are excluded entirely (not shown as disabled).
   * Used by the [+ Add Step] picker to enforce type compatibility (FS-030 AE-02).
   */
  readonly allowedFunctions?: ReadonlySet<string>;
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
  includeSourceAccess = false,
  allowedFunctions,
  className,
}: TransformFunctionPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<FunctionCategory>>(
    new Set(['String']),
  );

  const pickerCategories = useMemo<FunctionCategory[]>(() => {
    if (includeSourceAccess) return [...PICKER_CATEGORIES, 'SourceAccess'];
    return PICKER_CATEGORIES;
  }, [includeSourceAccess]);

  const filtered = useMemo<FunctionCatalogEntry[]>(() => {
    const q = searchQuery.toLowerCase();
    return DSL_FUNCTION_CATALOG.filter(
      (fn) =>
        pickerCategories.includes(fn.category) &&
        (allowedFunctions === undefined || allowedFunctions.has(fn.name)) &&
        (q === '' || fn.name.toLowerCase().includes(q) || fn.description.toLowerCase().includes(q)),
    );
  }, [searchQuery, pickerCategories, allowedFunctions]);

  const byCategory = useMemo(() => {
    const map = new Map<FunctionCategory, FunctionCatalogEntry[]>();
    for (const cat of pickerCategories) map.set(cat, []);
    for (const fn of filtered) map.get(fn.category)?.push(fn);
    return map;
  }, [filtered, pickerCategories]);

  const effectiveExpanded =
    searchQuery !== '' ? new Set(pickerCategories) : expandedCategories;

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
        'w-full max-h-96 overflow-y-auto bg-slate-950',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="transform-function-picker"
    >
      {/* Search */}
      <div className="sticky top-0 bg-slate-950 border-b border-slate-700">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); }}
          placeholder="Search functions…"
          aria-label="Search transform functions"
          autoFocus
          className="w-full border-0 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
          data-testid="transform-function-search"
        />
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <p className="py-4 text-center text-sm italic text-slate-500">
          No functions match your search.
        </p>
      )}

      {/* Category accordions */}
      <div className="space-y-0">
        {pickerCategories.map((cat) => {
          const fns = byCategory.get(cat) ?? [];
          if (fns.length === 0) return null;
          const isExpanded = effectiveExpanded.has(cat);
          const headingId = `tfp-cat-${cat.toLowerCase()}`;

          return (
            <div key={cat} className="overflow-hidden border-b border-slate-700 last:border-b-0">
              <button
                type="button"
                onClick={() => { toggleCategory(cat); }}
                aria-expanded={isExpanded}
                id={headingId}
                className="w-full flex items-center justify-between bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                data-testid={`transform-category-${cat.toLowerCase()}`}
              >
                <span>{CATEGORY_LABEL[cat]}</span>
                <span aria-hidden="true" className="text-slate-500">
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
                        className="group flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-slate-800 focus:bg-slate-800 focus:outline-none"
                        data-testid={`transform-fn-${fn.name}`}
                      >
                        <span className="min-w-[6rem] shrink-0 font-mono text-xs font-semibold text-blue-300 group-hover:text-blue-200">
                          {fn.name}
                        </span>
                        <span className="flex-1 truncate text-xs leading-tight text-slate-400 group-hover:text-slate-200">
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
    </div>
  );
}
