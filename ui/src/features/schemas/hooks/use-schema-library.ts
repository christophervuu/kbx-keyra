// Hook: useSchemaLibrary (FS-016 T-01, FS-103 T-04)
// Loads schemas through shared TanStack Query and exposes local filter/sort/view controls.

import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { loadSchemaLibraryData } from './schema-query-data';
import { filterSchemas, sortSchemas } from '../lib/schema-filters';
import type {
  FilterDataFormat,
  FilterOwnership,
  FilterStatus,
  SchemaLibraryFilters,
  SchemaLibraryItem,
  SchemaLibrarySort,
  SchemaLibraryViewMode,
  SortDirection,
  SortField,
} from '../types';

import { useAdapter } from '@/lib/api';
import { queryKeys, queryPolicies } from '@/lib/query';

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

const EMPTY_ITEMS: SchemaLibraryItem[] = [];

export interface UseSchemaLibraryResult {
  items: SchemaLibraryItem[];
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
  setSort: (field: SortField, direction?: SortDirection) => void;
  viewMode: SchemaLibraryViewMode;
  setViewMode: (mode: SchemaLibraryViewMode) => void;
  clearFilters: () => void;
  retry: () => void;
}

export function useSchemaLibrary(): UseSchemaLibraryResult {
  const adapter = useAdapter();

  const [filters, setFilters] = useState<SchemaLibraryFilters>(DEFAULT_FILTERS);
  const [sort, setSort_] = useState<SchemaLibrarySort>(DEFAULT_SORT);
  const [viewMode, setViewModeState] = useState<SchemaLibraryViewMode>(readStoredViewMode);

  const schemasQuery = useQuery({
    queryKey: queryKeys.schemas.all(),
    staleTime: queryPolicies.schemasList.staleTime,
    gcTime: queryPolicies.schemasList.gcTime,
    retry: false,
    queryFn: () => loadSchemaLibraryData(adapter),
  });

  const items = schemasQuery.data?.items ?? EMPTY_ITEMS;

  const status: 'loading' | 'success' | 'error' =
    !schemasQuery.data && schemasQuery.isPending
      ? 'loading'
      : schemasQuery.isError && !schemasQuery.data
        ? 'error'
        : 'success';

  const error = schemasQuery.error instanceof Error ? schemasQuery.error.message : null;

  const filteredItems = useMemo(() => sortSchemas(filterSchemas(items, filters), sort), [items, filters, sort]);

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

  const toggleStatusFilter = useCallback((statusValue: FilterStatus) => {
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(statusValue)
        ? f.statuses.filter((value) => value !== statusValue)
        : [...f.statuses, statusValue],
    }));
  }, []);

  const setSort = useCallback((field: SortField, direction?: SortDirection) => {
    setSort_((current) => {
      if (direction != null) {
        return { field, direction };
      }

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
    void schemasQuery.refetch();
  }, [schemasQuery]);

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
