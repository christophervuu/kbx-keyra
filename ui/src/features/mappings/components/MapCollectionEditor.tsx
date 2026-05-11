/**
 * MapCollectionEditor.tsx — FS-043 T-04
 *
 * Source array picker for Map and Filter+Map collection modes.
 *
 * Lists array-type fields from the parsed source schema. The user selects one
 * source array. After selection, shows a compact summary (path + item count
 * estimate) that can be re-opened to change the selection.
 *
 * Used by ArrayBuilder when mode is 'map' or 'filterMap'.
 */

import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import { useMemo, useState } from 'react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MapCollectionEditorProps {
  /** Currently selected source array path, or empty string if none. */
  readonly sourceArrayPath: string;
  /** Parsed source schema for listing array-type fields. */
  readonly parsedSourceSchema: ParsedSchema | null;
  /** Fired when the user selects a source array. */
  readonly onSourceArrayPathChange: (path: string) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArrayPaths(schema: ParsedSchema | null): string[] {
  if (!schema) return [];
  return flattenSchemaPaths(schema)
    .filter((entry) => entry.type === 'array')
    .map((entry) => entry.path);
}

// ---------------------------------------------------------------------------
// Sub-component: SourceArrayOption
// ---------------------------------------------------------------------------

function SourceArrayOption({
  path,
  isSelected,
  onSelect,
}: {
  path: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      data-testid={`source-array-option-${path}`}
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
        isSelected
          ? 'bg-blue-950/50 text-blue-300 ring-1 ring-inset ring-blue-700/60'
          : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100',
      ].join(' ')}
    >
      <Database
        size={12}
        aria-hidden="true"
        className={isSelected ? 'text-blue-400' : 'text-slate-500'}
      />
      <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
      {isSelected && (
        <span className="shrink-0 text-[10px] font-medium text-blue-400">Selected</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MapCollectionEditor({
  sourceArrayPath,
  parsedSourceSchema,
  onSourceArrayPathChange,
  className = '',
}: MapCollectionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(!sourceArrayPath);

  const arrayPaths = useMemo(() => getArrayPaths(parsedSourceSchema), [parsedSourceSchema]);

  const hasSelection = sourceArrayPath.trim().length > 0;

  // Auto-collapse after selection
  function handleSelect(path: string) {
    onSourceArrayPathChange(path);
    setIsExpanded(false);
  }

  return (
    <div
      data-testid="map-collection-editor"
      className={['space-y-2', className].filter(Boolean).join(' ')}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Source array
        </span>
        {hasSelection && (
          <button
            type="button"
            data-testid="source-array-toggle"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse source array picker' : 'Change source array'}
            onClick={() => { setIsExpanded((prev) => !prev); }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            {isExpanded ? (
              <>
                <ChevronDown size={11} aria-hidden="true" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight size={11} aria-hidden="true" />
                Change
              </>
            )}
          </button>
        )}
      </div>

      {/* Compact summary when collapsed and a selection exists */}
      {hasSelection && !isExpanded && (
        <div
          data-testid="source-array-summary"
          className="flex items-center gap-2 rounded-lg border border-blue-700/50 bg-blue-950/30 px-3 py-2"
        >
          <Database size={13} aria-hidden="true" className="shrink-0 text-blue-400" />
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-blue-200"
            title={sourceArrayPath}
          >
            {sourceArrayPath}
          </span>
          <span className="shrink-0 rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
            array
          </span>
        </div>
      )}

      {/* Picker list */}
      {isExpanded && (
        <div
          role="listbox"
          aria-label="Source array fields"
          data-testid="source-array-listbox"
          className="max-h-52 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/60 p-1"
        >
          {arrayPaths.length === 0 ? (
            <p
              data-testid="source-array-empty"
              className="px-3 py-4 text-center text-xs text-slate-500"
            >
              {parsedSourceSchema
                ? 'No array fields found in source schema.'
                : 'Load a source schema to see available arrays.'}
            </p>
          ) : (
            arrayPaths.map((path) => (
              <SourceArrayOption
                key={path}
                path={path}
                isSelected={path === sourceArrayPath}
                onSelect={() => { handleSelect(path); }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
