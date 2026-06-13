import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { useAdapter } from '@/lib/api';
import type { SchemaMetadata, SchemaRef } from '@/lib/types/domain';

export interface SchemaLinkPickerProps {
  readonly projectId: string;
  attachedSchemaIds: readonly string[];
  onConfirm: (ref: SchemaRef) => void;
  onClose: () => void;
}

export function SchemaLinkPicker({
  projectId,
  attachedSchemaIds,
  onConfirm,
  onClose,
}: SchemaLinkPickerProps) {
  const adapter = useAdapter();
  const [entries, setEntries] = useState<SchemaMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const availableSchemas = useMemo(
    () => entries.filter((entry) => !attachedSchemaIds.includes(entry.schemaId)),
    [entries, attachedSchemaIds],
  );

  void projectId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const all = await adapter.listSchemas();
        if (!cancelled) {
          setEntries(Array.isArray(all) ? all : []);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load schemas right now. Please retry in a moment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const all = await adapter.listSchemas();
      setEntries(Array.isArray(all) ? all : []);
    } catch {
      setError('Unable to load schemas right now. Please retry in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function handleLinkSelected() {
    if (!selectedId) return;

    const target = availableSchemas.find((entry) => entry.schemaId === selectedId);
    if (!target) return;

    onConfirm({
      schemaId: target.schemaId,
      type: target.source.type === 'github' ? 'github' : 'local',
      commitSha: target.source.type === 'github' ? target.source.commitSha : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="schema-link-picker-overlay"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link schema"
        className="relative z-10 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        data-testid="schema-link-picker"
      >
        <h2 className="mb-2 text-sm font-semibold text-slate-100">Link Existing Schema</h2>
        <p className="mb-4 text-xs text-slate-400">Choose a schema from the shared Schema Library.</p>

        {loading && <p className="text-sm text-slate-400">Loading schemas…</p>}

        {!loading && error && (
          <div className="mb-3 rounded border border-amber-600/30 bg-amber-950/40 p-3">
            <p className="text-sm text-amber-200">{error}</p>
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={() => void handleRetry()}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && availableSchemas.length === 0 && (
          <p className="text-sm text-slate-400">No schemas available to link.</p>
        )}

        {!loading && !error && availableSchemas.length > 0 && (
          <ul
            className="mb-4 max-h-64 overflow-y-auto space-y-1 rounded border border-slate-700"
            role="listbox"
            aria-label="Available schemas"
          >
            {availableSchemas.map((entry) => (
              <li
                key={entry.schemaId}
                role="option"
                aria-selected={selectedId === entry.schemaId}
                onClick={() => setSelectedId(entry.schemaId)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                  selectedId === entry.schemaId
                    ? 'bg-blue-600/20 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{entry.name}</span>
                <span className="text-xs text-slate-500">{entry.origin.toUpperCase()}</span>
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
            disabled={!selectedId || loading}
            onClick={handleLinkSelected}
            data-testid="schema-link-confirm"
          >
            Link Schema
          </Button>
        </div>
      </div>
    </div>
  );
}
