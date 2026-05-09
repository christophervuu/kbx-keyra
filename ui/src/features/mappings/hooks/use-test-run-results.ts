import { useCallback, useEffect, useState } from 'react';

import type { TestRunResult } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'keyra:testresults:';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(mappingId: string): string {
  return `${STORAGE_KEY_PREFIX}${mappingId}`;
}

function readFromStorage(mappingId: string): Readonly<Record<string, TestRunResult>> {
  try {
    const raw = localStorage.getItem(storageKey(mappingId));
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `[useTestRunResults] Corrupted localStorage value for key "${storageKey(mappingId)}" — resetting to empty record.`,
      );
      return {};
    }
    return parsed as Record<string, TestRunResult>;
  } catch {
    console.warn(
      `[useTestRunResults] Failed to parse localStorage value for key "${storageKey(mappingId)}" — resetting to empty record.`,
    );
    return {};
  }
}

function writeToStorage(
  mappingId: string,
  results: Readonly<Record<string, TestRunResult>>,
): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(storageKey(mappingId), JSON.stringify(results));
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      return { ok: false, error: 'Storage full' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Storage write failed' };
  }
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export interface UseTestRunResultsResult {
  /** All run results for the current mapping, keyed by testCaseId */
  results: Readonly<Record<string, TestRunResult>>;
  /** Upsert a result for a test case and persist */
  recordResult: (testCaseId: string, result: TestRunResult) => void;
  /** Remove the result for a single test case and persist */
  clearResult: (testCaseId: string) => void;
  /** Remove all results for the current mapping */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages test run result persistence scoped to a mapping.
 *
 * Storage key: `keyra:testresults:{mappingId}`
 *
 * Results are stored as a flat `Record<string, TestRunResult>` keyed by
 * `testCaseId` for O(1) lookup. Corrupted localStorage values are reset to
 * an empty record with a console warning.
 */
export function useTestRunResults(mappingId: string): UseTestRunResultsResult {
  const [results, setResults] = useState<Readonly<Record<string, TestRunResult>>>(() =>
    readFromStorage(mappingId),
  );

  // Reload when mappingId changes
  useEffect(() => {
    setResults(readFromStorage(mappingId));
  }, [mappingId]);

  const recordResult = useCallback(
    (testCaseId: string, result: TestRunResult): void => {
      const updated = { ...results, [testCaseId]: result };
      writeToStorage(mappingId, updated);
      setResults(updated);
    },
    [mappingId, results],
  );

  const clearResult = useCallback(
    (testCaseId: string): void => {
      const { [testCaseId]: _removed, ...rest } = results;
      writeToStorage(mappingId, rest);
      setResults(rest);
    },
    [mappingId, results],
  );

  const clearAll = useCallback((): void => {
    writeToStorage(mappingId, {});
    setResults({});
  }, [mappingId]);

  return { results, recordResult, clearResult, clearAll };
}
