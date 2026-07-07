// SchemaLibraryPage — Assembled Schema Library page (FS-016 T-04)

import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { ActiveFilterChips } from './ActiveFilterChips';
import { SchemaLibraryCard } from './SchemaLibraryCard';
import { SchemaLibraryEmptyState } from './SchemaLibraryEmptyState';
import { SchemaLibraryFiltersPanel } from './SchemaLibraryFiltersPanel';
import { SchemaLibraryList } from './SchemaLibraryList';
import { SchemaLibraryNoResults } from './SchemaLibraryNoResults';
import { SchemaLibrarySearch } from './SchemaLibrarySearch';
import { SchemaLibrarySkeleton } from './SchemaLibrarySkeleton';
import { SchemaLibrarySortControl } from './SchemaLibrarySortControl';
import { SchemaLibraryViewToggle } from './SchemaLibraryViewToggle';
import { useSchemaLibrary } from '../hooks/use-schema-library';

import { PageHeader } from '@/components/PageHeader';
import { SchemaUploadDialog } from '@/features/projects/components/SchemaUploadDialog';
import { useAdapter } from '@/lib/api';

export function SchemaLibraryPage() {
  const adapter = useAdapter();
  const {
    items,
    filteredItems,
    totalCount,
    status,
    error,
    filters,
    sort,
    setSearch,
    toggleOwnershipFilter,
    toggleDataFormatFilter,
    toggleStatusFilter,
    toggleLifecycleFilter,
    setSort,
    viewMode,
    setViewMode,
    clearFilters,
    retry,
  } = useSchemaLibrary();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);

  const cachedRefreshMeta = status === 'success' ? (
    <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300" data-testid="schema-library-refresh-status">
      Showing cached schemas with background refresh support.
    </div>
  ) : null;

  async function handleSyncAllCdm() {
    setSyncNotice(null);
    setIsSyncing(true);

    try {
      const result = await adapter.syncAllCdmSchemas();
      setSyncNotice({
        tone: result.failed > 0 ? 'error' : 'success',
        message: `${result.message} Imported ${result.imported}, skipped ${result.skipped}, failed ${result.failed}.`,
      });
      retry();
    } catch (err) {
      setSyncNotice({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Failed to sync CDM models.',
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleSchemaCreated() {
    retry();
    setAddSchemaOpen(false);
  }

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => void handleSyncAllCdm()}
        disabled={isSyncing}
        data-testid="sync-cdm-models-button"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSyncing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
        Sync CDM Models
      </button>
      <button
        type="button"
        onClick={() => setAddSchemaOpen(true)}
        data-testid="add-schema-button"
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Plus size={14} aria-hidden="true" />
        Add Schema
      </button>
    </>
  );

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Schema Library"
          description="Your schema management hub for CDM and user schemas"
          actions={headerActions}
        />
        <SchemaLibrarySkeleton />
        <SchemaUploadDialog
          open={addSchemaOpen}
          onClose={() => setAddSchemaOpen(false)}
          onSchemaCreated={handleSchemaCreated}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error
  // ---------------------------------------------------------------------------

  if (status === 'error') {
    return (
      <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Schema Library"
          description="Your schema management hub for CDM and user schemas"
          actions={headerActions}
        />
        {syncNotice && (
          <div
            role="status"
            className={`rounded-md border px-4 py-3 text-sm ${
              syncNotice.tone === 'success'
                ? 'border-green-800 bg-green-950 text-green-300'
                : 'border-red-800 bg-red-950 text-red-300'
            }`}
            data-testid="schema-library-sync-notice"
          >
            {syncNotice.message}
          </div>
        )}
        <div
          role="alert"
          className="flex items-center justify-between rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
          data-testid="schema-library-error"
        >
          <span>{error ?? 'Failed to load schemas'}</span>
          <button
            type="button"
            onClick={retry}
            aria-label="Retry loading schemas"
            data-testid="retry-button"
            className="ml-4 rounded border border-red-700 px-3 py-1 text-xs text-red-300 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Retry
          </button>
        </div>
        <SchemaUploadDialog
          open={addSchemaOpen}
          onClose={() => setAddSchemaOpen(false)}
          onSchemaCreated={handleSchemaCreated}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success — no schemas exist at all
  // ---------------------------------------------------------------------------

  if (totalCount === 0) {
    return (
      <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Schema Library (0 schemas)"
          description="Your schema management hub for CDM and user schemas"
          actions={headerActions}
        />
        {syncNotice && (
          <div
            role="status"
            className={`rounded-md border px-4 py-3 text-sm ${
              syncNotice.tone === 'success'
                ? 'border-green-800 bg-green-950 text-green-300'
                : 'border-red-800 bg-red-950 text-red-300'
            }`}
            data-testid="schema-library-sync-notice"
          >
            {syncNotice.message}
          </div>
        )}
        <SchemaLibraryEmptyState />
        <SchemaUploadDialog
          open={addSchemaOpen}
          onClose={() => setAddSchemaOpen(false)}
          onSchemaCreated={handleSchemaCreated}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success — schemas exist, determine if filters yield no results
  // ---------------------------------------------------------------------------

  const hasActiveFilters =
    filters.search.length > 0
    || filters.ownerships.length > 0
    || filters.dataFormats.length > 0
    || filters.statuses.length > 0
    || filters.lifecycles.length > 0;

  return (
    <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
      <PageHeader
        title={`Schema Library (${totalCount} schema${totalCount !== 1 ? 's' : ''})`}
        description="Your schema management hub for CDM and user schemas"
        actions={headerActions}
      />

      {cachedRefreshMeta}

      {syncNotice && (
        <div
          role="status"
          className={`rounded-md border px-4 py-3 text-sm ${
            syncNotice.tone === 'success'
              ? 'border-green-800 bg-green-950 text-green-300'
              : 'border-red-800 bg-red-950 text-red-300'
          }`}
          data-testid="schema-library-sync-notice"
        >
          {syncNotice.message}
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1">
            <SchemaLibrarySearch
              value={filters.search}
              onChange={setSearch}
              resultCount={filteredItems.length}
              totalCount={items.length}
            />
          </div>
          <div className="flex items-center gap-2">
            <SchemaLibrarySortControl field={sort.field} direction={sort.direction} onSort={setSort} />
            <SchemaLibraryViewToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        <SchemaLibraryFiltersPanel
          ownerships={filters.ownerships}
          dataFormats={filters.dataFormats}
          statuses={filters.statuses}
          lifecycles={filters.lifecycles}
          onToggleOwnership={toggleOwnershipFilter}
          onToggleDataFormat={toggleDataFormatFilter}
          onToggleStatus={toggleStatusFilter}
          onToggleLifecycle={toggleLifecycleFilter}
        />

        <ActiveFilterChips
          ownerships={filters.ownerships}
          dataFormats={filters.dataFormats}
          statuses={filters.statuses}
          lifecycles={filters.lifecycles}
          onRemoveOwnership={toggleOwnershipFilter}
          onRemoveDataFormat={toggleDataFormatFilter}
          onRemoveStatus={toggleStatusFilter}
          onRemoveLifecycle={toggleLifecycleFilter}
          onClearAll={clearFilters}
        />
      </div>

      {/* Results */}
      {filteredItems.length === 0 && hasActiveFilters ? (
        <SchemaLibraryNoResults onClearFilters={clearFilters} />
      ) : viewMode === 'list' ? (
        <SchemaLibraryList items={filteredItems} />
      ) : (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          data-testid="schema-card-grid"
        >
          {filteredItems.map((item) => (
            <SchemaLibraryCard key={item.schemaId} item={item} />
          ))}
        </div>
      )}

      <SchemaUploadDialog
        open={addSchemaOpen}
        onClose={() => setAddSchemaOpen(false)}
        onSchemaCreated={handleSchemaCreated}
      />
    </div>
  );
}
