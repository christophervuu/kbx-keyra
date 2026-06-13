import { useCallback, useState } from 'react';

import type { TestCase, TestCaseInputSet } from '@/lib/types/domain';

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

function normalizeInputSet(raw: unknown): TestCaseInputSet | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const sourceData = typeof candidate.sourceData === 'string' ? candidate.sourceData : '';
  const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : '';
  const externalSources = typeof candidate.externalSources === 'string' ? candidate.externalSources : '{}';

  if (!id || !name || !sourceData || !createdAt) {
    return null;
  }

  const expectedOutput = typeof candidate.expectedOutput === 'string' ? candidate.expectedOutput : undefined;

  return {
    id,
    name,
    sourceData,
    externalSources,
    ...(expectedOutput !== undefined ? { expectedOutput } : {}),
    createdAt,
  };
}

function normalizeTestCase(raw: unknown): TestCase | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const sourceData = typeof candidate.sourceData === 'string' ? candidate.sourceData : '';
  const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : '';

  if (!id || !name || !sourceData || !createdAt) {
    return null;
  }

  const expectedOutput = typeof candidate.expectedOutput === 'string' ? candidate.expectedOutput : undefined;
  const externalSources = typeof candidate.externalSources === 'string' ? candidate.externalSources : '{}';

  let normalizedInputSets: readonly TestCaseInputSet[] | undefined;
  if (Array.isArray(candidate.inputSets)) {
    const parsedInputSets = candidate.inputSets
      .map((entry) => normalizeInputSet(entry))
      .filter((entry): entry is TestCaseInputSet => entry !== null);
    normalizedInputSets = parsedInputSets.length > 0 ? parsedInputSets : undefined;
  }

  const legacyPrimarySet = {
    id,
    name,
    sourceData,
    externalSources,
    ...(expectedOutput !== undefined ? { expectedOutput } : {}),
    createdAt,
  };

  const inputSets = normalizedInputSets ?? [legacyPrimarySet];

  return {
    id,
    name,
    sourceData,
    externalSources,
    ...(expectedOutput !== undefined ? { expectedOutput } : {}),
    inputSets,
    createdAt,
  };
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
    return parsed
      .map((entry) => normalizeTestCase(entry))
      .filter((entry): entry is TestCase => entry !== null);
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
  externalSources?: string;
  expectedOutput?: string;
  inputSets?: TestCase['inputSets'];
}

export interface SaveTestCaseResult {
  success: boolean;
  /** The ID of the newly created test case (only present on success) */
  id?: string;
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
  // Force rerender after localStorage writes so callers see latest values.
  const [, setVersion] = useState(0);
  const bumpVersion = useCallback(() => {
    setVersion((version) => version + 1);
  }, []);

  const testCases = readFromStorage(mappingId);

  const saveTestCase = useCallback(
    (params: SaveTestCaseParams): SaveTestCaseResult => {
      const currentCases = readFromStorage(mappingId);
      const newCase: TestCase = {
        id: generateId(),
        name: params.name,
        sourceData: params.sourceData,
        externalSources: params.externalSources ?? '{}',
        ...(params.expectedOutput !== undefined && { expectedOutput: params.expectedOutput }),
        inputSets: params.inputSets ?? [{
          id: generateId(),
          name: params.name,
          sourceData: params.sourceData,
          externalSources: params.externalSources ?? '{}',
          ...(params.expectedOutput !== undefined && { expectedOutput: params.expectedOutput }),
          createdAt: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
      };

      const updated = [...currentCases, newCase];
      const writeResult = writeToStorage(mappingId, updated);

      if (!writeResult.ok) {
        return { success: false, error: writeResult.error };
      }

      bumpVersion();
      return { success: true, id: newCase.id };
    },
    [bumpVersion, mappingId],
  );

  const loadTestCase = useCallback(
    (id: string): TestCase | null => {
      return testCases.find((tc) => tc.id === id) ?? null;
    },
    [testCases],
  );

  const deleteTestCase = useCallback(
    (id: string): void => {
      const updated = readFromStorage(mappingId).filter((tc) => tc.id !== id);
      writeToStorage(mappingId, updated);
      bumpVersion();
    },
    [bumpVersion, mappingId],
  );

  const renameTestCase = useCallback(
    (id: string, newName: string): void => {
      const currentCases = readFromStorage(mappingId);
      const idx = currentCases.findIndex((tc) => tc.id === id);
      if (idx === -1) return;
      const updated = currentCases.map((tc) => (tc.id === id ? { ...tc, name: newName } : tc));
      writeToStorage(mappingId, updated);
      bumpVersion();
    },
    [bumpVersion, mappingId],
  );

  const duplicateTestCase = useCallback(
    (id: string): TestCase | null => {
      const currentCases = readFromStorage(mappingId);
      const source = currentCases.find((tc) => tc.id === id);
      if (!source) return null;
      const copy: TestCase = {
        ...source,
        id: generateId(),
        name: `${source.name} (copy)`,
        createdAt: new Date().toISOString(),
      };
      const updated = [...currentCases, copy];
      writeToStorage(mappingId, updated);
      bumpVersion();
      return copy;
    },
    [bumpVersion, mappingId],
  );

  const updateTestCase = useCallback(
    (id: string, updates: Partial<Pick<TestCase, 'sourceData' | 'expectedOutput'>>): void => {
      const currentCases = readFromStorage(mappingId);
      const idx = currentCases.findIndex((tc) => tc.id === id);
      if (idx === -1) return;
      const updated = currentCases.map((tc) => (tc.id === id ? { ...tc, ...updates } : tc));
      writeToStorage(mappingId, updated);
      bumpVersion();
    },
    [bumpVersion, mappingId],
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
