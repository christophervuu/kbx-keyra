import { useEffect, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { SchemaMetadata, SchemaRef } from '@/lib/types/domain';
import { Button } from '@/components/Button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLinkPickerProps {
  /** IDs of schemas already attached to the project */
  attachedSchemaIds: readonly string[];
  /** Called when the user confirms a schema selection */
  onConfirm: (ref: SchemaRef) => void;
  /** Called when the picker is dismissed */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal picker that lists all schemas not already attached to the project.
 * The user selects one and confirms to link it.
 */
export function SchemaLinkPicker({
  attachedSchemaIds,
  onConfirm,
  onClose,
}: SchemaLinkPickerProps) {
  const adapter = useAdapter();
  const [schemas, setSchemas] = useState<SchemaMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await adapter.listSchemas();
        if (!cancelled) {
          setSchemas(all.filter((s) => !attachedSchemaIds.includes(s.schemaId)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [adapter, attachedSchemaIds]);

  function handleConfirm() {
    if (!selectedId) return;
    onConfirm({ schemaId: selectedId, type: 'local' });
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="schema-link-picker-overlay"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link schema"
        className="relative z-10 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        data-testid="schema-link-picker"
      >
        <h2 className="mb-4 text-sm font-semibold text-slate-100">
          Link an existing schema
        </h2>

        {loading && (
          <p className="text-sm text-slate-400">Loading schemas…</p>
        )}

        {!loading && schemas.length === 0 && (
          <p className="text-sm text-slate-400">
            No unattached schemas available.
          </p>
        )}

        {!loading && schemas.length > 0 && (
          <ul
            className="mb-4 max-h-64 overflow-y-auto space-y-1 rounded border border-slate-700"
            role="listbox"
            aria-label="Available schemas"
          >
            {schemas.map((schema) => (
              <li
                key={schema.schemaId}
                role="option"
                aria-selected={selectedId === schema.schemaId}
                onClick={() => setSelectedId(schema.schemaId)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                  selectedId === schema.schemaId
                    ? 'bg-blue-600/20 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{schema.name}</span>
                <span className="text-xs text-slate-500">{schema.format}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selectedId}
            onClick={handleConfirm}
            data-testid="schema-link-confirm"
          >
            Link Schema
          </Button>
        </div>
      </div>
    </div>
  );
}
