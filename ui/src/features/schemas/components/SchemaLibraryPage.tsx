// SchemaLibraryPage — Assembled Schema Library page (FS-016 T-04)

import { PageHeader } from '@/components/PageHeader';

import { useSchemaLibrary } from '../hooks/use-schema-library';
import { ActiveFilterChips } from './ActiveFilterChips';
import { SchemaLibraryCard } from './SchemaLibraryCard';
import { SchemaLibraryEmptyState } from './SchemaLibraryEmptyState';
import { SchemaLibraryFiltersPanel } from './SchemaLibraryFiltersPanel';
import { SchemaLibraryNoResults } from './SchemaLibraryNoResults';
import { SchemaLibrarySearch } from './SchemaLibrarySearch';
import { SchemaLibrarySkeleton } from './SchemaLibrarySkeleton';
import { SchemaLibrarySortControl } from './SchemaLibrarySortControl';

export function SchemaLibraryPage() {
  const {
    items,
    filteredItems,
    totalCount,
    status,
    error,
    filters,
    sort,
    setSearch,
    toggleOriginFilter,
    toggleFormatFilter,
    toggleScopeFilter,
    setSort,
    clearFilters,
    retry,
  } = useSchemaLibrary();

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Schema Library"
          description="Browse and manage all schemas across projects"
        />
        <SchemaLibrarySkeleton />
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
          description="Browse and manage all schemas across projects"
        />
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
          description="Browse and manage all schemas across projects"
        />
        <SchemaLibraryEmptyState />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Success — schemas exist, determine if filters yield no results
  // ---------------------------------------------------------------------------

  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.origins.length > 0 ||
    filters.formats.length > 0 ||
    filters.scopes.length > 0;

  return (
    <div data-testid="page-schema-library" className="flex flex-col gap-6 p-6">
      <PageHeader
        title={`Schema Library (${totalCount} schema${totalCount !== 1 ? 's' : ''})`}
        description="Browse and manage all schemas across projects"
      />

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
          <SchemaLibrarySortControl field={sort.field} direction={sort.direction} onSort={setSort} />
        </div>

        <SchemaLibraryFiltersPanel
          origins={filters.origins}
          formats={filters.formats}
          scopes={filters.scopes}
          onToggleOrigin={toggleOriginFilter}
          onToggleFormat={toggleFormatFilter}
          onToggleScope={toggleScopeFilter}
        />

        <ActiveFilterChips
          origins={filters.origins}
          formats={filters.formats}
          scopes={filters.scopes}
          onRemoveOrigin={toggleOriginFilter}
          onRemoveFormat={toggleFormatFilter}
          onRemoveScope={toggleScopeFilter}
          onClearAll={clearFilters}
        />
      </div>

      {/* Results */}
      {filteredItems.length === 0 && hasActiveFilters ? (
        <SchemaLibraryNoResults onClearFilters={clearFilters} />
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
    </div>
  );
}
