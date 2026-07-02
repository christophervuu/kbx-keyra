import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { useAdapter } from '@/lib/api';
import type { ProjectValueTable, ProjectValueTableRevisionRow, ValueTableValueType } from '@/lib/types';
import { PATHS } from '@/routes';

interface GlobalMapListRow {
  readonly map: ProjectValueTable;
  readonly mappingUsageCount: number;
  readonly projectUsageCount: number;
}

interface GlobalMapEditorState {
  name: string;
  description: string;
  sideAName: string;
  sideAType: ValueTableValueType;
  sideBName: string;
  sideBType: ValueTableValueType;
  rows: ProjectValueTableRevisionRow[];
}

const DEFAULT_EDITOR_STATE: GlobalMapEditorState = {
  name: '',
  description: '',
  sideAName: 'Side A',
  sideAType: 'string',
  sideBName: 'Side B',
  sideBType: 'string',
  rows: [],
};

function toSlugKey(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function GlobalValueMappingsLibraryPage() {
  const adapter = useAdapter();
  const navigate = useNavigate();

  const [rows, setRows] = useState<GlobalMapListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'name' | 'rowCount'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<GlobalMapEditorState>(DEFAULT_EDITOR_STATE);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const maps = await adapter.listGlobalValueMaps({
        query: query.trim() || undefined,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      });

      const usageList = await Promise.all(
        maps.map(async (map) => {
          const usage = await adapter.getGlobalValueMapUsage(map.id);
          return {
            map,
            mappingUsageCount: usage.counts.mappings,
            projectUsageCount: usage.counts.linkedProjects,
          } satisfies GlobalMapListRow;
        }),
      );

      const sorted = [...usageList].sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        if (sortBy === 'name') return a.map.name.localeCompare(b.map.name) * direction;
        if (sortBy === 'rowCount') {
          const aCount = a.map.currentRowCount ?? 0;
          const bCount = b.map.currentRowCount ?? 0;
          return (aCount - bCount) * direction;
        }
        return a.map.updatedAt.localeCompare(b.map.updatedAt) * direction;
      });

      setRows(sorted);
    } catch (loadError) {
      setRows([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load global value mappings.');
    } finally {
      setLoading(false);
    }
  }, [adapter, query, sortBy, sortDirection, statusFilter]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [load]);

  const openCreate = useCallback(() => {
    setEditorState(DEFAULT_EDITOR_STATE);
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const addRow = useCallback(() => {
    setEditorState((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          id: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          sideAValue: prev.sideAType === 'number' ? 0 : prev.sideAType === 'boolean' ? false : '',
          sideBValue: prev.sideBType === 'number' ? 0 : prev.sideBType === 'boolean' ? false : '',
          description: '',
        },
      ],
    }));
  }, []);

  const updateRow = useCallback((rowId: string, patch: Partial<ProjectValueTableRevisionRow>) => {
    setEditorState((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    }));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditorState((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== rowId),
    }));
  }, []);

  const createGlobalMap = useCallback(async () => {
    if (!editorState.name.trim()) {
      setEditorError('Value mapping name is required.');
      return;
    }
    if (!editorState.sideAName.trim() || !editorState.sideBName.trim()) {
      setEditorError('Both side names are required.');
      return;
    }
    if (editorState.rows.length === 0) {
      setEditorError('Add at least one mapping row before saving.');
      return;
    }

    setEditorSaving(true);
    setEditorError(null);
    try {
      await adapter.createGlobalValueMap({
        key: toSlugKey(editorState.name, 'value-map'),
        name: editorState.name,
        description: editorState.description || undefined,
        sideA: {
          key: toSlugKey(editorState.sideAName, 'side-a'),
          label: editorState.sideAName,
          type: editorState.sideAType,
        },
        sideB: {
          key: toSlugKey(editorState.sideBName, 'side-b'),
          label: editorState.sideBName,
          type: editorState.sideBType,
        },
        rows: editorState.rows,
      });
      setEditorOpen(false);
      await load();
    } catch (saveError) {
      setEditorError(saveError instanceof Error ? saveError.message : 'Failed to create value mapping.');
    } finally {
      setEditorSaving(false);
    }
  }, [adapter, editorState, load]);

  const hasRows = rows.length > 0;

  const body = useMemo(() => {
    if (loading) {
      return <p role="status" className="text-sm text-slate-400" data-testid="global-value-maps-loading">Loading value mappings…</p>;
    }

    if (error) {
      return (
        <div className="space-y-3" data-testid="global-value-maps-error">
          <p className="text-sm text-red-300">Failed to load global value mappings.</p>
          <p className="text-xs text-slate-400">{error}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>Retry</Button>
        </div>
      );
    }

    if (!hasRows) {
      return (
        <p className="text-sm text-slate-400" data-testid="global-value-maps-empty">
          No global value mappings found. Create one to start your reusable library.
        </p>
      );
    }

    return (
      <div className="overflow-auto rounded-md border border-slate-700" data-testid="global-value-maps-table">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Revision</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Match mode</th>
              <th className="px-3 py-2">Project usage</th>
              <th className="px-3 py-2">Mapping usage</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.map.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-100">{row.map.name}</p>
                  <p className="text-xs text-slate-400">{row.map.description ?? row.map.key}</p>
                </td>
                <td className="px-3 py-2 text-slate-200">r{row.map.currentRevision}</td>
                <td className="px-3 py-2 text-slate-200">{row.map.currentRowCount ?? 0}</td>
                <td className="px-3 py-2 text-slate-200">{row.map.defaultMatchMode ?? 'exact'}</td>
                <td className="px-3 py-2 text-slate-200">{row.projectUsageCount}</td>
                <td className="px-3 py-2 text-slate-200">{row.mappingUsageCount}</td>
                <td className="px-3 py-2 text-slate-300">{formatDate(row.map.updatedAt)}</td>
                <td className="px-3 py-2 text-slate-200">{row.map.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(PATHS.VALUE_MAPPING_DETAIL.replace(':valueMapId', row.map.id))}
                    >
                      View
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const latestRevision = await adapter.getGlobalValueMapRevision(row.map.id, row.map.currentRevision);
                        await adapter.createGlobalValueMap({
                          key: `${row.map.key}-copy-${Date.now()}`,
                          name: `${row.map.name} (Copy)`,
                          description: row.map.description,
                          sideA: latestRevision.sideA,
                          sideB: latestRevision.sideB,
                          rows: latestRevision.rows,
                        });
                        await load();
                      }}
                    >
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={row.map.status === 'archived'}
                      onClick={async () => {
                        await adapter.archiveGlobalValueMap(row.map.id);
                        await load();
                      }}
                    >
                      Archive
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [adapter, error, hasRows, load, loading, navigate, rows]);

  return (
    <div className="space-y-6" data-testid="page-global-value-mappings-library">
      <PageHeader
        title="Global Value Mappings"
        description="Manage reusable global value maps with immutable revision history."
        actions={<Button type="button" variant="secondary" size="sm" onClick={openCreate}>Create Value Mapping</Button>}
      />

      <Card title="Library" description="Search, filter, sort, and manage global value mappings." className="p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find by name, key, or side label"
              aria-label="Search global value mappings"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'archived')}
              aria-label="Filter by status"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Sort by</span>
            <select
              value={`${sortBy}:${sortDirection}`}
              onChange={(event) => {
                const [nextSort, nextDirection] = event.target.value.split(':') as ['updatedAt' | 'name' | 'rowCount', 'asc' | 'desc'];
                setSortBy(nextSort);
                setSortDirection(nextDirection);
              }}
              aria-label="Sort global value mappings"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
            >
              <option value="updatedAt:desc">Updated (newest)</option>
              <option value="updatedAt:asc">Updated (oldest)</option>
              <option value="name:asc">Name (A-Z)</option>
              <option value="name:desc">Name (Z-A)</option>
              <option value="rowCount:desc">Row count (high-low)</option>
              <option value="rowCount:asc">Row count (low-high)</option>
            </select>
          </label>
        </div>

        {body}
      </Card>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-testid="global-value-map-editor-overlay">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditorOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-value-map-editor-title"
            className="relative z-10 max-h-[88vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            data-testid="global-value-map-editor-dialog"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="global-value-map-editor-title" className="text-lg font-semibold text-slate-100">Create Global Value Mapping</h2>
                <p className="mt-1 text-sm text-slate-400">Saving creates immutable revision 1 for this global value map.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>Close</Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Value mapping name</span>
                <input
                  type="text"
                  value={editorState.name}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, name: event.target.value }))}
                  aria-label="Value mapping name"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  rows={2}
                  value={editorState.description}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, description: event.target.value }))}
                  aria-label="Value mapping description"
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <fieldset className="rounded-md border border-slate-700 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">Side A</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={editorState.sideAName}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideAName: event.target.value }))}
                    aria-label="Global side A name"
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                  />
                  <select
                    value={editorState.sideAType}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideAType: event.target.value as ValueTableValueType }))}
                    aria-label="Global side A type"
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
              </fieldset>

              <fieldset className="rounded-md border border-slate-700 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">Side B</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={editorState.sideBName}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideBName: event.target.value }))}
                    aria-label="Global side B name"
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                  />
                  <select
                    value={editorState.sideBType}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideBType: event.target.value as ValueTableValueType }))}
                    aria-label="Global side B type"
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
              </fieldset>
            </div>

            <div className="mt-4 space-y-3" data-testid="global-value-map-editor-rows">
              <Button type="button" variant="secondary" size="sm" onClick={addRow}>Add row</Button>
              <div className="overflow-auto rounded-md border border-slate-700">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">{editorState.sideAName || 'Side A'}</th>
                      <th className="px-3 py-2">{editorState.sideBName || 'Side B'}</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editorState.rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-800">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={String(row.sideAValue)}
                            onChange={(event) => updateRow(row.id, { sideAValue: event.target.value })}
                            aria-label={`Global row ${row.id} side A`}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={String(row.sideBValue)}
                            onChange={(event) => updateRow(row.id, { sideBValue: event.target.value })}
                            aria-label={`Global row ${row.id} side B`}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.description ?? ''}
                            onChange={(event) => updateRow(row.id, { description: event.target.value })}
                            aria-label={`Global row ${row.id} description`}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {editorError ? <p className="mt-3 text-sm text-red-300" data-testid="global-value-map-editor-error">{editorError}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" size="sm" onClick={() => void createGlobalMap()} loading={editorSaving} data-testid="global-value-map-editor-save">
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
