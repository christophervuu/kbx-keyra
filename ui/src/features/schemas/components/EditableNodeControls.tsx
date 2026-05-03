/**
 * Inline editing controls for a single schema tree node.
 *
 * Rendered inside `SchemaTreeNodeRow` when the tree is in edit mode.
 * Provides: type dropdown, required toggle, rename input, description field,
 * add-child button (objects only), and delete button with confirmation.
 */

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { SchemaNodeType, SchemaTreeNode } from '@/lib/types';

import type { EditNodeCallbacks } from '../types';

// ---------------------------------------------------------------------------
// Editable type options (subset the editor supports directly)
// ---------------------------------------------------------------------------

const EDITABLE_TYPES: SchemaNodeType[] = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'null',
  'any',
];

const TYPE_LABELS: Partial<Record<SchemaNodeType, string>> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  object: 'object',
  array: 'array',
  null: 'null',
  any: 'any',
  enum: 'enum',
  union: 'union',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EditableNodeControlsProps {
  node: SchemaTreeNode;
  callbacks: EditNodeCallbacks;
  /** Called by the row when the rename icon is clicked */
  onStartRename: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditableNodeControls({
  node,
  callbacks,
  onStartRename,
}: EditableNodeControlsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descValue, setDescValue] = useState(node.description ?? '');
  const descInputRef = useRef<HTMLInputElement>(null);

  const isContainer = node.type === 'object' || node.type === 'array';

  function handleDeleteClick() {
    if (node.childCount > 0) {
      setConfirmOpen(true);
    } else {
      callbacks.onRemoveField(node.path);
    }
  }

  function handleConfirmDelete() {
    setConfirmOpen(false);
    callbacks.onRemoveField(node.path);
  }

  function handleDescSave() {
    callbacks.onUpdateDescription(node.path, descValue);
    setDescOpen(false);
  }

  return (
    <>
      {/* Inline control strip */}
      <span
        data-testid="editable-node-controls"
        className="ml-auto flex shrink-0 items-center gap-0.5 pl-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Type selector */}
        <select
          aria-label={`Change type of ${node.fieldName}`}
          data-testid="node-type-select"
          value={EDITABLE_TYPES.includes(node.type) ? node.type : 'any'}
          onChange={(e) =>
            callbacks.onChangeType(node.path, e.target.value as SchemaNodeType)
          }
          className="h-5 rounded border border-slate-600 bg-slate-800 px-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {EDITABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>

        {/* Required toggle */}
        <label className="flex items-center gap-0.5 cursor-pointer" title="Required">
          <input
            type="checkbox"
            aria-label={`Toggle required for ${node.fieldName}`}
            data-testid="node-required-toggle"
            checked={node.isRequired}
            onChange={() => callbacks.onToggleRequired(node.path)}
            className="h-3 w-3 rounded border-slate-500 bg-slate-800 accent-blue-500"
          />
          <span className="text-xs text-slate-500">req</span>
        </label>

        {/* Rename */}
        <button
          type="button"
          aria-label={`Rename ${node.fieldName}`}
          data-testid="node-rename-button"
          onClick={onStartRename}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        >
          <Pencil size={12} aria-hidden="true" />
        </button>

        {/* Description */}
        <button
          type="button"
          aria-label={`Edit description for ${node.fieldName}`}
          data-testid="node-description-button"
          onClick={(e) => {
            e.stopPropagation();
            setDescValue(node.description ?? '');
            setDescOpen((o) => !o);
            setTimeout(() => descInputRef.current?.focus(), 0);
          }}
          className="rounded p-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          title="Edit description"
        >
          ℹ
        </button>

        {/* Add child (containers only) */}
        {isContainer && (
          <button
            type="button"
            aria-label={`Add child field to ${node.fieldName}`}
            data-testid="node-add-child-button"
            onClick={() => callbacks.onAddField(node.path)}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        )}

        {/* Delete */}
        <button
          type="button"
          aria-label={`Delete ${node.fieldName}`}
          data-testid="node-delete-button"
          onClick={handleDeleteClick}
          className="rounded p-0.5 text-red-400 hover:bg-red-900/30 hover:text-red-300"
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </span>

      {/* Description inline input (shown below controls area, absolute) */}
      {descOpen && (
        <span
          className="absolute left-0 top-full z-20 w-full border border-slate-600 bg-slate-800 px-3 py-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={descInputRef}
            type="text"
            aria-label={`Description for ${node.fieldName}`}
            data-testid="node-description-input"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDescSave();
              if (e.key === 'Escape') setDescOpen(false);
            }}
            onBlur={handleDescSave}
            placeholder="Add description…"
            className="w-full bg-transparent text-xs text-slate-300 placeholder-slate-500 focus:outline-none"
          />
        </span>
      )}

      {/* Confirmation dialog for delete with children */}
      <ConfirmDialog
        open={confirmOpen}
        title="Remove field"
        message={`This field has ${node.childCount} ${node.childCount === 1 ? 'child' : 'children'} that will also be removed. Continue?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
