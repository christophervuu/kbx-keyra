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
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
    localStorageMock.setItem.mockImplementation(() => {
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
});
