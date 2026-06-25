import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { MappingConfig, MappingVersionEntry } from '@/lib/types/domain';
import { computeVersionDiff, generateChangeSummary } from '../lib';
import type { VersionDiff } from '../lib';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VersionHistoryEntry {
  readonly version: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly summary: string;
}

export interface UseVersionHistoryResult {
  /** Sorted version list (most recent first) with computed summaries */
  versions: readonly VersionHistoryEntry[];
  /** Whether versions are currently loading */
  isLoading: boolean;
  /** Whether no history exists (empty state) */
  isEmpty: boolean;
  /** Currently selected version for diff viewing (null = none selected) */
  selectedVersion: number | null;
  /** Select a version to view its diff */
  selectVersion: (version: number | null) => void;
  /** Computed diff between selected version and current (null if none selected) */
  selectedDiff: VersionDiff | null;
  /** Returns the config to restore for a given version number (null if not found) */
  getRestoreConfig: (version: number) => MappingConfig | null;
  /** Refresh the version list (call after save) */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the summary string for a version entry.
 * - First/only version: "Initial version — N rules"
 * - Others: diff against the previous (older) version
 */
function computeSummary(
  entry: MappingVersionEntry,
  prevEntry: MappingVersionEntry | undefined,
): string {
  if (!prevEntry || !prevEntry.config || !entry.config) {
    return `Initial version — ${entry.ruleCount} rules`;
  }
  const diff = computeVersionDiff(prevEntry.config, entry.config);
  const changeSummary = generateChangeSummary(diff);
  return changeSummary === 'No changes' ? 'No rule changes' : changeSummary;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVersionHistory(
  mappingId: string,
  currentConfig: MappingConfig | null,
): UseVersionHistoryResult {
  const adapter = useAdapter();

  const [rawVersions, setRawVersions] = useState<readonly MappingVersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const mountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await adapter.listMappingVersions(mappingId);
      if (!mountedRef.current) return;
      // Sort descending (most recent first)
      const sorted = [...entries].sort((a, b) => b.version - a.version);
      setRawVersions(sorted);
    } catch {
      if (!mountedRef.current) return;
      setRawVersions([]);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [adapter, mappingId]);

  useEffect(() => {
    mountedRef.current = true;
    void loadVersions();
    return () => {
      mountedRef.current = false;
    };
  }, [loadVersions]);

  // ---------------------------------------------------------------------------
  // Computed versions with summaries (memoized — only recomputes when rawVersions changes)
  // ---------------------------------------------------------------------------

  const versions = useMemo<readonly VersionHistoryEntry[]>(() => {
    // rawVersions is sorted descending; to compute diff against previous (older) version,
    // we need ascending order for the diff walk, then reverse back.
    const ascending = [...rawVersions].sort((a, b) => a.version - b.version);

    const withSummaries: VersionHistoryEntry[] = ascending.map((entry, index) => {
      const prevEntry = index > 0 ? ascending[index - 1] : undefined;
      return {
        version: entry.version,
        savedAt: entry.savedAt,
        savedBy: entry.savedBy,
        ruleCount: entry.ruleCount,
        summary: computeSummary(entry, prevEntry),
      };
    });

    // Return most recent first
    return withSummaries.reverse();
  }, [rawVersions]);

  // ---------------------------------------------------------------------------
  // Selected diff
  // ---------------------------------------------------------------------------

  const selectedDiff = useMemo<VersionDiff | null>(() => {
    if (selectedVersion === null || !currentConfig) return null;
    const entry = rawVersions.find((v) => v.version === selectedVersion);
    if (!entry || !entry.config) return null;
    return computeVersionDiff(entry.config, currentConfig);
  }, [selectedVersion, currentConfig, rawVersions]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const selectVersion = useCallback((version: number | null) => {
    setSelectedVersion(version);
  }, []);

  const getRestoreConfig = useCallback(
    (version: number): MappingConfig | null => {
      const entry = rawVersions.find((v) => v.version === version);
      return entry?.config ?? null;
    },
    [rawVersions],
  );

  const refresh = useCallback(() => {
    void loadVersions();
  }, [loadVersions]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isEmpty = !isLoading && versions.length === 0;

  return {
    versions,
    isLoading,
    isEmpty,
    selectedVersion,
    selectVersion,
    selectedDiff,
    getRestoreConfig,
    refresh,
  };
}
