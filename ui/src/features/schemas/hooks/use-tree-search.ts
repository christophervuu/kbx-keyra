import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { filterTree } from '../lib/tree-filter';
import type { TreeFilterResult } from '../lib/tree-filter';

import type { SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 250;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseTreeSearchReturn {
  /** Current input value (immediate) */
  query: string;
  /** Debounced query used for filtering */
  debouncedQuery: string;
  /** Update the search query */
  setQuery: (value: string) => void;
  /** Clear search and restore previous expand state */
  clearSearch: () => void;
  /** Whether a search is currently active (debounced query is non-empty) */
  isSearchActive: boolean;
  /** Filter result (only meaningful when search is active) */
  filterResult: TreeFilterResult;
  /** Expanded paths to use during search (ancestor paths of matches) */
  searchExpandedPaths: Set<string>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages search/filter state for the schema tree.
 * Handles debouncing, filter computation, and expand state preservation.
 */
export function useTreeSearch(
  nodes: SchemaTreeNode[],
  currentExpandedPaths: Set<string>,
  setExpandedPaths: (paths: Set<string>) => void,
): UseTreeSearchReturn {
  const [query, setQueryState] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const savedExpandedRef = useRef<Set<string> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the query
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [query]);

  // Compute filter result (memoized on debouncedQuery + nodes)
  const filterResult = useMemo(
    () => filterTree(nodes, debouncedQuery),
    [nodes, debouncedQuery],
  );

  // Compute search-expanded paths (all visible ancestor paths)
  const searchExpandedPaths = useMemo(() => {
    if (!debouncedQuery.trim()) return new Set<string>();
    // All visible paths that have children (i.e., are ancestors) should be expanded
    return filterResult.visiblePaths;
  }, [debouncedQuery, filterResult.visiblePaths]);

  const isSearchActive = debouncedQuery.trim().length > 0;

  // Save expand state when search starts
  const prevIsSearchActive = useRef(false);
  useEffect(() => {
    if (isSearchActive && !prevIsSearchActive.current) {
      // Search just became active — save current expand state
      savedExpandedRef.current = new Set(currentExpandedPaths);
    }
    prevIsSearchActive.current = isSearchActive;
  }, [isSearchActive, currentExpandedPaths]);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  const clearSearch = useCallback(() => {
    setQueryState('');
    setDebouncedQuery('');
    // Restore saved expand state
    if (savedExpandedRef.current) {
      setExpandedPaths(savedExpandedRef.current);
      savedExpandedRef.current = null;
    }
  }, [setExpandedPaths]);

  return {
    query,
    debouncedQuery,
    setQuery,
    clearSearch,
    isSearchActive,
    filterResult,
    searchExpandedPaths,
  };
}
