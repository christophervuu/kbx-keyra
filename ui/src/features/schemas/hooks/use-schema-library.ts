// Hook: useSchemaLibrary (FS-016 T-01)
// Loads all schemas and projects, enriches into SchemaLibraryItem[], and
// exposes filter/sort state with actions. Follows the pattern from use-dashboard-data.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { filterSchemas, sortSchemas } from '../lib/schema-filters';
import type {
  DisplayFormat,
  SchemaLibraryFilters,
  SchemaLibraryItem,
  SchemaLibrarySort,
  SortDirection,
  SortField,
  SyncStatus,
} from '../types';

import { useAdapter } from '@/lib/api';
import type { SchemaMetadata, SchemaOrigin } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

function deriveSyncStatus(schema: SchemaMetadata): SyncStatus {
  if (schema.inferred === true) return 'inferred';
  if (schema.source.type === 'github') {
    return schema.syncStatus ?? 'synced';
  }
  // source.type === 'upload'
  return 'local';
}

function deriveDisplayFormat(schema: SchemaMetadata): DisplayFormat {
  if (schema.inferred === true) return 'Inferred';
  if (schema.format === 'xsd') return 'XSD';
  return 'JSON Schema';
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SchemaLibraryFilters = {
  search: '',
  origins: [],
  formats: [],
  scopes: [],
};

const DEFAULT_SORT: SchemaLibrarySort = {
  field: 'name',
  direction: 'asc',
};

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseSchemaLibraryResult {
  /** Full enriched list before filtering */
  items: SchemaLibraryItem[];
  /** Filtered + sorted list for display */
  filteredItems: SchemaLibraryItem[];
  status: 'loading' | 'success' | 'error';
  error: string | null;
  totalCount: number;
  filters: SchemaLibraryFilters;
  sort: SchemaLibrarySort;
  setSearch: (term: string) => void;
  toggleOriginFilter: (origin: SchemaOrigin) => void;
  toggleFormatFilter: (format: DisplayFormat) => void;
  toggleScopeFilter: (scope: 'global' | 'project') => void;
  /** If direction is omitted and the same field is already selected, toggles direction. */
  setSort: (field: SortField, direction?: SortDirection) => void;
  clearFilters: () => void;
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSchemaLibrary(): UseSchemaLibraryResult {
  const adapter = useAdapter();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SchemaLibraryItem[]>([]);
  const [filters, setFilters] = useState<SchemaLibraryFilters>(DEFAULT_FILTERS);
  const [sort, setSort_] = useState<SchemaLibrarySort>(DEFAULT_SORT);
  const [fetchKey, setFetchKey] = useState(0);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus('loading');
      setError(null);
      setItems([]);

      try {
        // Parallel load of schemas + projects
        const [schemas, projectList] = await Promise.all([
          adapter.listSchemas(),
          adapter.listProjects(),
        ]);

        if (cancelled) return;

        // N+1: fetch full project details to access schemaRefs
        const projectDetails = await Promise.all(
          projectList.map((p) => adapter.getProject(p.projectId)),
        );

        if (cancelled) return;

        // Build a map: schemaId → { count, names }
        const usageMap = new Map<string, { count: number; names: string[] }>();
        for (const project of projectDetails) {
          for (const ref of project.schemaRefs) {
            const existing = usageMap.get(ref.schemaId);
            if (existing) {
              existing.count += 1;
              existing.names.push(project.name);
            } else {
              usageMap.set(ref.schemaId, { count: 1, names: [project.name] });
            }
          }
        }

        // Enrich each schema into a SchemaLibraryItem
        const enriched: SchemaLibraryItem[] = schemas.map((schema) => {
          const usage = usageMap.get(schema.schemaId);
          return {
            schemaId: schema.schemaId,
            name: schema.name,
            description: schema.description,
            origin: schema.origin,
            scope: schema.scope,
            format: schema.format,
            displayFormat: deriveDisplayFormat(schema),
            fieldCount: schema.fieldCount,
            syncStatus: deriveSyncStatus(schema),
            projectCount: usage?.count ?? 0,
            projectNames: usage?.names ?? [],
            updatedAt: schema.updatedAt,
            createdAt: schema.createdAt,
          };
        });

        setItems(enriched);
        setStatus('success');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load schemas');
        setStatus('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adapter, fetchKey]);

  // ---------------------------------------------------------------------------
  // Derived: filtered + sorted
  // ---------------------------------------------------------------------------

  const filteredItems = useMemo(
    () => sortSchemas(filterSchemas(items, filters), sort),
    [items, filters, sort],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setSearch = useCallback((term: string) => {
    setFilters((f) => ({ ...f, search: term }));
  }, []);

  const toggleOriginFilter = useCallback((origin: SchemaOrigin) => {
    setFilters((f) => ({
      ...f,
      origins: f.origins.includes(origin)
        ? f.origins.filter((o) => o !== origin)
        : [...f.origins, origin],
    }));
  }, []);

  const toggleFormatFilter = useCallback((format: DisplayFormat) => {
    setFilters((f) => ({
      ...f,
      formats: f.formats.includes(format)
        ? f.formats.filter((fmt) => fmt !== format)
        : [...f.formats, format],
    }));
  }, []);

  const toggleScopeFilter = useCallback((scope: 'global' | 'project') => {
    setFilters((f) => ({
      ...f,
      scopes: f.scopes.includes(scope)
        ? f.scopes.filter((s) => s !== scope)
        : [...f.scopes, scope],
    }));
  }, []);

  const setSort = useCallback((field: SortField, direction?: SortDirection) => {
    setSort_((current) => {
      if (direction != null) {
        return { field, direction };
      }
      // Toggle direction if same field; default asc for new field
      if (current.field === field) {
        return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field, direction: 'asc' };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const retry = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return {
    items,
    filteredItems,
    status,
    error,
    totalCount: items.length,
    filters,
    sort,
    setSearch,
    toggleOriginFilter,
    toggleFormatFilter,
    toggleScopeFilter,
    setSort,
    clearFilters,
    retry,
  };
}
