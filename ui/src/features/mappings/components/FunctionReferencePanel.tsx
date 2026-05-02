/**
 * FunctionReferencePanel — Collapsible, searchable function reference panel.
 *
 * Displays all DSL functions from the catalog grouped by category.
 * Search filters by function name and description (debounced 200ms).
 * Clicking a function fires `onInsertFunction(name)` — the parent wires
 * the actual insert behaviour (cursor insert in editor mode, function select
 * in builder mode).
 *
 * @see DSL_FUNCTION_CATALOG in `ui/src/lib/data/dsl-functions.ts`
 * @see AE-11
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { FunctionCatalogEntry, FunctionCategory } from '@/lib/data/dsl-functions';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';
import { FunctionReferenceEntry } from './FunctionReferenceEntry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FunctionReferencePanelProps {
  /** Called when the user clicks or keyboard-confirms a function entry. */
  readonly onInsertFunction: (functionName: string) => void;
  /** Current editor mode — passed through for display context (future use). */
  readonly mode?: 'builder' | 'editor';
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Categories displayed in the panel — SourceAccess excluded (handled separately). */
const DISPLAY_CATEGORIES: FunctionCategory[] = [
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
// Component
// ---------------------------------------------------------------------------

/**
 * A collapsible, searchable function reference panel.
 * Rendered in collapsed state by default — clicking the toggle reveals
 * the full catalog with search and categorized entries.
 */
export function FunctionReferencePanel({
  onInsertFunction,
  className,
}: FunctionReferencePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input → searchQuery (200ms)
  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 200);
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput]);

  // Filter catalog
  const filtered = useMemo<readonly FunctionCatalogEntry[]>(() => {
    const q = searchQuery.toLowerCase().trim();
    return DSL_FUNCTION_CATALOG.filter(
      (fn) =>
        DISPLAY_CATEGORIES.includes(fn.category) &&
        (q === '' ||
          fn.name.toLowerCase().includes(q) ||
          fn.description.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<FunctionCategory, FunctionCatalogEntry[]>();
    for (const cat of DISPLAY_CATEGORIES) {
      map.set(cat, []);
    }
    for (const fn of filtered) {
      map.get(fn.category)?.push(fn);
    }
    return map;
  }, [filtered]);

  const hasResults = filtered.length > 0;

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  return (
    <div className={['border border-zinc-700 rounded-md overflow-hidden', className ?? ''].filter(Boolean).join(' ')}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => { setIsOpen((v) => !v); }}
        aria-expanded={isOpen}
        aria-controls="function-reference-content"
        className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-750 text-sm font-medium text-zinc-300 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 transition-colors"
        data-testid="fn-reference-toggle"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">📖</span>
          Function Reference
        </span>
        <span className="text-zinc-500 text-xs" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div id="function-reference-content" data-testid="fn-reference-content">
          {/* Search bar */}
          <div className="px-3 py-2 bg-zinc-850 border-b border-zinc-700 flex items-center gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); }}
              placeholder="Search functions…"
              aria-label="Search function reference"
              className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid="fn-reference-search"
            />
            {searchInput !== '' && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-0.5"
                data-testid="fn-reference-clear"
              >
                ✕
              </button>
            )}
          </div>

          {/* Results */}
          <div
            className="max-h-[40vh] overflow-y-auto divide-y divide-zinc-700/50"
            data-testid="fn-reference-list"
          >
            {!hasResults ? (
              <p
                className="text-sm text-zinc-500 italic text-center py-4 px-3"
                data-testid="fn-reference-no-results"
              >
                No matching functions.
              </p>
            ) : (
              DISPLAY_CATEGORIES.map((cat) => {
                const entries = byCategory.get(cat) ?? [];
                if (entries.length === 0) return null;
                return (
                  <div key={cat}>
                    {/* Category header */}
                    <div
                      className="px-3 py-1.5 bg-zinc-800/70 text-xs font-semibold text-zinc-500 uppercase tracking-wide sticky top-0 z-10"
                      aria-label={`${CATEGORY_LABEL[cat]} functions`}
                    >
                      {CATEGORY_LABEL[cat]}
                    </div>
                    {/* Entries */}
                    <ul role="list" aria-label={`${CATEGORY_LABEL[cat]} function list`} className="divide-y divide-zinc-700/30">
                      {entries.map((entry) => (
                        <li key={entry.name} role="listitem">
                          <FunctionReferenceEntry
                            entry={entry}
                            onInsert={() => { onInsertFunction(entry.name); }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
