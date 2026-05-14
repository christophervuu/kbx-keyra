/**
 * SourceFieldPicker — Step 1 of the guided DSL builder.
 *
 * Allows the user to:
 * - Search and select schema field paths (shown as removable pills)
 * - Add multiple fields for multi-argument functions
 * - Toggle to "Static Value" mode and enter a literal value
 *
 * Reuses `flattenSchemaPaths` from T-03 utilities.
 */

import { useCallback, useContext, useMemo, useRef, useState } from 'react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import { resolveFieldTestValue } from '../lib/source-field-display';
import { PreviewContext } from '../context/preview-context';
import { SourceFieldOptionRow, SourceFieldChipBadge } from './SourceFieldOptionRow';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StaticValueType = 'string' | 'number' | 'boolean' | 'null';

export interface SourceFieldPickerProps {
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly selectedFields: readonly string[];
  readonly onFieldSelect: (path: string) => void;
  readonly onFieldRemove: (path: string) => void;
  /** Whether static-value mode is active */
  readonly staticMode: boolean;
  readonly onStaticModeChange: (staticMode: boolean) => void;
  readonly staticValue: string;
  readonly staticType: StaticValueType;
  readonly onStaticValueChange: (value: string) => void;
  readonly onStaticTypeChange: (type: StaticValueType) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Static type options
// ---------------------------------------------------------------------------

const STATIC_TYPE_OPTIONS: { value: StaticValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldPillProps {
  path: string;
  fieldType: string;
  onRemove: () => void;
}

function FieldPill({ path, fieldType, onRemove }: FieldPillProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 border border-blue-700 text-sm text-blue-100"
      data-testid="field-pill"
    >
      <SourceFieldChipBadge type={fieldType} />
      <span className="font-mono text-xs">{path}</span>
      <button
        type="button"
        aria-label={`Remove field ${path}`}
        onClick={onRemove}
        className="ml-0.5 text-blue-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Source field picker: search, select, and manage source schema paths for Step 1.
 */
export function SourceFieldPicker({
  parsedSourceSchema,
  selectedFields,
  onFieldSelect,
  onFieldRemove,
  staticMode,
  onStaticModeChange,
  staticValue,
  staticType,
  onStaticValueChange,
  onStaticTypeChange,
  className,
}: SourceFieldPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Consume PreviewContext for test data — gracefully handles null (outside PreviewProvider)
  const previewCtx = useContext(PreviewContext);
  const sourceData = previewCtx?.sourceData ?? null;

  // Flatten schema paths once per schema change
  const allPaths = useMemo<SchemaPathEntry[]>(() => {
    if (parsedSourceSchema === null) return [];
    return flattenSchemaPaths(parsedSourceSchema);
  }, [parsedSourceSchema]);

  // Filter by query; exclude already-selected fields
  const suggestions = useMemo<SchemaPathEntry[]>(() => {
    const q = searchQuery.toLowerCase();
    return allPaths.filter(
      (p) =>
        !selectedFields.includes(p.path) &&
        (q === '' || p.path.toLowerCase().includes(q)),
    );
  }, [allPaths, searchQuery, selectedFields]);

  const handleInputFocus = useCallback(() => {
    setShowSuggestions(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowSuggestions(false), 150);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      onFieldSelect(path);
      setSearchQuery('');
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [onFieldSelect],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        handleSelect(suggestions[0].path);
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [suggestions, handleSelect],
  );

  // -------------------------------------------------------------------------
  // No schema loaded
  // -------------------------------------------------------------------------
  if (parsedSourceSchema === null && !staticMode) {
    return (
      <div className={['space-y-4', className ?? ''].filter(Boolean).join(' ')}>
        <p className="text-sm text-zinc-500 italic">No source schema loaded.</p>
        {/* Static value toggle still available */}
        <StaticValueToggle staticMode={staticMode} onToggle={onStaticModeChange} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Static value mode
  // -------------------------------------------------------------------------
  if (staticMode) {
    return (
      <div className={['space-y-3', className ?? ''].filter(Boolean).join(' ')}>
        <StaticValueToggle staticMode={staticMode} onToggle={onStaticModeChange} />
        <StaticValueInput
          staticType={staticType}
          staticValue={staticValue}
          onTypeChange={onStaticTypeChange}
          onValueChange={onStaticValueChange}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Field selection mode
  // -------------------------------------------------------------------------
  return (
    <div className={['space-y-3', className ?? ''].filter(Boolean).join(' ')}>
      {/* Selected field pills */}
      {selectedFields.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Selected source fields"
          data-testid="selected-fields"
        >
          {selectedFields.map((path) => {
            const entry = allPaths.find((p) => p.path === path);
            return (
              <FieldPill
                key={path}
                path={path}
                fieldType={entry?.type ?? 'any'}
                onRemove={() => { onFieldRemove(path); }}
              />
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showSuggestions && suggestions.length > 0}
          aria-label="Search source fields"
          aria-autocomplete="list"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={selectedFields.length > 0 ? 'Add another field…' : 'Search source fields…'}
          className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Source field suggestions"
            className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
          >
            {suggestions.slice(0, 50).map((entry) => (
              <li key={entry.path} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); }} // prevent blur
                  onClick={() => { handleSelect(entry.path); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                >
                  <SourceFieldOptionRow
                    path={entry.path}
                    type={entry.type}
                    testValue={resolveFieldTestValue(sourceData, entry.path)}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add another field prompt */}
      {selectedFields.length > 0 && (
        <p className="text-xs text-zinc-500">
          You can select multiple fields for multi-argument functions.
        </p>
      )}

      {/* Static value toggle */}
      <StaticValueToggle staticMode={staticMode} onToggle={onStaticModeChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components: toggle + static input
// ---------------------------------------------------------------------------

interface StaticValueToggleProps {
  staticMode: boolean;
  onToggle: (mode: boolean) => void;
}

function StaticValueToggle({ staticMode, onToggle }: StaticValueToggleProps) {
  return (
    <button
      type="button"
      onClick={() => { onToggle(!staticMode); }}
      className="text-xs text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded underline underline-offset-2"
      aria-pressed={staticMode}
    >
      {staticMode ? '← Use source field instead' : 'Use a static value instead'}
    </button>
  );
}

interface StaticValueInputProps {
  staticType: StaticValueType;
  staticValue: string;
  onTypeChange: (type: StaticValueType) => void;
  onValueChange: (value: string) => void;
}

function StaticValueInput({ staticType, staticValue, onTypeChange, onValueChange }: StaticValueInputProps) {
  return (
    <div className="space-y-2">
      {/* Type selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-400 shrink-0">Type:</label>
        <select
          value={staticType}
          onChange={(e) => { onTypeChange(e.target.value as StaticValueType); }}
          aria-label="Static value type"
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        >
          {STATIC_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Value input — depends on type */}
      {staticType === 'null' ? (
        <p className="text-xs text-zinc-500 italic px-1">Value will be null.</p>
      ) : staticType === 'boolean' ? (
        <select
          value={staticValue}
          onChange={(e) => { onValueChange(e.target.value); }}
          aria-label="Static boolean value"
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={staticType === 'number' ? 'number' : 'text'}
          value={staticValue}
          onChange={(e) => { onValueChange(e.target.value); }}
          aria-label={`Static ${staticType} value`}
          placeholder={staticType === 'number' ? '0' : 'Enter value…'}
          className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}

