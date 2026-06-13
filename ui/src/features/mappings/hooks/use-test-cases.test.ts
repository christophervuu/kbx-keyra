import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useTestCases } from './use-test-cases';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTestCases', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with empty array when no stored data', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));
    expect(result.current.testCases).toEqual([]);
  });

  it('loads existing test cases from localStorage on mount', () => {
    const existing = [
      { id: 'tc-1', name: 'Case 1', sourceData: '{"x":1}', createdAt: '2026-01-01T00:00:00Z' },
    ];
    localStorageMock.setItem('keyra:testcases:mapping-1', JSON.stringify(existing));

    const { result } = renderHook(() => useTestCases('mapping-1'));
    expect(result.current.testCases).toHaveLength(1);
    expect(result.current.testCases[0].name).toBe('Case 1');
    expect(result.current.testCases[0].externalSources).toBe('{}');
    expect(result.current.testCases[0].inputSets).toEqual([
      {
        id: 'tc-1',
        name: 'Case 1',
        sourceData: '{"x":1}',
        externalSources: '{}',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('preserves existing inputSets when present', () => {
    const existing = [
      {
        id: 'tc-1',
        name: 'Case 1',
        sourceData: '{"x":1}',
        externalSources: '{}',
        inputSets: [
          {
            id: 'is-1',
            name: 'Default',
            sourceData: '{"x":1}',
            externalSources: '{"customer":{"id":"c-1"}}',
            expectedOutput: '{"y":2}',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    localStorageMock.setItem('keyra:testcases:mapping-1', JSON.stringify(existing));

    const { result } = renderHook(() => useTestCases('mapping-1'));
    expect(result.current.testCases[0].inputSets).toEqual(existing[0].inputSets);
  });

  // -------------------------------------------------------------------------
  // saveTestCase
  // -------------------------------------------------------------------------

  it('saves a new test case with generated ID and ISO timestamp', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    let saveResult!: ReturnType<typeof result.current.saveTestCase>;
    act(() => {
      saveResult = result.current.saveTestCase({ name: 'test1', sourceData: '{"x":1}' });
    });

    expect(saveResult.success).toBe(true);
    expect(result.current.testCases).toHaveLength(1);

    const saved = result.current.testCases[0];
    expect(saved.name).toBe('test1');
    expect(saved.sourceData).toBe('{"x":1}');
    expect(saved.externalSources).toBe('{}');
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(saved.inputSets).toHaveLength(1);
    expect(saved.inputSets?.[0]).toMatchObject({
      name: 'test1',
      sourceData: '{"x":1}',
      externalSources: '{}',
    });
  });

  it('saves a new test case with provided externalSources payload', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({
        name: 'with externals',
        sourceData: '{"x":1}',
        externalSources: '{"customerProfile":{"id":"c-1"}}',
      });
    });

    expect(result.current.testCases[0].externalSources).toBe('{"customerProfile":{"id":"c-1"}}');
  });

  it('saves a test case with optional expectedOutput', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({
        name: 'with expected',
        sourceData: '{"x":1}',
        expectedOutput: '{"y":2}',
      });
    });

    expect(result.current.testCases[0].expectedOutput).toBe('{"y":2}');
  });

  it('omits expectedOutput field when not provided', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'no expected', sourceData: '{"x":1}' });
    });

    expect(Object.prototype.hasOwnProperty.call(result.current.testCases[0], 'expectedOutput')).toBe(false);
  });

  it('persists to localStorage under correct key', () => {
    const { result } = renderHook(() => useTestCases('mapping-abc'));

    act(() => {
      result.current.saveTestCase({ name: 'basic test', sourceData: '{"x":1}' });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testcases:mapping-abc',
      expect.stringContaining('"basic test"'),
    );
  });

  it('testCases array updates reactively after save', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    expect(result.current.testCases).toHaveLength(0);

    act(() => {
      result.current.saveTestCase({ name: 'a', sourceData: '{}' });
    });

    expect(result.current.testCases).toHaveLength(1);

    act(() => {
      result.current.saveTestCase({ name: 'b', sourceData: '{}' });
    });

    expect(result.current.testCases).toHaveLength(2);
  });

  it('returns success: false with error message when quota is exceeded', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
      throw err;
    });

    const { result } = renderHook(() => useTestCases('mapping-1'));

    let saveResult!: ReturnType<typeof result.current.saveTestCase>;
    act(() => {
      saveResult = result.current.saveTestCase({ name: 'big', sourceData: '{}' });
    });

    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toBe('Storage full');
    // State should not update on failure
    expect(result.current.testCases).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // loadTestCase
  // -------------------------------------------------------------------------

  it('loadTestCase returns the test case by ID', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'find me', sourceData: '{"a":1}' });
    });

    const id = result.current.testCases[0].id;
    const found = result.current.loadTestCase(id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe('find me');
  });

  it('loadTestCase returns null for non-existent ID', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    const found = result.current.loadTestCase('does-not-exist');
    expect(found).toBeNull();
  });

  // -------------------------------------------------------------------------
  // deleteTestCase
  // -------------------------------------------------------------------------

  it('deleteTestCase removes the test case from state', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'to delete', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.deleteTestCase(id);
    });

    expect(result.current.testCases).toHaveLength(0);
  });

  it('deleteTestCase persists updated list to localStorage', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'to delete', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;
    vi.clearAllMocks(); // Reset call count

    act(() => {
      result.current.deleteTestCase(id);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testcases:mapping-1',
      expect.stringContaining('[]') || expect.not.stringContaining(id),
    );
  });

  it('deleteTestCase only removes the targeted test case', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'keep', sourceData: '{"keep":true}' });
    });
    act(() => {
      result.current.saveTestCase({ name: 'remove', sourceData: '{"remove":true}' });
    });

    // After two saves testCases has 2 entries
    const removeId = result.current.testCases.find((tc) => tc.name === 'remove')!.id;

    act(() => {
      result.current.deleteTestCase(removeId);
    });

    expect(result.current.testCases).toHaveLength(1);
    expect(result.current.testCases[0].name).toBe('keep');
  });

  it('deleteTestCase with non-existent ID is a no-op', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'keep', sourceData: '{}' });
    });

    act(() => {
      result.current.deleteTestCase('ghost-id');
    });

    expect(result.current.testCases).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // mappingId changes
  // -------------------------------------------------------------------------

  it('reloads test cases when mappingId changes', () => {
    const casesA = [
      { id: 'a1', name: 'Case A', sourceData: '{"a":1}', createdAt: '2026-01-01T00:00:00Z' },
    ];
    const casesB = [
      { id: 'b1', name: 'Case B', sourceData: '{"b":2}', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b2', name: 'Case B2', sourceData: '{"b":3}', createdAt: '2026-01-01T00:00:00Z' },
    ];

    localStorageMock.setItem('keyra:testcases:mapping-A', JSON.stringify(casesA));
    localStorageMock.setItem('keyra:testcases:mapping-B', JSON.stringify(casesB));

    let mappingId = 'mapping-A';
    const { result, rerender } = renderHook(() => useTestCases(mappingId));

    expect(result.current.testCases).toHaveLength(1);
    expect(result.current.testCases[0].name).toBe('Case A');

    mappingId = 'mapping-B';
    rerender();

    expect(result.current.testCases).toHaveLength(2);
    expect(result.current.testCases[0].name).toBe('Case B');
  });

  // -------------------------------------------------------------------------
  // Corrupted localStorage
  // -------------------------------------------------------------------------

  it('resets to empty array when localStorage value is corrupted JSON', () => {
    localStorageMock.setItem('keyra:testcases:mapping-bad', 'not valid json {{{');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useTestCases('mapping-bad'));

    expect(result.current.testCases).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('resets to empty array when localStorage value is non-array JSON', () => {
    localStorageMock.setItem('keyra:testcases:mapping-bad', JSON.stringify({ not: 'an array' }));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useTestCases('mapping-bad'));

    expect(result.current.testCases).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // renameTestCase
  // -------------------------------------------------------------------------

  it('renameTestCase updates the name of the targeted test case', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.renameTestCase(id, 'renamed');
    });

    expect(result.current.testCases[0].name).toBe('renamed');
  });

  it('renameTestCase persists the new name to localStorage', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;
    vi.clearAllMocks();

    act(() => {
      result.current.renameTestCase(id, 'renamed');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testcases:mapping-1',
      expect.stringContaining('"renamed"'),
    );
  });

  it('renameTestCase is a no-op for a non-existent ID', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'keep', sourceData: '{}' });
    });

    vi.clearAllMocks();

    act(() => {
      result.current.renameTestCase('ghost-id', 'should not appear');
    });

    expect(result.current.testCases[0].name).toBe('keep');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('renameTestCase only renames the targeted test case', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'first', sourceData: '{}' });
    });
    act(() => {
      result.current.saveTestCase({ name: 'second', sourceData: '{}' });
    });

    const firstId = result.current.testCases[0].id;

    act(() => {
      result.current.renameTestCase(firstId, 'first-renamed');
    });

    expect(result.current.testCases[0].name).toBe('first-renamed');
    expect(result.current.testCases[1].name).toBe('second');
  });

  // -------------------------------------------------------------------------
  // duplicateTestCase
  // -------------------------------------------------------------------------

  it('duplicateTestCase creates a copy with " (copy)" appended to the name', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{"x":1}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.duplicateTestCase(id);
    });

    expect(result.current.testCases).toHaveLength(2);
    expect(result.current.testCases[1].name).toBe('original (copy)');
  });

  it('duplicateTestCase assigns a new unique ID to the copy', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const originalId = result.current.testCases[0].id;

    act(() => {
      result.current.duplicateTestCase(originalId);
    });

    expect(result.current.testCases[1].id).not.toBe(originalId);
    expect(result.current.testCases[1].id).toBeTruthy();
  });

  it('duplicateTestCase copies sourceData and expectedOutput from the source', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{"x":1}', expectedOutput: '{"y":2}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.duplicateTestCase(id);
    });

    const copy = result.current.testCases[1];
    expect(copy.sourceData).toBe('{"x":1}');
    expect(copy.expectedOutput).toBe('{"y":2}');
  });

  it('duplicateTestCase returns the new TestCase object', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;
    let returned: ReturnType<typeof result.current.duplicateTestCase> = null;

    act(() => {
      returned = result.current.duplicateTestCase(id);
    });

    expect(returned).not.toBeNull();
    expect(returned!.name).toBe('original (copy)');
    expect(returned!.id).toBe(result.current.testCases[1].id);
  });

  it('duplicateTestCase appends the copy to the end of the list', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'a', sourceData: '{}' });
    });
    act(() => {
      result.current.saveTestCase({ name: 'b', sourceData: '{}' });
    });

    const firstId = result.current.testCases[0].id;

    act(() => {
      result.current.duplicateTestCase(firstId);
    });

    expect(result.current.testCases).toHaveLength(3);
    expect(result.current.testCases[2].name).toBe('a (copy)');
  });

  it('duplicateTestCase persists the copy to localStorage', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const id = result.current.testCases[0].id;
    vi.clearAllMocks();

    act(() => {
      result.current.duplicateTestCase(id);
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testcases:mapping-1',
      expect.stringContaining('"original (copy)"'),
    );
  });

  it('duplicateTestCase returns null for a non-existent ID', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));
    let returned: ReturnType<typeof result.current.duplicateTestCase> = null;

    act(() => {
      returned = result.current.duplicateTestCase('ghost-id');
    });

    expect(returned).toBeNull();
    expect(result.current.testCases).toHaveLength(0);
  });

  it('duplicateTestCase assigns a new createdAt timestamp', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'original', sourceData: '{}' });
    });

    const originalCreatedAt = result.current.testCases[0].createdAt;
    const id = result.current.testCases[0].id;

    // Advance time slightly so timestamps differ
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);

    act(() => {
      result.current.duplicateTestCase(id);
    });

    vi.useRealTimers();

    expect(result.current.testCases[1].createdAt).not.toBe(originalCreatedAt);
    expect(result.current.testCases[1].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // -------------------------------------------------------------------------
  // updateTestCase
  // -------------------------------------------------------------------------

  it('updateTestCase updates sourceData only', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'test', sourceData: '{"old":true}', expectedOutput: '{"y":1}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.updateTestCase(id, { sourceData: '{"new":true}' });
    });

    expect(result.current.testCases[0].sourceData).toBe('{"new":true}');
    expect(result.current.testCases[0].expectedOutput).toBe('{"y":1}');
  });

  it('updateTestCase updates expectedOutput only', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'test', sourceData: '{"x":1}', expectedOutput: '{"old":true}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.updateTestCase(id, { expectedOutput: '{"new":true}' });
    });

    expect(result.current.testCases[0].sourceData).toBe('{"x":1}');
    expect(result.current.testCases[0].expectedOutput).toBe('{"new":true}');
  });

  it('updateTestCase updates both sourceData and expectedOutput', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'test', sourceData: '{"old":true}', expectedOutput: '{"old":true}' });
    });

    const id = result.current.testCases[0].id;

    act(() => {
      result.current.updateTestCase(id, { sourceData: '{"new":true}', expectedOutput: '{"new":true}' });
    });

    expect(result.current.testCases[0].sourceData).toBe('{"new":true}');
    expect(result.current.testCases[0].expectedOutput).toBe('{"new":true}');
  });

  it('updateTestCase is a no-op for a non-existent ID', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'keep', sourceData: '{"x":1}' });
    });

    vi.clearAllMocks();

    act(() => {
      result.current.updateTestCase('ghost-id', { sourceData: '{"changed":true}' });
    });

    expect(result.current.testCases[0].sourceData).toBe('{"x":1}');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('updateTestCase persists changes to localStorage', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'test', sourceData: '{"old":true}' });
    });

    const id = result.current.testCases[0].id;
    vi.clearAllMocks();

    act(() => {
      result.current.updateTestCase(id, { sourceData: '{"new":true}' });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testcases:mapping-1',
      expect.stringContaining('"{\\"new\\":true}"'),
    );
  });

  it('updateTestCase only modifies the targeted test case', () => {
    const { result } = renderHook(() => useTestCases('mapping-1'));

    act(() => {
      result.current.saveTestCase({ name: 'first', sourceData: '{"first":true}' });
    });
    act(() => {
      result.current.saveTestCase({ name: 'second', sourceData: '{"second":true}' });
    });

    const firstId = result.current.testCases[0].id;

    act(() => {
      result.current.updateTestCase(firstId, { sourceData: '{"updated":true}' });
    });

    expect(result.current.testCases[0].sourceData).toBe('{"updated":true}');
    expect(result.current.testCases[1].sourceData).toBe('{"second":true}');
  });
});
