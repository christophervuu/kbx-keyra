/**
 * BuildFromValuesEditor.tsx — FS-043 T-05
 *
 * Multi-entry builder for Build from Values mode.
 *
 * Features:
 *   - Ordered list of value entries (order is semantically meaningful in array())
 *   - [+ Add Entry] button
 *   - Per-entry remove button
 *   - Drag handle + keyboard up/down buttons for reordering
 *   - Null filtering toggle: wraps array() in filter(array(...), not(isNull(item("field"))))
 *   - Adapts entry shape based on targetItemFields:
 *     - Object entries when targetItemFields is non-empty
 *     - Primitive entries otherwise
 */

import { GripVertical, Minus, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { ValueEntryEditor } from './ValueEntryEditor';
import type { ValueEntry, BuildFromValuesCollectionState } from '../lib/array-builder-state';
import type { ParsedSchema, SchemaNodeType } from '@/lib/types/domain';

export interface BuildFromValuesTargetField {
  readonly name: string;
  readonly type?: SchemaNodeType;
  readonly isRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildFromValuesEditorProps {
  readonly collectionState: BuildFromValuesCollectionState;
  /** Target item field names — drives object vs primitive entry shape. */
  readonly targetItemFields?: readonly BuildFromValuesTargetField[];
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly onCollectionStateChange: (state: BuildFromValuesCollectionState) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Sub-component: EntryRow
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  index,
  total,
  targetItemFields,
  parsedSourceSchema,
  onMove,
  onRemove,
  onChange,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  entry: ValueEntry;
  index: number;
  total: number;
  targetItemFields: readonly BuildFromValuesTargetField[];
  parsedSourceSchema: ParsedSchema | null;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onChange: (index: number, entry: ValueEntry) => void;
  isDragOver: boolean;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      data-testid={`value-entry-row-${index}`}
      draggable
      onDragStart={() => { onDragStart(index); }}
      onDragEnter={() => { onDragEnter(index); }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); }}
      className={[
        'group relative rounded-lg border bg-slate-800/50 p-3 transition-colors',
        isDragOver
          ? 'border-blue-500 bg-blue-950/20'
          : 'border-slate-700 hover:border-slate-600',
      ].join(' ')}
    >
      {/* Row header: drag handle + entry number + remove */}
      <div className="mb-2 flex items-center gap-2">
        {/* Drag handle */}
        <span
          aria-hidden="true"
          className="cursor-grab text-slate-600 hover:text-slate-400 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </span>

        <span className="text-[10px] font-semibold text-slate-500">
          Entry {index + 1}
        </span>

        {/* Keyboard reorder buttons */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            aria-label={`Move entry ${index + 1} up`}
            data-testid={`entry-move-up-${index}`}
            onClick={() => { onMove(index, index - 1); }}
            className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M5 2L9 7H1L5 2Z" />
            </svg>
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            aria-label={`Move entry ${index + 1} down`}
            data-testid={`entry-move-down-${index}`}
            onClick={() => { onMove(index, index + 1); }}
            className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M5 8L1 3H9L5 8Z" />
            </svg>
          </button>

          {/* Remove button */}
          <button
            type="button"
            aria-label={`Remove entry ${index + 1}`}
            data-testid={`entry-remove-${index}`}
            onClick={() => { onRemove(index); }}
            className="rounded p-0.5 text-slate-500 transition-colors hover:bg-red-900/40 hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
          >
            <Minus size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Entry editor */}
      <ValueEntryEditor
        entry={entry}
        entryIndex={index}
        targetItemFields={targetItemFields}
        parsedSourceSchema={parsedSourceSchema}
        onChange={(updated) => { onChange(index, updated); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuildFromValuesEditor({
  collectionState,
  targetItemFields = [],
  parsedSourceSchema,
  onCollectionStateChange,
  className = '',
}: BuildFromValuesEditorProps) {
  const { entries, nullFilteringEnabled, nullFilterField } = collectionState;

  // Drag-and-drop state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function makeNewEntry(): ValueEntry {
    if (targetItemFields.length > 0) {
      const fields: Record<string, { kind: 'empty' }> = {};
      for (const f of targetItemFields) {
        fields[f.name] = { kind: 'empty' };
      }
      return { kind: 'object', fields };
    }
    return { kind: 'primitive', value: { kind: 'empty' } };
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAdd = useCallback(() => {
    onCollectionStateChange({
      ...collectionState,
      entries: [...entries, makeNewEntry()],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionState, entries, onCollectionStateChange]);

  const handleRemove = useCallback((index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onCollectionStateChange({ ...collectionState, entries: next });
  }, [collectionState, entries, onCollectionStateChange]);

  const handleChange = useCallback((index: number, entry: ValueEntry) => {
    const next = entries.map((e, i) => (i === index ? entry : e));
    onCollectionStateChange({ ...collectionState, entries: next });
  }, [collectionState, entries, onCollectionStateChange]);

  const handleMove = useCallback((from: number, to: number) => {
    if (to < 0 || to >= entries.length) return;
    const next = [...entries];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onCollectionStateChange({ ...collectionState, entries: next });
  }, [collectionState, entries, onCollectionStateChange]);

  const handleNullFilterToggle = useCallback(() => {
    onCollectionStateChange({
      ...collectionState,
      nullFilteringEnabled: !nullFilteringEnabled,
    });
  }, [collectionState, nullFilteringEnabled, onCollectionStateChange]);

  const handleNullFilterFieldChange = useCallback((field: string) => {
    onCollectionStateChange({ ...collectionState, nullFilterField: field });
  }, [collectionState, onCollectionStateChange]);

  // Drag handlers
  function handleDragStart(index: number) {
    dragIndexRef.current = index;
  }

  function handleDragEnter(index: number) {
    setDragOverIndex(index);
  }

  function handleDragEnd() {
    const from = dragIndexRef.current;
    const to = dragOverIndex;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from !== null && to !== null && from !== to) {
      handleMove(from, to);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      data-testid="build-from-values-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Entries
        </span>
        <span className="text-[10px] text-slate-500">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div
          data-testid="build-from-values-empty"
          className="rounded-lg border border-dashed border-slate-700 px-4 py-5 text-center"
        >
          <p className="text-xs text-slate-500">
            No entries yet. Click <strong className="text-slate-400">+ Add Entry</strong> to begin.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <EntryRow
              key={index}
              entry={entry}
              index={index}
              total={entries.length}
              targetItemFields={targetItemFields}
              parsedSourceSchema={parsedSourceSchema}
              onMove={handleMove}
              onRemove={handleRemove}
              onChange={handleChange}
              isDragOver={dragOverIndex === index}
              onDragStart={handleDragStart}
              onDragEnter={handleDragEnter}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Add entry button */}
      <button
        type="button"
        data-testid="add-entry-btn"
        onClick={handleAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-600 py-2 text-xs text-slate-400 transition-colors hover:border-blue-500/60 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        <Plus size={12} aria-hidden="true" />
        Add Entry
      </button>

      {/* Null filtering toggle */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300">Filter out null entries</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Wraps array() in filter(…, not(isNull(item("field"))))
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={nullFilteringEnabled}
            data-testid="null-filter-toggle"
            onClick={handleNullFilterToggle}
            aria-label="Toggle null filtering"
            className="shrink-0 text-slate-400 transition-colors hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
          >
            {nullFilteringEnabled ? (
              <ToggleRight size={22} className="text-blue-400" aria-hidden="true" />
            ) : (
              <ToggleLeft size={22} aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Null filter field input — shown when enabled */}
        {nullFilteringEnabled && (
          <div className="mt-2 space-y-1">
            <label
              htmlFor="null-filter-field"
              className="block text-[10px] font-medium uppercase tracking-wide text-slate-500"
            >
              Field to check
            </label>
            <input
              id="null-filter-field"
              type="text"
              value={nullFilterField ?? ''}
              placeholder='e.g. id'
              data-testid="null-filter-field-input"
              onChange={(e) => { handleNullFilterFieldChange(e.target.value); }}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
