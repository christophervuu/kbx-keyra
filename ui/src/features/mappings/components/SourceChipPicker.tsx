/**
 * SourceChipPicker — chip-based multi-select source field picker for the
 * UnifiedExpressionBuilder (FS-023).
 *
 * Allows the user to:
 * - Search and select source schema fields (displayed as removable chips)
 * - Toggle to "Static value" mode with a type selector
 *
 * Input-type selector is a segmented control: "Source field" | "Static value"
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type { SourceSelection, StaticValue } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceChipPickerProps {
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly selectedSources: readonly SourceSelection[];
  readonly onSourcesChange: (sources: SourceSelection[]) => void;
  readonly staticMode: boolean;
  readonly onStaticModeChange: (enabled: boolean) => void;
  readonly staticValue?: StaticValue;
  readonly onStaticValueChange?: (value: StaticValue) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<string, string> = {
  string: 'S',
  number: '#',
  integer: '#',
  boolean: '✓',
  object: '{}',
  array: '[]',
  null: '∅',
  any: '?',
};

type StaticValueType = 'string' | 'number' | 'boolean' | 'null';

const STATIC_TYPE_OPTIONS: { value: StaticValueType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SourceChipProps {
  path: string;
  fieldType: string;
  onRemove: () => void;
}

function SourceChip({ path, fieldType, onRemove }: SourceChipProps) {
  const icon = TYPE_ICON[fieldType] ?? '?';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/60 border border-blue-700 text-sm text-blue-100"
      data-testid="source-chip"
    >
      <span
        className="text-xs font-mono text-blue-400 shrink-0"
        aria-label={`type: ${fieldType}`}
      >
        {icon}
      </span>
      <span className="font-mono text-xs">{path}</span>
      <button
        type="button"
        aria-label={`Remove source ${path}`}
        onClick={onRemove}
        className="ml-0.5 text-blue-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
      >
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Static value input
// ---------------------------------------------------------------------------

interface StaticValueInputProps {
  staticValue: StaticValue | undefined;
  onChange: (value: StaticValue) => void;
}

function StaticValueInput({ staticValue, onChange }: StaticValueInputProps) {
  const currentType: StaticValueType = staticValue?.type ?? 'string';
  const currentRawValue: string =
    staticValue && staticValue.type !== 'null' ? String(staticValue.value ?? '') : '';

  const handleTypeChange = (type: StaticValueType) => {
    if (type === 'null') {
      onChange({ type: 'null' });
    } else if (type === 'boolean') {
      onChange({ type: 'boolean', value: true });
    } else if (type === 'number') {
      onChange({ type: 'number', value: 0 });
    } else {
      onChange({ type: 'string', value: '' });
    }
  };

  const handleValueChange = (raw: string) => {
    if (currentType === 'number') {
      const n = parseFloat(raw);
      onChange({ type: 'number', value: isNaN(n) ? 0 : n });
    } else if (currentType === 'boolean') {
      onChange({ type: 'boolean', value: raw === 'true' });
    } else {
      onChange({ type: 'string', value: raw });
    }
  };

  return (
    <div className="space-y-2" data-testid="static-value-input">
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-400 shrink-0">Type:</label>
        <select
          value={currentType}
          onChange={(e) => { handleTypeChange(e.target.value as StaticValueType); }}
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

      {currentType === 'null' ? (
        <p className="text-xs text-zinc-500 italic px-1">Value will be null.</p>
      ) : currentType === 'boolean' ? (
        <select
          value={currentRawValue || 'true'}
          onChange={(e) => { handleValueChange(e.target.value); }}
          aria-label="Static boolean value"
          className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          type={currentType === 'number' ? 'number' : 'text'}
          value={currentRawValue}
          onChange={(e) => { handleValueChange(e.target.value); }}
          aria-label={`Static ${currentType} value`}
          placeholder={currentType === 'number' ? '0' : 'Enter value…'}
          className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Chip-based multi-select source field picker for the UnifiedExpressionBuilder.
 * Includes a segmented input-type selector: "Source field" | "Static value".
 */
