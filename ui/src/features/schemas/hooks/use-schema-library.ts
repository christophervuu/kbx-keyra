// Hook: useSchemaLibrary (FS-016 T-01)
// Loads all schemas and projects, enriches into SchemaLibraryItem[], and
// exposes filter/sort state with actions. Follows the pattern from use-dashboard-data.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { filterSchemas, sortSchemas } from '../lib/schema-filters';
import type {
  DisplayFormat,
  FilterDataFormat,
  FilterOwnership,
  FilterStatus,
  SchemaLibraryFilters,
  SchemaLibraryItem,
  SchemaLibrarySort,
  SchemaLibraryViewMode,
  SortDirection,
  SortField,
  SyncStatus,
} from '../types';

import { useAdapter } from '@/lib/api';
import {
  normalizeSchemaOwnership,
  normalizeSchemaStatus,
  schemaDataFormatFromSourceKind,
  type SchemaMetadata,
} from '@/lib/types/domain';

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
  return 'JSON';
}

function deriveDataFormat(schema: SchemaMetadata): FilterDataFormat {
  if (schema.dataFormat != null) {
    return schema.dataFormat.toUpperCase() as FilterDataFormat;
  }

  const sourceKind = schema.sourceKind
    ?? (schema.inferred ? (schema.format === 'xsd' ? 'inferred_from_xml' : 'inferred_from_json') : undefined)
    ?? (schema.format === 'xsd' ? 'xsd' : 'json_schema');

  return schemaDataFormatFromSourceKind(sourceKind).toUpperCase() as FilterDataFormat;
}

function deriveOwnership(schema: SchemaMetadata): FilterOwnership {
  return normalizeSchemaOwnership({
    ownership: schema.ownership,
    origin: schema.origin,
  });
}

function deriveStatus(schema: SchemaMetadata): FilterStatus {
  const normalized = normalizeSchemaStatus({
    status: schema.status,
    inferred: schema.inferred,
    reviewedAt: schema.reviewedAt,
  });

  if (normalized === 'processing' || normalized === 'needs_review' || normalized === 'error') {
    return normalized;
  }

  return 'ready';
}

const VIEW_MODE_STORAGE_KEY = 'keyra.schemas.viewMode';

function readStoredViewMode(): SchemaLibraryViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'card' || stored === 'list') {
      return stored;
    }
  } catch {
    // ignore localStorage unavailability
  }

  return 'card';
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SchemaLibraryFilters = {
  search: '',
  ownerships: [],
  dataFormats: [],
  statuses: [],
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
  toggleOwnershipFilter: (ownership: FilterOwnership) => void;
  toggleDataFormatFilter: (format: FilterDataFormat) => void;
  toggleStatusFilter: (status: FilterStatus) => void;
  /** If direction is omitted and the same field is already selected, toggles direction. */
  setSort: (field: SortField, direction?: SortDirection) => void;
  viewMode: SchemaLibraryViewMode;
  setViewMode: (mode: SchemaLibraryViewMode) => void;
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
  const [viewMode, setViewModeState] = useState<SchemaLibraryViewMode>(readStoredViewMode);
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
            disambiguator: schema.disambiguator,
            origin: schema.origin,
            ownership: deriveOwnership(schema),
            dataFormat: deriveDataFormat(schema),
            status: deriveStatus(schema),
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

  const toggleOwnershipFilter = useCallback((ownership: FilterOwnership) => {
    setFilters((f) => ({
      ...f,
      ownerships: f.ownerships.includes(ownership)
        ? f.ownerships.filter((o) => o !== ownership)
        : [...f.ownerships, ownership],
    }));
  }, []);

  const toggleDataFormatFilter = useCallback((format: FilterDataFormat) => {
    setFilters((f) => ({
      ...f,
      dataFormats: f.dataFormats.includes(format)
        ? f.dataFormats.filter((fmt) => fmt !== format)
        : [...f.dataFormats, format],
    }));
  }, []);

  const toggleStatusFilter = useCallback((status: FilterStatus) => {
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(status)
        ? f.statuses.filter((value) => value !== status)
        : [...f.statuses, status],
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

  const setViewMode = useCallback((mode: SchemaLibraryViewMode) => {
    setViewModeState(mode);

    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore localStorage write failures
    }
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
    toggleOwnershipFilter,
    toggleDataFormatFilter,
    toggleStatusFilter,
    setSort,
    viewMode,
    setViewMode,
    clearFilters,
    retry,
  };
}
