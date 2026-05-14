/**
 * BuilderEntryActions — empty-state entry point for the FS-029 Value mode
 * builder (T-06, AE-03).
 *
 * Renders two side-by-side buttons at the top-left of the builder area:
 *   - [+ Add Source]         → opens a source field search popover
 *   - [+ Add Transformation] → opens the TransformFunctionPicker popover
 *
 * This component is only rendered by the parent when the builder is in empty
 * state (no sources, no function configured). Visibility is managed externally.
 *
 * On source selection:  calls `onSourceSelected(path)` — parent transitions
 *                       state to DirectCopy with a single source card.
 * On function selection: calls `onFunctionSelected(name)` — parent transitions
 *                        state to FunctionCall with empty argument slots.
 *
 * Usage:
 *   <BuilderEntryActions
 *     parsedSourceSchema={schema}
 *     onSourceSelected={(path) => { ... }}
 *     onFunctionSelected={(name) => { ... }}
 *   />
 */

import { useCallback, useContext, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import { resolveFieldTestValue } from '../lib/source-field-display';
import { PreviewContext } from '../context/preview-context';
import { SourceFieldOptionRow } from './SourceFieldOptionRow';
import type { ParsedSchema } from '@/lib/types/domain';
import { TransformFunctionPicker } from './TransformFunctionPicker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuilderEntryActionsProps {
  /** Source schema used to populate the source field search suggestions. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Called when the user selects a source field path. */
  readonly onSourceSelected: (path: string) => void;
  /** Called when the user selects a transform function. */
  readonly onFunctionSelected: (functionName: string) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dual-button empty-state entry point for the Value mode builder.
 * Each button opens its own popover; only one can be open at a time.
 */
export function BuilderEntryActions({
  parsedSourceSchema,
  onSourceSelected,
  onFunctionSelected,
  className,
}: BuilderEntryActionsProps) {
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [functionPickerOpen, setFunctionPickerOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');

  const addSourceBtnRef = useRef<HTMLButtonElement>(null);
  const addTransformBtnRef = useRef<HTMLButtonElement>(null);

  // Consume PreviewContext for test data — gracefully handles null (outside PreviewProvider)
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  // All flattened schema paths for the source search
  const allPaths = parsedSourceSchema !== null ? flattenSchemaPaths(parsedSourceSchema) : [];

  const filteredPaths = allPaths.filter((p) => {
    const q = sourceSearch.toLowerCase();
    return q === '' || p.path.toLowerCase().includes(q);
  });

  // -------------------------------------------------------------------------
  // Source picker handlers
  // -------------------------------------------------------------------------

  const handleOpenSourcePicker = useCallback(() => {
    setFunctionPickerOpen(false);
    setSourcePickerOpen((v) => !v);
    setSourceSearch('');
  }, []);

  const handleSourceSelect = useCallback(
    (path: string) => {
      setSourcePickerOpen(false);
      setSourceSearch('');
      onSourceSelected(path);
      setTimeout(() => { addSourceBtnRef.current?.focus(); }, 0);
    },
    [onSourceSelected],
  );

  const handleSourcePickerClose = useCallback(() => {
    setSourcePickerOpen(false);
    setSourceSearch('');
    setTimeout(() => { addSourceBtnRef.current?.focus(); }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Function picker handlers
  // -------------------------------------------------------------------------

  const handleOpenFunctionPicker = useCallback(() => {
    setSourcePickerOpen(false);
    setFunctionPickerOpen((v) => !v);
  }, []);

  const handleFunctionSelect = useCallback(
    (functionName: string) => {
      setFunctionPickerOpen(false);
      onFunctionSelected(functionName);
      setTimeout(() => { addTransformBtnRef.current?.focus(); }, 0);
    },
    [onFunctionSelected],
  );

  const handleFunctionPickerClose = useCallback(() => {
    setFunctionPickerOpen(false);
    setTimeout(() => { addTransformBtnRef.current?.focus(); }, 0);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['flex items-start gap-2', className ?? ''].filter(Boolean).join(' ')}
      data-testid="builder-entry-actions"
    >
      {/* ── Add Source button + popover ── */}
      <div className="relative">
        <button
          ref={addSourceBtnRef}
          type="button"
          onClick={handleOpenSourcePicker}
          aria-expanded={sourcePickerOpen}
          aria-haspopup="listbox"
          aria-label="Add source field"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-600 bg-zinc-800 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
          data-testid="builder-add-source-btn"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Source
        </button>

        {sourcePickerOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-72"
            data-testid="source-picker-popover"
          >
            {/* Search input */}
            <div className="p-2 border-b border-zinc-700">
              <input
                type="text"
                value={sourceSearch}
                onChange={(e) => { setSourceSearch(e.target.value); }}
                placeholder="Search source fields…"
                aria-label="Search source fields"
                autoFocus
                className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
                data-testid="source-picker-search"
              />
            </div>

            {/* Results list */}
            <ul
              role="listbox"
              aria-label="Source field suggestions"
              className="max-h-56 overflow-y-auto p-1"
              data-testid="source-picker-list"
            >
              {filteredPaths.length === 0 ? (
                <li className="px-3 py-2 text-xs text-zinc-500 italic">
                  {parsedSourceSchema === null ? 'No source schema loaded.' : 'No fields match.'}
                </li>
              ) : (
                filteredPaths.slice(0, 50).map((entry) => (
                  <li key={entry.path} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => { handleSourceSelect(entry.path); }}
                      className="w-full text-left flex items-center px-3 py-1.5 rounded text-sm hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                      data-testid={`source-option-${entry.path}`}
                    >
                      <SourceFieldOptionRow
                        path={entry.path}
                        type={entry.type}
                        testValue={resolveFieldTestValue(sourceData, entry.path)}
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>

            {/* Cancel */}
            <div className="border-t border-zinc-700 p-2">
              <button
                type="button"
                onClick={handleSourcePickerClose}
                className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
                data-testid="source-picker-close"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Transformation button + popover ── */}
      <div className="relative">
        <button
          ref={addTransformBtnRef}
          type="button"
          onClick={handleOpenFunctionPicker}
          aria-expanded={functionPickerOpen}
          aria-haspopup="listbox"
          aria-label="Add transformation function"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-600 bg-zinc-800 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
          data-testid="builder-add-transform-btn"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Transformation
        </button>

        {functionPickerOpen && (
          <div
            className="absolute left-0 top-full mt-1 z-30"
            data-testid="function-picker-popover"
          >
            <TransformFunctionPicker
              onSelect={handleFunctionSelect}
              onClose={handleFunctionPickerClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
