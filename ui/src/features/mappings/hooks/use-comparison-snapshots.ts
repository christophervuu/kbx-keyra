import { useCallback, useEffect, useState } from 'react';

import type { ComparisonSnapshot } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'keyra:comparison-snapshots:';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(mappingId: string): string {
  return `${STORAGE_KEY_PREFIX}${mappingId}`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readFromStorage(mappingId: string): ComparisonSnapshot[] {
  try {
    const raw = localStorage.getItem(storageKey(mappingId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        `[useComparisonSnapshots] Corrupted localStorage value for key "${storageKey(mappingId)}" — resetting to empty array.`,
      );
      return [];
    }
    return parsed as ComparisonSnapshot[];
  } catch {
    console.warn(
      `[useComparisonSnapshots] Failed to parse localStorage value for key "${storageKey(mappingId)}" — resetting to empty array.`,
    );
    return [];
  }
}

function writeToStorage(mappingId: string, snapshots: ComparisonSnapshot[]): void {
  try {
    localStorage.setItem(storageKey(mappingId), JSON.stringify(snapshots));
  } catch {
    // Silently fail on quota exceeded — snapshots are non-critical
  }
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export interface UseComparisonSnapshotsResult {
  /** All snapshots for this mapping, in insertion order (newest last) */
  snapshots: ComparisonSnapshot[];
  /** Filter snapshots by test case ID */
  snapshotsForTestCase: (testCaseId: string) => ComparisonSnapshot[];
  /**
   * Save a new snapshot. Generates a unique ID and persists to localStorage.
   * Returns the saved snapshot (with generated ID).
   */
  saveSnapshot: (snapshot: Omit<ComparisonSnapshot, 'id'>) => ComparisonSnapshot;
  /** Remove a single snapshot by ID */
  deleteSnapshot: (snapshotId: string) => void;
  /** Remove all snapshots linked to a test case */
  deleteSnapshotsForTestCase: (testCaseId: string) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages ComparisonSnapshot CRUD with localStorage persistence scoped to a mapping.
 *
 * Storage key: `keyra:comparison-snapshots:{mappingId}`
 *
 * Snapshots are stored independently from TestCase records (Q2 resolution).
 * They are linked to test cases by `testCaseId` field only.
 *
 * Reactive: `snapshots` updates after every save/delete operation.
 */
export function useComparisonSnapshots(mappingId: string): UseComparisonSnapshotsResult {
  const [snapshots, setSnapshots] = useState<ComparisonSnapshot[]>(() =>
    readFromStorage(mappingId),
  );

  // Reload when mappingId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSnapshots(readFromStorage(mappingId));
  }, [mappingId]);

  const snapshotsForTestCase = useCallback(
    (testCaseId: string): ComparisonSnapshot[] => {
      return snapshots.filter((s) => s.testCaseId === testCaseId);
    },
    [snapshots],
  );

  const saveSnapshot = useCallback(
    (snapshot: Omit<ComparisonSnapshot, 'id'>): ComparisonSnapshot => {
      const newSnapshot: ComparisonSnapshot = {
        ...snapshot,
        id: generateId(),
      };
      const updated = [...snapshots, newSnapshot];
      writeToStorage(mappingId, updated);
      setSnapshots(updated);
      return newSnapshot;
    },
    [mappingId, snapshots],
  );

  const deleteSnapshot = useCallback(
    (snapshotId: string): void => {
      const updated = snapshots.filter((s) => s.id !== snapshotId);
      writeToStorage(mappingId, updated);
      setSnapshots(updated);
    },
    [mappingId, snapshots],
  );

  const deleteSnapshotsForTestCase = useCallback(
    (testCaseId: string): void => {
      const updated = snapshots.filter((s) => s.testCaseId !== testCaseId);
      writeToStorage(mappingId, updated);
      setSnapshots(updated);
    },
    [mappingId, snapshots],
  );

  return {
    snapshots,
    snapshotsForTestCase,
    saveSnapshot,
    deleteSnapshot,
    deleteSnapshotsForTestCase,
  };
}
