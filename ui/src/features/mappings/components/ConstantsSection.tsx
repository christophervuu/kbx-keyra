import { useRef, useState } from 'react';
import { X } from 'lucide-react';

import { ConfirmDialog } from './ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConstantsSectionProps {
  /** Current constants map. Treat undefined as empty record. */
  constants: Readonly<Record<string, unknown>> | undefined;
  /** Called with the full updated record on add / edit / delete. */
  onUpdate: (constants: Record<string, unknown>) => void;
}

type InferredType = 'string' | 'number' | 'boolean';

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/**
 * Infers the scalar type of a raw string value entered by the user.
 * - Matches `/^-?\d+(\.\d+)?$/` → number
 * - "true" / "false" (case-insensitive) → boolean
 * - Everything else → string
 */
export function inferValueType(raw: string): InferredType {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return 'number';
  if (raw.toLowerCase() === 'true' || raw.toLowerCase() === 'false') return 'boolean';
  return 'string';
}

/**
 * Converts a raw string to the inferred scalar value.
 */
export function parseValue(raw: string): unknown {
  const type = inferValueType(raw);
  if (type === 'number') return Number(raw);
  if (type === 'boolean') return raw.toLowerCase() === 'true';
  return raw;
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

const TYPE_BADGE_CLASS: Record<InferredType, string> = {
  string: 'bg-slate-700 text-slate-300',
  number: 'bg-blue-900/60 text-blue-300',
  boolean: 'bg-purple-900/60 text-purple-300',
};

function TypeBadge({ type }: { type: InferredType }) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-xs font-medium ${TYPE_BADGE_CLASS[type]}`}
      data-testid={`type-badge-${type}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline-editable row
// ---------------------------------------------------------------------------

interface ConstantRowProps {
  constantKey: string;
  value: unknown;
  existingKeys: string[];
  onUpdate: (oldKey: string, newKey: string, newValue: unknown) => void;
  onDeleteRequest: (key: string) => void;
}

function ConstantRow({
  constantKey,
  value,
  existingKeys,
  onUpdate,
  onDeleteRequest,
}: ConstantRowProps) {
  const [editingField, setEditingField] = useState<'key' | 'value' | null>(null);
  const [editKey, setEditKey] = useState(constantKey);
  const [editValue, setEditValue] = useState(String(value));
  const [editError, setEditError] = useState<string | null>(null);

  const displayValue = String(value);
  const inferredType = inferValueType(displayValue);

  function commitEdit() {
    if (editingField === 'key') {
      const trimmed = editKey.trim();
      if (trimmed !== constantKey && existingKeys.includes(trimmed)) {
        setEditError('Key already exists');
        return;
      }
      onUpdate(constantKey, trimmed || constantKey, parseValue(editValue));
    } else if (editingField === 'value') {
      onUpdate(constantKey, constantKey, parseValue(editValue));
    }
    setEditingField(null);
    setEditError(null);
  }

  function cancelEdit() {
    setEditKey(constantKey);
    setEditValue(displayValue);
    setEditError(null);
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  return (
    <tr
      className="border-b border-slate-800 last:border-b-0"
      data-testid={`constant-row-${constantKey}`}
    >
      {/* Key cell */}
      <td className="py-1.5 pr-2 align-middle">
        {editingField === 'key' ? (
          <div>
            <input
              type="text"
              value={editKey}
              onChange={(e) => {
                setEditKey(e.target.value);
                setEditError(null);
              }}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              aria-label={`Edit key for ${constantKey}`}
              aria-invalid={editError !== null}
              className={[
                'w-full rounded border bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-200',
                'focus:outline-none focus:ring-1',
                editError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-slate-600 focus:ring-blue-500',
              ].join(' ')}
              data-testid={`constant-key-input-${constantKey}`}
            />
            {editError && (
              <p
                className="mt-0.5 text-xs text-red-400"
                role="alert"
                data-testid={`constant-key-error-${constantKey}`}
              >
                {editError}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditKey(constantKey);
              setEditingField('key');
            }}
            className="font-mono text-xs text-slate-200 hover:text-white focus:outline-none focus:underline"
            aria-label={`Edit key ${constantKey}`}
            data-testid={`constant-key-display-${constantKey}`}
          >
            {constantKey}
          </button>
        )}
      </td>

      {/* Value + type badge cell */}
      <td className="py-1.5 pr-2 align-middle">
        <div className="flex items-center gap-1.5">
          {editingField === 'value' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              autoFocus
              aria-label={`Edit value for ${constantKey}`}
              className="w-full rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid={`constant-value-input-${constantKey}`}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditValue(displayValue);
                setEditingField('value');
              }}
              className="max-w-[120px] truncate text-xs text-slate-300 hover:text-white focus:outline-none focus:underline"
              aria-label={`Edit value for ${constantKey}`}
              data-testid={`constant-value-display-${constantKey}`}
            >
              {displayValue}
            </button>
          )}
          <TypeBadge type={inferredType} />
        </div>
      </td>

      {/* Delete cell */}
      <td className="py-1.5 align-middle">
        <button
          type="button"
          onClick={() => onDeleteRequest(constantKey)}
          aria-label={`Delete constant ${constantKey}`}
          className="rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
          data-testid={`constant-delete-${constantKey}`}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// ConstantsSection
// ---------------------------------------------------------------------------

/**
 * "Constants" section content for ConfigurationPanel.
 *
 * Renders a key-value table with inline editing, type inference badges,
 * an add-row form, and delete confirmation dialogs.
 */
export function ConstantsSection({ constants, onUpdate }: ConstantsSectionProps) {
  const record = constants ?? {};
  const entries = Object.entries(record);

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const newKeyRef = useRef<HTMLInputElement>(null);

  const existingKeys = Object.keys(record);
  const isDuplicateKey = newKey.trim() !== '' && existingKeys.includes(newKey.trim());
  const isAddDisabled = newKey.trim() === '' || isDuplicateKey;

  function handleAdd() {
    const trimmedKey = newKey.trim();
    if (!trimmedKey) return;
    if (existingKeys.includes(trimmedKey)) {
      setAddError('Key already exists');
      return;
    }
    const updated = { ...record, [trimmedKey]: parseValue(newValue) };
    onUpdate(updated);
    setNewKey('');
    setNewValue('');
    setAddError(null);
    newKeyRef.current?.focus();
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  function handleRowUpdate(oldKey: string, newKey: string, newValue: unknown) {
    // Build new record: remove old key, insert (possibly renamed) key
    const updated: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k === oldKey) {
        updated[newKey] = newValue;
      } else {
        updated[k] = v;
      }
    }
    onUpdate(updated);
  }

  function handleDeleteConfirm() {
    if (pendingDelete !== null) {
      const updated = { ...record };
      delete updated[pendingDelete];
      onUpdate(updated);
      setPendingDelete(null);
    }
  }

  return (
    <div data-testid="constants-section">
      {/* Table of existing constants */}
      {entries.length === 0 ? (
        <p
          className="mb-3 text-xs italic text-slate-600"
          data-testid="constants-empty"
        >
          No constants defined
        </p>
      ) : (
        <table className="mb-3 w-full table-fixed" data-testid="constants-table">
          <colgroup>
            <col className="w-2/5" />
            <col className="w-2/5" />
            <col className="w-1/5" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-800">
              <th className="pb-1 text-left text-xs font-medium text-slate-500">Key</th>
              <th className="pb-1 text-left text-xs font-medium text-slate-500">Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, val]) => (
              <ConstantRow
                key={key}
                constantKey={key}
                value={val}
                existingKeys={existingKeys}
                onUpdate={handleRowUpdate}
                onDeleteRequest={setPendingDelete}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* Add row */}
      <div className="flex gap-2">
        <input
          ref={newKeyRef}
          type="text"
          value={newKey}
          onChange={(e) => {
            setNewKey(e.target.value);
            setAddError(null);
          }}
          onKeyDown={handleAddKeyDown}
          placeholder="CONSTANT_NAME"
          aria-label="New constant key"
          aria-describedby={addError ? 'constants-add-error' : undefined}
          aria-invalid={addError !== null}
          className={[
            'flex-1 rounded border bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200',
            'placeholder:text-slate-600 focus:outline-none focus:ring-1',
            addError
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-700 focus:ring-blue-500',
          ].join(' ')}
          data-testid="constants-new-key-input"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
          placeholder="value"
          aria-label="New constant value"
          className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid="constants-new-value-input"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAddDisabled}
          className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="constants-add-button"
        >
          Add
        </button>
      </div>

      {/* Add error */}
      {addError && (
        <p
          id="constants-add-error"
          className="mt-1 text-xs text-red-400"
          role="alert"
          data-testid="constants-add-error"
        >
          {addError}
        </p>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete constant"
        message="This constant may be referenced by rules. Removing it will cause validation errors."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