export function SourceChipPicker({
  parsedSourceSchema,
  selectedSources,
  onSourcesChange,
  staticMode,
  onStaticModeChange,
  staticValue,
  onStaticValueChange,
  className,
}: SourceChipPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allPaths = useMemo<SchemaPathEntry[]>(() => {
    if (parsedSourceSchema === null) return [];
    return flattenSchemaPaths(parsedSourceSchema);
  }, [parsedSourceSchema]);

  const selectedPaths = useMemo(
    () => selectedSources.map((s) => s.path),
    [selectedSources],
  );

  const suggestions = useMemo<SchemaPathEntry[]>(() => {
    const q = searchQuery.toLowerCase();
    return allPaths.filter(
      (p) =>
        !selectedPaths.includes(p.path) &&
        (q === '' || p.path.toLowerCase().includes(q)),
    );
  }, [allPaths, searchQuery, selectedPaths]);

  const handleSelect = useCallback(
    (entry: SchemaPathEntry) => {
      onSourcesChange([...selectedSources, { path: entry.path, type: entry.type }]);
      setSearchQuery('');
      setShowSuggestions(false);
      inputRef.current?.focus();
    },
    [selectedSources, onSourcesChange],
  );

  const handleRemove = useCallback(
    (path: string) => {
      onSourcesChange(selectedSources.filter((s) => s.path !== path));
    },
    [selectedSources, onSourcesChange],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        handleSelect(suggestions[0]);
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [suggestions, handleSelect],
  );

  return (
    <div
      className={['space-y-3', className ?? ''].filter(Boolean).join(' ')}
      data-testid="source-chip-picker"
    >
      {/* Input-type segmented control */}
      <div
        role="tablist"
        aria-label="Input type"
        className="flex rounded-md border border-zinc-700 overflow-hidden w-fit"
        data-testid="input-type-selector"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!staticMode}
          onClick={() => { onStaticModeChange(false); }}
          className={[
            'px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            !staticMode
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700',
          ].join(' ')}
          data-testid="input-type-source"
        >
          Source field
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={staticMode}
          onClick={() => { onStaticModeChange(true); }}
          className={[
            'px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            staticMode
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700',
          ].join(' ')}
          data-testid="input-type-static"
        >
          Static value
        </button>
      </div>

      {/* Content area — source picker or static value input */}
      {staticMode ? (
        <StaticValueInput
          staticValue={staticValue}
          onChange={onStaticValueChange ?? (() => {})}
        />
      ) : (
        <>
          {/* Selected source chips */}
          {selectedSources.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Selected source fields"
              data-testid="selected-sources"
            >
              {selectedSources.map((source) => {
                const entry = allPaths.find((p) => p.path === source.path);
                return (
                  <SourceChip
                    key={source.path}
                    path={source.path}
                    fieldType={entry?.type ?? source.type ?? 'any'}
                    onRemove={() => { handleRemove(source.path); }}
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
              onFocus={() => { setShowSuggestions(true); }}
              onBlur={() => { setTimeout(() => { setShowSuggestions(false); }, 150); }}
              onKeyDown={handleInputKeyDown}
              placeholder={selectedSources.length > 0 ? 'Add another field…' : 'Search source fields…'}
              className="w-full bg-zinc-800 border border-zinc-600 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
              data-testid="source-search-input"
            />

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Source field suggestions"
                className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-600 rounded-md shadow-lg max-h-48 overflow-y-auto"
                data-testid="source-suggestions"
              >
                {suggestions.slice(0, 50).map((entry) => (
                  <li key={entry.path} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => { handleSelect(entry); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none"
                      data-testid={`suggestion-${entry.path}`}
                    >
                      <span className="text-xs font-mono text-zinc-400 shrink-0 w-4 text-center">
                        {TYPE_ICON[entry.type] ?? '?'}
                      </span>
                      <span className="font-mono text-xs text-zinc-100 truncate">{entry.path}</span>
                      {entry.description && (
                        <span className="text-xs text-zinc-500 truncate ml-auto">{entry.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* No schema message */}
          {parsedSourceSchema === null && (
            <p className="text-sm text-zinc-500 italic">No source schema loaded.</p>
          )}
        </>
      )}
    </div>
  );
}
