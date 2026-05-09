/**
 * ValueMapModeBuilder — Value Map mode for the UnifiedExpressionBuilder (FS-023 T-06).
 *
 * Renders:
 *   - Input Source: single-select source field picker
 *   - Mapping Table: editable "When value is..." → "Map to..." rows
 *   - Fallback: "Return specific value" | "Return null"
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { X, Plus, AlertTriangle } from 'lucide-react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { FallbackValue, StaticValue, ValueMapEntry, ValueMapModeState } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

const OUTPUT_TYPE_OPTIONS: Array<{ value: StaticValue['type']; label: string }> = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValueMapModeBuilderProps {
  readonly state: ValueMapModeState;
  readonly onStateChange: (state: ValueMapModeState) => void;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Single-select source field picker
// ---------------------------------------------------------------------------

interface SourceFieldSelectProps {
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly value: string;
  readonly onChange: (path: string) => void;
}

function SourceFieldSelect({ parsedSourceSchema, value, onChange }: SourceFieldSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allPaths = useMemo(
    () => (parsedSourceSchema ? flattenSchemaPaths(parsedSourceSchema) : []),
    [parsedSourceSchema],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPaths;
    return allPaths.filter((p) => p.path.toLowerCase().includes(q));
  }, [allPaths, query]);

  const handleSelect = useCallback(
    (path: string) => {
      onChange(path);
      setQuery('');
      setOpen(false);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div className="relative" data-testid="value-map-source-picker">
      {value ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 border border-blue-700 px-2.5 py-0.5 text-xs text-blue-300">
            {value}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            aria-label={`Remove source field ${value}`}
            data-testid="value-map-source-clear"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => { setOpen(true); }}
            onBlur={() => { setTimeout(() => { setOpen(false); }, 150); }}
            placeholder="Search source fields…"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid="value-map-source-search"
          />
          {open && filtered.length > 0 && (
            <ul
              role="listbox"
              className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
            >
              {filtered.map((entry) => (
                <li
                  key={entry.path}
                  role="option"
                  aria-selected={entry.path === value}
                  onMouseDown={() => { handleSelect(entry.path); }}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
                >
                  <span className="text-xs text-zinc-500 font-mono">{entry.type ?? '?'}</span>
                  <span>{entry.path}</span>
                </li>
              ))}
            </ul>
          )}
          {open && filtered.length === 0 && query.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-500 shadow-lg">
              No fields match "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapping row
// ---------------------------------------------------------------------------

interface MappingRowProps {
  readonly entry: ValueMapEntry;
  readonly index: number;
  readonly onChange: (index: number, field: 'whenValue' | 'mapTo', value: string) => void;
  readonly onTypeChange: (index: number, valueType: StaticValue['type']) => void;
  readonly onRemove: (index: number) => void;
}

function MappingRow({ entry, index, onChange, onTypeChange, onRemove }: MappingRowProps) {
  const isEmpty = entry.whenValue.trim() === '';
  const mapToType = entry.mapToType ?? 'string';
  return (
    <tr
      data-testid={`value-map-row-${index}`}
      className={isEmpty ? 'bg-red-950/20' : undefined}
    >
      <td className="py-1 pr-2">
        <div className="flex items-center gap-1">
          {isEmpty && (
            <AlertTriangle
              className="h-3.5 w-3.5 flex-shrink-0 text-amber-500"
              aria-label="Incomplete row — when value is empty"
            />
          )}
          <input
            type="text"
            value={entry.whenValue}
            onChange={(e) => { onChange(index, 'whenValue', e.target.value); }}
            placeholder="When value is…"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={`value-map-when-${index}`}
          />
        </div>
      </td>
      <td className="py-1 pr-2">
        <div className="space-y-1">
          <select
            value={mapToType}
            onChange={(e) => { onTypeChange(index, e.target.value as StaticValue['type']); }}
            aria-label={`Map output type for row ${index + 1}`}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={`value-map-to-type-${index}`}
          >
            {OUTPUT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {mapToType === 'string' && (
            <input
              type="text"
              value={entry.mapTo}
              onChange={(e) => { onChange(index, 'mapTo', e.target.value); }}
              placeholder="Map to…"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid={`value-map-to-${index}`}
            />
          )}

          {mapToType === 'number' && (
            <input
              type="number"
              value={entry.mapTo}
              onChange={(e) => { onChange(index, 'mapTo', e.target.value); }}
              placeholder="0"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid={`value-map-to-${index}`}
            />
          )}

          {mapToType === 'boolean' && (
            <select
              value={entry.mapTo === 'false' ? 'false' : 'true'}
              onChange={(e) => { onChange(index, 'mapTo', e.target.value); }}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid={`value-map-to-${index}`}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          )}

          {mapToType === 'null' && (
            <p className="px-1 text-xs italic text-zinc-500" data-testid={`value-map-to-null-${index}`}>
              Row maps to null.
            </p>
          )}
        </div>
      </td>
      <td className="py-1 text-right">
        <button
          type="button"
          onClick={() => { onRemove(index); }}
          className="rounded p-0.5 text-zinc-500 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={`Remove row ${index}`}
          data-testid={`value-map-remove-row-${index}`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ValueMapModeBuilder({
  state,
  onStateChange,
  parsedSourceSchema,
  className,
}: ValueMapModeBuilderProps) {
  // -------------------------------------------------------------------------
  // Input source
  // -------------------------------------------------------------------------

  const handleSourceChange = useCallback(
    (path: string) => {
      onStateChange({ ...state, inputSource: path });
    },
    [state, onStateChange],
  );

  // -------------------------------------------------------------------------
  // Mapping table
  // -------------------------------------------------------------------------

  const handleRowChange = useCallback(
    (index: number, field: 'whenValue' | 'mapTo', value: string) => {
      const updated = state.mappings.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      );
      onStateChange({ ...state, mappings: updated });
    },
    [state, onStateChange],
  );

  const handleAddRow = useCallback(() => {
    onStateChange({
      ...state,
      mappings: [...state.mappings, { whenValue: '', mapTo: '', mapToType: 'string' }],
    });
  }, [state, onStateChange]);

  const handleRowTypeChange = useCallback(
    (index: number, mapToType: StaticValue['type']) => {
      const nextValue =
        mapToType === 'boolean'
          ? 'true'
          : mapToType === 'number'
            ? '0'
            : '';

      const updated = state.mappings.map((row, i) =>
        i === index ? { ...row, mapToType, mapTo: mapToType === 'null' ? '' : nextValue } : row,
      );
      onStateChange({ ...state, mappings: updated });
    },
    [state, onStateChange],
  );

  const handleRemoveRow = useCallback(
    (index: number) => {
      onStateChange({
        ...state,
        mappings: state.mappings.filter((_, i) => i !== index),
      });
    },
    [state, onStateChange],
  );

  // -------------------------------------------------------------------------
  // Fallback
  // -------------------------------------------------------------------------

  const handleFallbackKindChange = useCallback(
    (kind: FallbackValue['kind']) => {
      const fallback: FallbackValue =
        kind === 'null' ? { kind: 'null' } : { kind: 'value', value: '', valueType: 'string' };
      onStateChange({ ...state, fallback });
    },
    [state, onStateChange],
  );

  const handleFallbackValueChange = useCallback(
    (value: string) => {
      const valueType = state.fallback.kind === 'value' ? (state.fallback.valueType ?? 'string') : 'string';
      onStateChange({ ...state, fallback: { kind: 'value', value, valueType } });
    },
    [state, onStateChange],
  );

  const handleFallbackTypeChange = useCallback(
    (valueType: StaticValue['type']) => {
      if (valueType === 'null') {
        onStateChange({ ...state, fallback: { kind: 'null' } });
        return;
      }

      const value =
        valueType === 'boolean'
          ? 'true'
          : valueType === 'number'
            ? '0'
            : '';

      onStateChange({ ...state, fallback: { kind: 'value', valueType, value } });
    },
    [state, onStateChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={['space-y-5', className ?? ''].filter(Boolean).join(' ')}
      data-testid="value-map-builder"
    >
      {/* Input Source */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Input Value
        </h3>
        <SourceFieldSelect
          parsedSourceSchema={parsedSourceSchema}
          value={state.inputSource}
          onChange={handleSourceChange}
        />
      </section>

      {/* Mapping Table */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Mapping Table
        </h3>

        {state.mappings.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-zinc-700 px-4 py-3 text-xs text-zinc-500"
            data-testid="value-map-empty-state"
          >
            Add mapping rows to define value transformations.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-800/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">
                    When value is…
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">
                    Map to…
                  </th>
                  <th className="w-8 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 px-3">
                {state.mappings.map((entry, i) => (
                  <MappingRow
                    key={i}
                    entry={entry}
                    index={i}
                    onChange={handleRowChange}
                    onTypeChange={handleRowTypeChange}
                    onRemove={handleRemoveRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
          data-testid="value-map-add-row-btn"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add row
        </button>
      </section>

      {/* Fallback */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Default / Fallback
        </h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
            <input
              type="radio"
              name="fallback-kind"
              value="null"
              checked={state.fallback.kind === 'null'}
              onChange={() => { handleFallbackKindChange('null'); }}
              className="accent-blue-500"
              data-testid="value-map-fallback-null"
            />
            Return null
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-zinc-300">
            <input
              type="radio"
              name="fallback-kind"
              value="value"
              checked={state.fallback.kind === 'value'}
              onChange={() => { handleFallbackKindChange('value'); }}
              className="accent-blue-500"
              data-testid="value-map-fallback-value-radio"
            />
            Return specific value
          </label>
        </div>
        {state.fallback.kind === 'value' && (
          <div className="space-y-2">
            <select
              value={state.fallback.valueType ?? 'string'}
              onChange={(e) => { handleFallbackTypeChange(e.target.value as StaticValue['type']); }}
              aria-label="Fallback value type"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid="value-map-fallback-type"
            >
              <option value="string">String</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="null">Null</option>
            </select>

            {(state.fallback.valueType ?? 'string') === 'string' && (
              <input
                type="text"
                value={state.fallback.value ?? ''}
                onChange={(e) => { handleFallbackValueChange(e.target.value); }}
                placeholder="Fallback value…"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                data-testid="value-map-fallback-input"
              />
            )}

            {state.fallback.valueType === 'number' && (
              <input
                type="number"
                value={state.fallback.value ?? '0'}
                onChange={(e) => { handleFallbackValueChange(e.target.value); }}
                placeholder="0"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                data-testid="value-map-fallback-input"
              />
            )}

            {state.fallback.valueType === 'boolean' && (
              <select
                value={state.fallback.value === 'false' ? 'false' : 'true'}
                onChange={(e) => { handleFallbackValueChange(e.target.value); }}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                data-testid="value-map-fallback-input"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
