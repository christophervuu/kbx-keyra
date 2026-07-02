import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { PageHeader } from '@/components/PageHeader';
import { useAdapter } from '@/lib/api';
import type {
  ProjectValueTable,
  ProjectValueTableRevision,
  ProjectValueTableRevisionRow,
  ValueMapUsageSummary,
  ValueTableValueType,
} from '@/lib/types';
import { PATHS } from '@/routes';

interface EditorState {
  sideAName: string;
  sideAType: ValueTableValueType;
  sideBName: string;
  sideBType: ValueTableValueType;
  rows: ProjectValueTableRevisionRow[];
}

interface RevisionDiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

function toSlugKey(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

export function GlobalValueMappingDetailPage() {
  const { valueMapId } = useParams<{ valueMapId: string }>();
  const adapter = useAdapter();
  const navigate = useNavigate();

  const [map, setMap] = useState<ProjectValueTable | null>(null);
  const [activeRevision, setActiveRevision] = useState<ProjectValueTableRevision | null>(null);
  const [revisions, setRevisions] = useState<ProjectValueTableRevision[]>([]);
  const [usage, setUsage] = useState<ValueMapUsageSummary | null>(null);
  const [revisionDiffSummaryByRevision, setRevisionDiffSummaryByRevision] = useState<Record<number, RevisionDiffSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [savingRevision, setSavingRevision] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  useBreadcrumbLabel(valueMapId ?? '', map?.name ?? valueMapId);

  const load = useCallback(async () => {
    if (!valueMapId) return;
    setLoading(true);
    setError(null);
    try {
      const [mapData, revisionsData, usageData] = await Promise.all([
        adapter.getGlobalValueMap(valueMapId),
        adapter.listGlobalValueMapRevisions(valueMapId),
        adapter.getGlobalValueMapUsage(valueMapId),
      ]);
      setMap(mapData);
      setRevisions(revisionsData);
      const current = revisionsData.find((item) => item.revision === mapData.currentRevision) ?? revisionsData[0] ?? null;
      setActiveRevision(current);
      setUsage(usageData);

      const summaryEntries = await Promise.all(
        revisionsData
          .filter((revision) => revision.revision > 1)
          .map(async (revision) => {
            try {
              const diff = await adapter.getProjectValueTableRevisionDiff(
                valueMapId,
                revision.revision - 1,
                revision.revision,
              );
              return [
                revision.revision,
                {
                  added: diff.summary.counts.added,
                  removed: diff.summary.counts.removed,
                  changed: diff.summary.counts.changed,
                } satisfies RevisionDiffSummary,
              ] as const;
            } catch {
              return [revision.revision, { added: 0, removed: 0, changed: 0 } satisfies RevisionDiffSummary] as const;
            }
          }),
      );

      setRevisionDiffSummaryByRevision(Object.fromEntries(summaryEntries));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load value mapping details.');
      setMap(null);
      setRevisions([]);
      setActiveRevision(null);
      setUsage(null);
      setRevisionDiffSummaryByRevision({});
    } finally {
      setLoading(false);
    }
  }, [adapter, valueMapId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [load]);

  const openCreateRevision = useCallback(() => {
    if (!activeRevision) return;
    setEditorState({
      sideAName: activeRevision.sideA.label,
      sideAType: activeRevision.sideA.type,
      sideBName: activeRevision.sideB.label,
      sideBType: activeRevision.sideB.type,
      rows: [...activeRevision.rows],
    });
    setEditorError(null);
    setEditorOpen(true);
  }, [activeRevision]);

  const addRow = useCallback(() => {
    setEditorState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: [
          ...prev.rows,
          {
            id: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            sideAValue: '',
            sideBValue: '',
            description: '',
          },
        ],
      };
    });
  }, []);

  const updateRow = useCallback((rowId: string, patch: Partial<ProjectValueTableRevisionRow>) => {
    setEditorState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditorState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.filter((row) => row.id !== rowId),
      };
    });
  }, []);

  const createRevision = useCallback(async () => {
    if (!valueMapId || !editorState) return;
    if (!editorState.sideAName.trim() || !editorState.sideBName.trim()) {
      setEditorError('Both side names are required.');
      return;
    }
    if (editorState.rows.length === 0) {
      setEditorError('Add at least one row before creating a revision.');
      return;
    }

    setSavingRevision(true);
    setEditorError(null);
    try {
      await adapter.createGlobalValueMapRevision(valueMapId, {
        valueTableId: valueMapId,
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
      setEditorError(saveError instanceof Error ? saveError.message : 'Failed to create global map revision.');
    } finally {
      setSavingRevision(false);
    }
  }, [adapter, editorState, load, valueMapId]);

  const usageList = useMemo(() => usage?.mappings ?? [], [usage]);

  if (!valueMapId) {
    return <div data-testid="page-global-value-mapping-detail"><p className="text-slate-400">Missing value mapping ID.</p></div>;
  }

  return (
    <div className="space-y-6" data-testid="page-global-value-mapping-detail">
      <PageHeader
        title={map?.name ?? 'Global Value Mapping'}
        description={map ? `${map.key} · current revision r${map.currentRevision}` : 'Global value mapping detail'}
        actions={(
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(PATHS.VALUE_MAPPINGS)}
            >
              Back to Library
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void openCreateRevision()} disabled={!map}>
              Create New Revision
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!map || map.status === 'archived'}
              onClick={async () => {
                if (!valueMapId) return;
                await adapter.archiveGlobalValueMap(valueMapId);
                await load();
              }}
            >
              Archive
            </Button>
          </div>
        )}
      />

      {loading ? (
        <p role="status" className="text-sm text-slate-400" data-testid="global-value-map-detail-loading">Loading value mapping details…</p>
      ) : error ? (
        <Card className="p-4" data-testid="global-value-map-detail-error">
          <p className="text-sm text-red-300">Failed to load value mapping details.</p>
          <p className="mt-1 text-xs text-slate-400">{error}</p>
          <div className="mt-3"><Button type="button" variant="secondary" size="sm" onClick={() => void load()}>Retry</Button></div>
        </Card>
      ) : !map || !activeRevision ? (
        <p className="text-sm text-slate-400" data-testid="global-value-map-detail-empty">Value mapping not found.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-testid="global-value-map-detail-layout">
          <Card title="Rows" description={`Revision r${activeRevision.revision} · ${activeRevision.rowCount} rows`} className="p-4">
            <div className="overflow-auto rounded-md border border-slate-700" data-testid="global-value-map-rows-grid">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2">{activeRevision.sideA.label}</th>
                    <th className="px-3 py-2">{activeRevision.sideB.label}</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRevision.rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-100">{String(row.sideAValue)}</td>
                      <td className="px-3 py-2 text-slate-100">{String(row.sideBValue)}</td>
                      <td className="px-3 py-2 text-slate-400">{row.description ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-4">
            <Card title="Revision History" description="Immutable revisions (latest first)" className="p-4" data-testid="global-value-map-revision-history">
              {revisions.length === 0 ? (
                <p className="text-sm text-slate-400">No revisions.</p>
              ) : (
                <ul className="space-y-2">
                  {revisions.map((revision) => {
                    const summary = revisionDiffSummaryByRevision[revision.revision];
                    return (
                      <li key={revision.revision}>
                        <button
                          type="button"
                          className={`w-full rounded-md border px-3 py-2 text-left ${activeRevision.revision === revision.revision ? 'border-blue-600 bg-blue-950/30' : 'border-slate-700 bg-slate-950/40'}`}
                          onClick={() => setActiveRevision(revision)}
                        >
                          <p className="text-sm font-medium text-slate-100">Revision r{revision.revision}</p>
                          <p className="text-xs text-slate-400">{revision.rowCount} rows · {revision.createdAt}</p>
                          {summary ? (
                            <p className="mt-1 text-xs text-slate-400" data-testid={`revision-summary-r${revision.revision}`}>
                              +{summary.added} added · ~{summary.changed} changed · -{summary.removed} removed
                            </p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Usage" description="Projects and mappings using this value map" className="p-4" data-testid="global-value-map-usage">
              <p className="text-xs text-slate-500">Projects: {usage?.counts.linkedProjects ?? 0} · Mappings: {usage?.counts.mappings ?? 0}</p>
              {usageList.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No mappings currently reference this value map.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {usageList.map((entry) => (
                    <li key={`${entry.mappingId}-${entry.inputSideKey}-${entry.outputSideKey}`} className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm">
                      <p className="font-medium text-slate-100">{entry.mappingName ?? entry.mappingId}</p>
                      <p className="text-xs text-slate-400">Pinned r{entry.pinnedRevision} · latest r{entry.latestRevision} · {entry.direction}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {editorOpen && editorState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-testid="global-value-map-revision-editor-overlay">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditorOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="global-value-map-revision-editor-title" className="relative z-10 max-h-[88vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl" data-testid="global-value-map-revision-editor-dialog">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="global-value-map-revision-editor-title" className="text-lg font-semibold text-slate-100">Create Immutable Revision</h2>
                <p className="mt-1 text-sm text-slate-400">Saving creates a new immutable revision. Prior revisions remain read-only and inspectable.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>Close</Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <fieldset className="rounded-md border border-slate-700 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">Side A</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="text" value={editorState.sideAName} onChange={(event) => setEditorState((prev) => (prev ? { ...prev, sideAName: event.target.value } : prev))} aria-label="Revision side A name" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100" />
                  <select value={editorState.sideAType} onChange={(event) => setEditorState((prev) => (prev ? { ...prev, sideAType: event.target.value as ValueTableValueType } : prev))} aria-label="Revision side A type" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
              </fieldset>

              <fieldset className="rounded-md border border-slate-700 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">Side B</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="text" value={editorState.sideBName} onChange={(event) => setEditorState((prev) => (prev ? { ...prev, sideBName: event.target.value } : prev))} aria-label="Revision side B name" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100" />
                  <select value={editorState.sideBType} onChange={(event) => setEditorState((prev) => (prev ? { ...prev, sideBType: event.target.value as ValueTableValueType } : prev))} aria-label="Revision side B type" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
              </fieldset>
            </div>

            <div className="mt-4 space-y-3" data-testid="global-value-map-revision-editor-rows">
              <Button type="button" variant="secondary" size="sm" onClick={addRow}>Add row</Button>
              <div className="overflow-auto rounded-md border border-slate-700">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">{editorState.sideAName}</th>
                      <th className="px-3 py-2">{editorState.sideBName}</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editorState.rows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-800">
                        <td className="px-3 py-2"><input type="text" value={String(row.sideAValue)} onChange={(event) => updateRow(row.id, { sideAValue: event.target.value })} aria-label={`Revision row ${row.id} side A`} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><input type="text" value={String(row.sideBValue)} onChange={(event) => updateRow(row.id, { sideBValue: event.target.value })} aria-label={`Revision row ${row.id} side B`} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><input type="text" value={row.description ?? ''} onChange={(event) => updateRow(row.id, { description: event.target.value })} aria-label={`Revision row ${row.id} description`} className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" /></td>
                        <td className="px-3 py-2"><Button type="button" variant="ghost" size="sm" onClick={() => removeRow(row.id)}>Remove</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {editorError ? <p className="mt-3 text-sm text-red-300" data-testid="global-value-map-revision-editor-error">{editorError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>Cancel</Button>
              <Button type="button" variant="primary" size="sm" onClick={() => void createRevision()} loading={savingRevision} data-testid="global-value-map-revision-editor-save">Save New Revision</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
