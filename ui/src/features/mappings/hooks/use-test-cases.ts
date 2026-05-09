import { useCallback, useEffect, useState } from 'react';

import type { TestCase } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'keyra:testcases:';

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
  // Fallback for environments without crypto.randomUUID (e.g. old jsdom)
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readFromStorage(mappingId: string): readonly TestCase[] {
  try {
    const raw = localStorage.getItem(storageKey(mappingId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        `[useTestCases] Corrupted localStorage value for key "${storageKey(mappingId)}" — resetting to empty array.`,
      );
      return [];
    }
    return parsed as TestCase[];
  } catch {
    console.warn(
      `[useTestCases] Failed to parse localStorage value for key "${storageKey(mappingId)}" — resetting to empty array.`,
    );
    return [];
  }
}

function writeToStorage(mappingId: string, cases: readonly TestCase[]): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(storageKey(mappingId), JSON.stringify(cases));
    return { ok: true };
  } catch (err) {
    // DOMException: QuotaExceededError
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      return { ok: false, error: 'Storage full' };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Storage write failed' };
  }
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export interface SaveTestCaseParams {
  name: string;
  sourceData: string;
  expectedOutput?: string;
}

export interface SaveTestCaseResult {
  success: boolean;
  error?: string;
}

export interface UseTestCasesResult {
  /** All test cases for the current mapping, in insertion order */
  testCases: readonly TestCase[];
  /**
   * Save a new test case.
   * Returns `{ success: true }` on success, or `{ success: false, error }` if
   * storage is full or the write otherwise fails.
   */
  saveTestCase: (params: SaveTestCaseParams) => SaveTestCaseResult;
  /**
   * Find a test case by ID.
   * Returns the `TestCase` if found, `null` otherwise.
   */
  loadTestCase: (id: string) => TestCase | null;
  /** Remove a test case by ID and persist the updated list. */
  deleteTestCase: (id: string) => void;
  /**
   * Rename a test case by ID.
   * No-op if the ID does not exist.
   */
  renameTestCase: (id: string, newName: string) => void;
  /**
   * Duplicate a test case by ID.
   * Creates a copy with " (copy)" appended to the name, a new ID, and a new
   * `createdAt` timestamp. Appends the copy to the end of the list and persists.
   * Returns the new `TestCase` on success, or `null` if the source ID is not found.
   */
  duplicateTestCase: (id: string) => TestCase | null;
  /**
   * Partially update a test case's `sourceData` and/or `expectedOutput` fields.
   * No-op if the ID does not exist.
   */
  updateTestCase: (id: string, updates: Partial<Pick<TestCase, 'sourceData' | 'expectedOutput'>>) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages test case CRUD with localStorage persistence scoped to a mapping.
 *
 * Storage key: `keyra:testcases:{mappingId}`
 *
 * Reactive: `testCases` updates after every save/delete operation.
 * Corrupted localStorage values are reset to an empty array with a console warning.
 */
export function useTestCases(mappingId: string): UseTestCasesResult {
  const [testCases, setTestCases] = useState<readonly TestCase[]>(() =>
    readFromStorage(mappingId),
  );

  // Reload when mappingId changes
  useEffect(() => {
    setTestCases(readFromStorage(mappingId));
  }, [mappingId]);

  const saveTestCase = useCallback(
    (params: SaveTestCaseParams): SaveTestCaseResult => {
      const newCase: TestCase = {
        id: generateId(),
        name: params.name,
        sourceData: params.sourceData,
        ...(params.expectedOutput !== undefined && { expectedOutput: params.expectedOutput }),
        createdAt: new Date().toISOString(),
      };

      const updated = [...testCases, newCase];
      const writeResult = writeToStorage(mappingId, updated);

      if (!writeResult.ok) {
        return { success: false, error: writeResult.error };
      }

      setTestCases(updated);
      return { success: true };
    },
    [mappingId, testCases],
  );

  const loadTestCase = useCallback(
    (id: string): TestCase | null => {
      return testCases.find((tc) => tc.id === id) ?? null;
    },
    [testCases],
  );

  const deleteTestCase = useCallback(
    (id: string): void => {
      const updated = testCases.filter((tc) => tc.id !== id);
      writeToStorage(mappingId, updated);
      setTestCases(updated);
    },
    [mappingId, testCases],
  );

  const renameTestCase = useCallback(
    (id: string, newName: string): void => {
      const idx = testCases.findIndex((tc) => tc.id === id);
      if (idx === -1) return;
      const updated = testCases.map((tc) => (tc.id === id ? { ...tc, name: newName } : tc));
      writeToStorage(mappingId, updated);
      setTestCases(updated);
    },
    [mappingId, testCases],
  );

  const duplicateTestCase = useCallback(
    (id: string): TestCase | null => {
      const source = testCases.find((tc) => tc.id === id);
      if (!source) return null;
      const copy: TestCase = {
        ...source,
        id: generateId(),
        name: `${source.name} (copy)`,
        createdAt: new Date().toISOString(),
      };
      const updated = [...testCases, copy];
      writeToStorage(mappingId, updated);
      setTestCases(updated);
      return copy;
    },
    [mappingId, testCases],
  );

  const updateTestCase = useCallback(
    (id: string, updates: Partial<Pick<TestCase, 'sourceData' | 'expectedOutput'>>): void => {
      const idx = testCases.findIndex((tc) => tc.id === id);
      if (idx === -1) return;
      const updated = testCases.map((tc) => (tc.id === id ? { ...tc, ...updates } : tc));
      writeToStorage(mappingId, updated);
      setTestCases(updated);
    },
    [mappingId, testCases],
  );

  return {
    testCases,
    saveTestCase,
    loadTestCase,
    deleteTestCase,
    renameTestCase,
    duplicateTestCase,
    updateTestCase,
  };
}
