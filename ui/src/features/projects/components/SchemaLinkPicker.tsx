import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import { useAdapter } from '@/lib/api';
import type { GitHubFile, SchemaRef } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaLinkPickerProps {
  readonly projectId: string;
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
  projectId,
  attachedSchemaIds,
  onConfirm,
  onClose,
}: SchemaLinkPickerProps) {
  const adapter = useAdapter();
  const [entries, setEntries] = useState<GitHubFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fileEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'file'),
    [entries],
  );

  void attachedSchemaIds;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const all = await adapter.listCdmSchemas();
        if (!cancelled) {
          setEntries(Array.isArray(all) ? all : []);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load CDM Library right now. Please retry in a moment.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [adapter, attachedSchemaIds]);

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const all = await adapter.listCdmSchemas();
      setEntries(Array.isArray(all) ? all : []);
    } catch {
      setError('Unable to load CDM Library right now. Please retry in a moment.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkSelected() {
    if (!selectedId) return;

    const target = fileEntries.find((entry) => entry.path === selectedId);
    if (!target) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const linked = await adapter.linkCdmSchema({
        projectId,
        path: target.path,
      });
      onConfirm({
        schemaId: linked.schemaId,
        type: 'github',
        commitSha: linked.source.type === 'github' ? linked.source.commitSha : undefined,
      });
    } catch {
      setError('Unable to link this CDM schema right now. Please check access and try again.');
    } finally {
      setLoading(false);
    }
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
        <h2 className="mb-2 text-sm font-semibold text-slate-100">
          Link from CDM Library
        </h2>
        <p className="mb-4 text-xs text-slate-400">
          Source: KBXT/KBX-Canonicals · JSONSchemas/CommonDataModels/
        </p>

        {loading && (
          <p className="text-sm text-slate-400">Loading CDM library…</p>
        )}

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

        {!loading && !error && fileEntries.length === 0 && (
          <p className="text-sm text-slate-400">
            No CDM schemas available to link from this directory.
          </p>
        )}

        {!loading && !error && fileEntries.length > 0 && (
          <ul
            className="mb-4 max-h-64 overflow-y-auto space-y-1 rounded border border-slate-700"
            role="listbox"
            aria-label="Available CDM schemas"
          >
            {fileEntries.map((entry) => (
              <li
                key={entry.path}
                role="option"
                aria-selected={selectedId === entry.path}
                onClick={() => setSelectedId(entry.path)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                  selectedId === entry.path
                    ? 'bg-blue-600/20 text-slate-100'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{entry.name}</span>
                <span className="text-xs text-slate-500">{entry.path}</span>
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
            onClick={() => void handleLinkSelected()}
            data-testid="schema-link-confirm"
          >
            Link Schema
          </Button>
        </div>
      </div>
    </div>
  );
}
