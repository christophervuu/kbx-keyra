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
  ValueTableUsageEntry,
  ValueTableValueType,
} from '@/lib/types';
import { PATHS } from '@/routes/paths';

interface ListState {
  tables: ProjectValueTable[];
  loading: boolean;
  error: string | null;
}

interface EditorFormState {
  tableId?: string;
  name: string;
  description: string;
  sideAName: string;
  sideAType: ValueTableValueType;
  sideBName: string;
  sideBType: ValueTableValueType;
  rows: ProjectValueTableRevisionRow[];
}

const DEFAULT_EDITOR_STATE: EditorFormState = {
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

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function coerceValue(raw: string, type: ValueTableValueType): string | number | boolean {
  if (type === 'number') {
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (type === 'boolean') {
    return raw.trim().toLowerCase() === 'true';
  }

  return raw;
}

function ensureRowId(row: ProjectValueTableRevisionRow, fallback: string): ProjectValueTableRevisionRow {
  return {
    ...row,
    id: row.id && row.id.trim().length > 0 ? row.id : fallback,
  };
}

function convertRevisionToEditorState(table: ProjectValueTable, revision: ProjectValueTableRevision): EditorFormState {
  return {
    tableId: table.id,
    name: table.name,
    description: table.description ?? '',
    sideAName: revision.sideA.label,
    sideAType: revision.sideA.type,
    sideBName: revision.sideB.label,
    sideBType: revision.sideB.type,
    rows: revision.rows.map((row, index) => ensureRowId(row, `row-${index + 1}`)),
  };
}

function formatCsvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function directionDiagnostics(rows: readonly ProjectValueTableRevisionRow[]) {
  const duplicateA = new Map<string, number>();
  const duplicateB = new Map<string, number>();

  for (const row of rows) {
    const aKey = JSON.stringify(row.sideAValue);
    const bKey = JSON.stringify(row.sideBValue);

    duplicateA.set(aKey, (duplicateA.get(aKey) ?? 0) + 1);
    duplicateB.set(bKey, (duplicateB.get(bKey) ?? 0) + 1);
  }

  const duplicateSideAValues = Array.from(duplicateA.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
  const duplicateSideBValues = Array.from(duplicateB.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value);

  return {
    aToBSupported: duplicateSideAValues.length === 0,
    bToASupported: duplicateSideBValues.length === 0,
    duplicateSideAValues,
    duplicateSideBValues,
  };
}

export function ProjectValueMappingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const adapter = useAdapter();
  const navigate = useNavigate();

  const [listState, setListState] = useState<ListState>({
    tables: [],
    loading: true,
    error: null,
  });
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'usedBy' | 'rowCount'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<ProjectValueTableRevision | null>(null);
  const [usageEntries, setUsageEntries] = useState<ValueTableUsageEntry[]>([]);
  const [projectNameLabel, setProjectNameLabel] = useState<string | undefined>(undefined);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<EditorFormState>(DEFAULT_EDITOR_STATE);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);

  const canLoad = typeof projectId === 'string' && projectId.trim().length > 0;
  useBreadcrumbLabel(projectId ?? '', projectNameLabel);

  useEffect(() => {
    if (!canLoad || !projectId) {
      return;
    }

    let cancelled = false;

    void adapter.getProject(projectId)
      .then((project) => {
        if (cancelled) return;
        setProjectNameLabel(project.name);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectNameLabel(projectId);
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, canLoad, projectId]);

  const loadTables = useCallback(async () => {
    if (!canLoad || !projectId) {
      return;
    }

    try {
      const tables = await adapter.listProjectValueTables(projectId, {
        query: query.trim() || undefined,
        sortBy,
        sortDirection,
      });
      setListState({ tables, loading: false, error: null });

      if (!selectedTableId && tables[0]) {
        setSelectedTableId(tables[0].id);
      } else if (selectedTableId && !tables.some((table) => table.id === selectedTableId)) {
        setSelectedTableId(tables[0]?.id ?? null);
      }
    } catch (error) {
      setListState({
        tables: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load value tables.',
      });
    }
  }, [adapter, canLoad, projectId, query, sortBy, sortDirection, selectedTableId]);

  useEffect(() => {
    if (!canLoad || !projectId) {
      return;
    }

    let cancelled = false;

    void adapter.listProjectValueTables(projectId, {
      query: query.trim() || undefined,
      sortBy,
      sortDirection,
    })
      .then((tables) => {
        if (cancelled) return;

        setListState({ tables, loading: false, error: null });

        if (!selectedTableId && tables[0]) {
          setSelectedTableId(tables[0].id);
        } else if (selectedTableId && !tables.some((table) => table.id === selectedTableId)) {
          setSelectedTableId(tables[0]?.id ?? null);
        }
      })
      .catch((error) => {
        if (cancelled) return;

        setListState({
          tables: [],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load value tables.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, canLoad, projectId, query, selectedTableId, sortBy, sortDirection]);

  useEffect(() => {
    const activeTable = listState.tables.find((table) => table.id === selectedTableId);
    if (!activeTable) {
      return;
    }

    let cancelled = false;

    async function loadDetail() {
      try {
        const [revision, usage] = await Promise.all([
          adapter.getProjectValueTableRevision(activeTable.id, activeTable.currentRevision),
          adapter.listProjectValueTableUsage(activeTable.id),
        ]);

        if (cancelled) return;
        setSelectedRevision(revision);
        setUsageEntries(usage);
      } catch {
        if (cancelled) return;
        setSelectedRevision(null);
        setUsageEntries([]);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [adapter, listState.tables, selectedTableId]);

  const selectedTable = useMemo(
    () => listState.tables.find((table) => table.id === selectedTableId) ?? null,
    [listState.tables, selectedTableId],
  );

  const directionSummary = useMemo(
    () => directionDiagnostics(selectedRevision?.rows ?? []),
    [selectedRevision?.rows],
  );

  const referencedCount = usageEntries.length;

  const openCreateEditor = useCallback(() => {
    setEditorState(DEFAULT_EDITOR_STATE);
    setEditorError(null);
    setEditorOpen(true);
  }, []);

  const openEditEditor = useCallback(async () => {
    if (!selectedTable || !selectedRevision) {
      return;
    }

    setEditorState(convertRevisionToEditorState(selectedTable, selectedRevision));
    setEditorError(null);
    setEditorOpen(true);
  }, [selectedRevision, selectedTable]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorSaving(false);
    setEditorError(null);
  }, []);

  const updateRow = useCallback(
    (rowId: string, next: Partial<ProjectValueTableRevisionRow>) => {
      setEditorState((prev) => ({
        ...prev,
        rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...next } : row)),
      }));
    },
    [],
  );

  const removeRow = useCallback((rowId: string) => {
    setEditorState((prev) => ({
      ...prev,
      rows: prev.rows.filter((row) => row.id !== rowId),
    }));
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

  const handleCsvImport = useCallback((csv: string) => {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      setEditorError('CSV must include a header and at least one data row.');
      return;
    }

    const [headerA = 'Side A', headerB = 'Side B'] = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map((line, index) => {
      const [rawA = '', rawB = '', description = ''] = parseCsvLine(line);
      return {
        id: `csv-row-${Date.now()}-${index}`,
        sideAValue: coerceValue(rawA, editorState.sideAType),
        sideBValue: coerceValue(rawB, editorState.sideBType),
        ...(description ? { description } : {}),
      } satisfies ProjectValueTableRevisionRow;
    });

    setEditorState((prev) => ({
      ...prev,
      sideAName: headerA || prev.sideAName,
      sideBName: headerB || prev.sideBName,
      rows,
    }));

    setEditorError(null);
  }, [editorState.sideAType, editorState.sideBType]);

  const handlePasteRows = useCallback((text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return;
    }

    const pastedRows = lines.map((line, index) => {
      const [rawA = '', rawB = '', description = ''] = line.includes('\t')
        ? line.split('\t')
        : parseCsvLine(line);

      return {
        id: `paste-row-${Date.now()}-${index}`,
        sideAValue: coerceValue(rawA, editorState.sideAType),
        sideBValue: coerceValue(rawB, editorState.sideBType),
        ...(description ? { description } : {}),
      } satisfies ProjectValueTableRevisionRow;
    });

    setEditorState((prev) => ({
      ...prev,
      rows: [...prev.rows, ...pastedRows],
    }));
  }, [editorState.sideAType, editorState.sideBType]);

  const handleExportSelected = useCallback(async () => {
    if (!selectedTable) return;

    try {
      const csv = await adapter.exportProjectValueTableCsv(
        selectedTable.id,
        selectedTable.currentRevision,
      );

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedTable.key}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // no-op, action remains best effort for now
    }
  }, [adapter, selectedTable]);

  const handleDuplicateSelected = useCallback(async () => {
    if (!selectedTable || !projectId) return;

    try {
      await adapter.duplicateProjectValueTable({
        projectId,
        valueTableId: selectedTable.id,
        name: `${selectedTable.name} (Copy)`,
      });
      await loadTables();
    } catch {
      // no-op
    }
  }, [adapter, loadTables, projectId, selectedTable]);

  const handleArchiveSelected = useCallback(async () => {
    if (!selectedTable) return;

    try {
      await adapter.archiveProjectValueTable(selectedTable.id);
      await loadTables();
    } catch {
      // no-op
    }
  }, [adapter, loadTables, selectedTable]);

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedTable) return;

    try {
      await adapter.deleteProjectValueTable(selectedTable.id);
      await loadTables();
    } catch {
      // no-op, blocked state represented by disabled button when usage exists
    }
  }, [adapter, loadTables, selectedTable]);

  const handleSaveEditor = useCallback(async () => {
    if (!projectId) {
      return;
    }

    if (!editorState.name.trim()) {
      setEditorError('Table name is required.');
      return;
    }

    if (!editorState.sideAName.trim() || !editorState.sideBName.trim()) {
      setEditorError('Both side names are required.');
      return;
    }

    if (editorState.rows.length === 0) {
      setEditorError('Add at least one row before saving.');
      return;
    }

    setEditorSaving(true);
    setEditorError(null);

    try {
      const sideAKey = toSlugKey(editorState.sideAName, 'side-a');
      const sideBKey = toSlugKey(editorState.sideBName, 'side-b');

      if (editorState.tableId) {
        await adapter.createProjectValueTableRevision(editorState.tableId, {
          valueTableId: editorState.tableId,
          sideA: {
            key: sideAKey,
            label: editorState.sideAName,
            type: editorState.sideAType,
          },
          sideB: {
            key: sideBKey,
            label: editorState.sideBName,
            type: editorState.sideBType,
          },
          rows: editorState.rows,
        });
      } else {
        await adapter.createProjectValueTable({
          projectId,
          key: toSlugKey(editorState.name, 'value-table'),
          name: editorState.name,
          description: editorState.description || undefined,
          sideA: {
            key: sideAKey,
            label: editorState.sideAName,
            type: editorState.sideAType,
          },
          sideB: {
            key: sideBKey,
            label: editorState.sideBName,
            type: editorState.sideBType,
          },
          rows: editorState.rows,
        });
      }

      closeEditor();
      await loadTables();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Failed to save value table.');
      setEditorSaving(false);
    }
  }, [
    adapter,
    closeEditor,
    editorState,
    loadTables,
    projectId,
  ]);

  if (!projectId) {
    return (
      <div data-testid="page-project-value-mappings">
        <p className="text-slate-400">No project ID provided.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-project-value-mappings">
      <PageHeader
        title="Value Mappings"
        description="Manage reusable project value tables with immutable revisions."
        actions={(
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', projectId))}
            >
              Back to Project
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={openCreateEditor}>
              Create Table
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]" data-testid="project-value-mappings-layout">
        <Card title="Tables" description="Search, sort, and manage tables." className="p-4">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Search</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Find by name, key, or side label"
                aria-label="Search value tables"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as 'name' | 'updatedAt' | 'usedBy' | 'rowCount')}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Sort value tables"
                >
                  <option value="updatedAt">Updated</option>
                  <option value="name">Name</option>
                  <option value="rowCount">Row count</option>
                  <option value="usedBy">Used by</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Direction</span>
                <select
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label="Sort direction"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
            </div>

            {listState.loading ? (
              <p className="text-sm text-slate-400" role="status" data-testid="value-table-list-loading">
                Loading value tables…
              </p>
            ) : listState.error ? (
              <div className="space-y-2 rounded-md border border-red-800 bg-red-950/30 p-3" data-testid="value-table-list-error">
                <p className="text-sm text-red-200">Failed to load value tables.</p>
                <p className="text-xs text-slate-400">{listState.error}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setListState((prev) => ({ ...prev, loading: true, error: null }));
                    setSelectedRevision(null);
                    setUsageEntries([]);
                    void loadTables();
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : listState.tables.length === 0 ? (
              <p className="text-sm text-slate-400" data-testid="value-table-list-empty">
                No value tables found. Create your first table to reuse mappings.
              </p>
            ) : (
              <ul className="space-y-2" data-testid="value-table-list">
                {listState.tables.map((table) => (
                  <li key={table.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTableId(table.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        table.id === selectedTableId
                          ? 'border-blue-600 bg-blue-950/30'
                          : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900'
                      }`}
                      data-testid={`value-table-list-item-${table.id}`}
                    >
                      <p className="text-sm font-medium text-slate-100">{table.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{table.key} · rev {table.currentRevision} · {table.status}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card
          title={selectedTable ? selectedTable.name : 'Table details'}
          description={selectedTable ? `${selectedTable.key} · revision ${selectedTable.currentRevision}` : 'Select a table to view details.'}
          className="p-4"
        >
          {!selectedTable ? (
            <p className="text-sm text-slate-400" data-testid="value-table-no-selection">
              Select a table from the list to inspect rows, direction validity, usage, and actions.
            </p>
          ) : (
            <div className="space-y-4" data-testid="value-table-details">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => void openEditEditor()} data-testid="value-table-edit-action">
                  Edit / New Revision
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleDuplicateSelected()} data-testid="value-table-duplicate-action">
                  Duplicate
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleExportSelected()} data-testid="value-table-export-action">
                  Export CSV
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleArchiveSelected()} disabled={selectedTable.status === 'archived'} data-testid="value-table-archive-action">
                  Archive
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void handleDeleteSelected()}
                  disabled={referencedCount > 0}
                  data-testid="value-table-delete-action"
                >
                  Delete
                </Button>
              </div>

              {referencedCount > 0 ? (
                <p className="rounded-md border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200" data-testid="value-table-delete-guard">
                  This table is referenced by {referencedCount} mapping{referencedCount === 1 ? '' : 's'} and cannot be deleted.
                </p>
              ) : null}

              {selectedRevision ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2" data-testid="value-table-direction-summary">
                    <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Direction</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {selectedRevision.sideA.label} → {selectedRevision.sideB.label}:{' '}
                        <span className={directionSummary.aToBSupported ? 'text-emerald-300' : 'text-amber-300'}>
                          {directionSummary.aToBSupported ? 'Supported' : 'Invalid (duplicate input values)'}
                        </span>
                      </p>
                      {!directionSummary.aToBSupported && directionSummary.duplicateSideAValues.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-200">
                          Duplicate {selectedRevision.sideA.label} values: {directionSummary.duplicateSideAValues.join(', ')}
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Direction</p>
                      <p className="mt-1 text-sm text-slate-200">
                        {selectedRevision.sideB.label} → {selectedRevision.sideA.label}:{' '}
                        <span className={directionSummary.bToASupported ? 'text-emerald-300' : 'text-amber-300'}>
                          {directionSummary.bToASupported ? 'Supported' : 'Invalid (duplicate input values)'}
                        </span>
                      </p>
                      {!directionSummary.bToASupported && directionSummary.duplicateSideBValues.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-200">
                          Duplicate {selectedRevision.sideB.label} values: {directionSummary.duplicateSideBValues.join(', ')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="overflow-auto rounded-md border border-slate-700" data-testid="value-table-rows-grid">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-800/70 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-3 py-2">{selectedRevision.sideA.label}</th>
                          <th className="px-3 py-2">{selectedRevision.sideB.label}</th>
                          <th className="px-3 py-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRevision.rows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-800">
                            <td className="px-3 py-2 text-slate-100">{String(row.sideAValue)}</td>
                            <td className="px-3 py-2 text-slate-100">{String(row.sideBValue)}</td>
                            <td className="px-3 py-2 text-slate-400">{row.description ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div data-testid="value-table-usage">
                    <h3 className="text-sm font-semibold text-slate-200">Usage</h3>
                    {usageEntries.length === 0 ? (
                      <p className="mt-1 text-sm text-slate-400">No mappings currently reference this table.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {usageEntries.map((entry) => (
                          <li key={`${entry.mappingId}-${entry.inputSideKey}-${entry.outputSideKey}`} className="rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                            <p className="font-medium text-slate-100">{entry.mappingName ?? entry.mappingId}</p>
                            <p className="text-xs text-slate-400">
                              Pinned revision {entry.pinnedRevision} · latest {entry.latestRevision} · {entry.direction}
                              {entry.newerRevisionAvailable ? ' · newer revision available' : ''}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400" role="status">Loading revision details…</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="presentation"
          data-testid="value-table-editor-overlay"
        >
          <div className="absolute inset-0 bg-black/60" onClick={closeEditor} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="value-table-editor-title"
            className="relative z-10 max-h-[88vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            data-testid="value-table-editor-dialog"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="value-table-editor-title" className="text-lg font-semibold text-slate-100">
                  {editorState.tableId ? 'Edit Value Table (Create Revision)' : 'Create Value Table'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Define side names/types, then manage rows with paste/import/export support.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={closeEditor} aria-label="Close value table editor">
                Close
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Table name</span>
                <input
                  type="text"
                  value={editorState.name}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  aria-label="Table name"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  value={editorState.description}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  rows={2}
                  aria-label="Table description"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2" data-testid="value-table-editor-sides">
              <fieldset className="rounded-md border border-slate-700 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-slate-500">Side A</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={editorState.sideAName}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideAName: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                    aria-label="Side A name"
                    placeholder="Side A name"
                  />
                  <select
                    value={editorState.sideAType}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideAType: event.target.value as ValueTableValueType }))}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                    aria-label="Side A type"
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
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                    aria-label="Side B name"
                    placeholder="Side B name"
                  />
                  <select
                    value={editorState.sideBType}
                    onChange={(event) => setEditorState((prev) => ({ ...prev, sideBType: event.target.value as ValueTableValueType }))}
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100"
                    aria-label="Side B type"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>
              </fieldset>
            </div>

            <div className="mt-4 space-y-3" data-testid="value-table-editor-rows">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={addRow}>
                  Add row
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const csv = window.prompt('Paste CSV contents (header + rows)');
                    if (csv) handleCsvImport(csv);
                  }}
                >
                  Import CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                    onClick={() => {
                    const header = [editorState.sideAName, editorState.sideBName, 'Description'];
                    const rows = editorState.rows.map((row) => [
                      String(row.sideAValue),
                      String(row.sideBValue),
                      row.description ?? '',
                    ]);
                    const csv = [header, ...rows].map((line) => line.map((value) => formatCsvValue(value)).join(',')).join('\n');
                    void navigator.clipboard?.writeText(csv);
                  }}
                >
                  Export CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const text = await navigator.clipboard?.readText?.();
                    if (text) handlePasteRows(text);
                  }}
                  aria-label="Paste rows from clipboard"
                >
                  Paste rows
                </Button>
              </div>

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
                            type={editorState.sideAType === 'number' ? 'number' : 'text'}
                            value={String(row.sideAValue)}
                            onChange={(event) => {
                              const value = editorState.sideAType === 'number'
                                ? Number(event.target.value)
                                : editorState.sideAType === 'boolean'
                                  ? event.target.value.toLowerCase() === 'true'
                                  : event.target.value;
                              updateRow(row.id, { sideAValue: value });
                            }}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                            aria-label={`Row ${row.id} side A value`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type={editorState.sideBType === 'number' ? 'number' : 'text'}
                            value={String(row.sideBValue)}
                            onChange={(event) => {
                              const value = editorState.sideBType === 'number'
                                ? Number(event.target.value)
                                : editorState.sideBType === 'boolean'
                                  ? event.target.value.toLowerCase() === 'true'
                                  : event.target.value;
                              updateRow(row.id, { sideBValue: value });
                            }}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                            aria-label={`Row ${row.id} side B value`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.description ?? ''}
                            onChange={(event) => updateRow(row.id, { description: event.target.value })}
                            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                            aria-label={`Row ${row.id} description`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(row.id)}
                            aria-label={`Remove row ${row.id}`}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {editorState.rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-400">
                          No rows yet. Add rows manually, paste from clipboard, or import CSV.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2" data-testid="value-table-editor-direction-diagnostics">
              {(() => {
                const diagnostics = directionDiagnostics(editorState.rows);
                return (
                  <>
                    <p className="text-sm text-slate-200">
                      {editorState.sideAName || 'Side A'} → {editorState.sideBName || 'Side B'}:{' '}
                      <span className={diagnostics.aToBSupported ? 'text-emerald-300' : 'text-amber-300'}>
                        {diagnostics.aToBSupported ? 'Supported' : 'Invalid'}
                      </span>
                    </p>
                    <p className="text-sm text-slate-200">
                      {editorState.sideBName || 'Side B'} → {editorState.sideAName || 'Side A'}:{' '}
                      <span className={diagnostics.bToASupported ? 'text-emerald-300' : 'text-amber-300'}>
                        {diagnostics.bToASupported ? 'Supported' : 'Invalid'}
                      </span>
                    </p>
                    {!diagnostics.aToBSupported && diagnostics.duplicateSideAValues.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-200">
                        Duplicate {editorState.sideAName || 'Side A'} inputs: {diagnostics.duplicateSideAValues.join(', ')}
                      </p>
                    ) : null}
                    {!diagnostics.bToASupported && diagnostics.duplicateSideBValues.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-200">
                        Duplicate {editorState.sideBName || 'Side B'} inputs: {diagnostics.duplicateSideBValues.join(', ')}
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </div>

            {editorError ? (
              <p className="mt-3 rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-200" data-testid="value-table-editor-error">
                {editorError}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleSaveEditor()}
                loading={editorSaving}
                data-testid="value-table-editor-save"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
