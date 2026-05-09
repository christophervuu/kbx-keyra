import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { TestRunResult } from '@/lib/types/domain';
import { useTestRunResults } from './use-test-run-results';

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
// Fixtures
// ---------------------------------------------------------------------------

function makeResult(testCaseId: string, overrides?: Partial<TestRunResult>): TestRunResult {
  return {
    testCaseId,
    status: 'pass',
    errorCount: 0,
    warningCount: 0,
    executedAt: '2026-01-01T00:00:00Z',
    durationMs: 42,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTestRunResults', () => {
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

  it('starts with empty record when no stored data', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));
    expect(result.current.results).toEqual({});
  });

  it('loads existing results from localStorage on mount', () => {
    const existing: Record<string, TestRunResult> = {
      'tc-1': makeResult('tc-1', { status: 'fail', errorCount: 2 }),
    };
    localStorageMock.setItem('keyra:testresults:mapping-1', JSON.stringify(existing));

    const { result } = renderHook(() => useTestRunResults('mapping-1'));
    expect(result.current.results['tc-1']).toBeDefined();
    expect(result.current.results['tc-1'].status).toBe('fail');
    expect(result.current.results['tc-1'].errorCount).toBe(2);
  });

  // -------------------------------------------------------------------------
  // recordResult
  // -------------------------------------------------------------------------

  it('recordResult inserts a new result keyed by testCaseId', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    expect(result.current.results['tc-1']).toBeDefined();
    expect(result.current.results['tc-1'].testCaseId).toBe('tc-1');
  });

  it('recordResult upserts — overwrites an existing result for the same testCaseId', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1', { status: 'pass' }));
    });

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1', { status: 'fail', errorCount: 3 }));
    });

    expect(result.current.results['tc-1'].status).toBe('fail');
    expect(result.current.results['tc-1'].errorCount).toBe(3);
    expect(Object.keys(result.current.results)).toHaveLength(1);
  });

  it('recordResult stores multiple results independently', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1', { status: 'pass' }));
      result.current.recordResult('tc-2', makeResult('tc-2', { status: 'fail' }));
    });

    expect(Object.keys(result.current.results)).toHaveLength(2);
    expect(result.current.results['tc-1'].status).toBe('pass');
    expect(result.current.results['tc-2'].status).toBe('fail');
  });

  it('recordResult persists to localStorage under correct key', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-abc'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testresults:mapping-abc',
      expect.stringContaining('"tc-1"'),
    );
  });

  it('recordResult updates results reactively', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    expect(Object.keys(result.current.results)).toHaveLength(0);

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    expect(Object.keys(result.current.results)).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // clearResult
  // -------------------------------------------------------------------------

  it('clearResult removes the targeted result', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
      result.current.recordResult('tc-2', makeResult('tc-2'));
    });

    act(() => {
      result.current.clearResult('tc-1');
    });

    expect(result.current.results['tc-1']).toBeUndefined();
    expect(result.current.results['tc-2']).toBeDefined();
  });

  it('clearResult persists the updated record to localStorage', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    vi.clearAllMocks();

    act(() => {
      result.current.clearResult('tc-1');
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testresults:mapping-1',
      expect.not.stringContaining('"tc-1"'),
    );
  });

  it('clearResult is a no-op for a non-existent testCaseId', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    vi.clearAllMocks();

    act(() => {
      result.current.clearResult('ghost-id');
    });

    expect(result.current.results['tc-1']).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // clearAll
  // -------------------------------------------------------------------------

  it('clearAll removes all results', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
      result.current.recordResult('tc-2', makeResult('tc-2'));
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.results).toEqual({});
  });

  it('clearAll persists empty record to localStorage', () => {
    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    act(() => {
      result.current.recordResult('tc-1', makeResult('tc-1'));
    });

    vi.clearAllMocks();

    act(() => {
      result.current.clearAll();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'keyra:testresults:mapping-1',
      '{}',
    );
  });

  // -------------------------------------------------------------------------
  // mappingId changes
  // -------------------------------------------------------------------------

  it('reloads results when mappingId changes', () => {
    const resultsA: Record<string, TestRunResult> = {
      'tc-a': makeResult('tc-a', { status: 'pass' }),
    };
    const resultsB: Record<string, TestRunResult> = {
      'tc-b1': makeResult('tc-b1', { status: 'fail' }),
      'tc-b2': makeResult('tc-b2', { status: 'pass' }),
    };

    localStorageMock.setItem('keyra:testresults:mapping-A', JSON.stringify(resultsA));
    localStorageMock.setItem('keyra:testresults:mapping-B', JSON.stringify(resultsB));

    let mappingId = 'mapping-A';
    const { result, rerender } = renderHook(() => useTestRunResults(mappingId));

    expect(Object.keys(result.current.results)).toHaveLength(1);
    expect(result.current.results['tc-a']).toBeDefined();

    mappingId = 'mapping-B';
    rerender();

    expect(Object.keys(result.current.results)).toHaveLength(2);
    expect(result.current.results['tc-b1']).toBeDefined();
    expect(result.current.results['tc-b2']).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Corruption handling
  // -------------------------------------------------------------------------

  it('resets to empty record when localStorage value is corrupted JSON', () => {
    localStorageMock.setItem('keyra:testresults:mapping-bad', 'not valid json {{{');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useTestRunResults('mapping-bad'));

    expect(result.current.results).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('resets to empty record when localStorage value is an array', () => {
    localStorageMock.setItem('keyra:testresults:mapping-bad', JSON.stringify([1, 2, 3]));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useTestRunResults('mapping-bad'));

    expect(result.current.results).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('resets to empty record when localStorage value is a primitive', () => {
    localStorageMock.setItem('keyra:testresults:mapping-bad', '"just a string"');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderHook(() => useTestRunResults('mapping-bad'));

    expect(result.current.results).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Storage write failure
  // -------------------------------------------------------------------------

  it('handles storage write failure gracefully on recordResult', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    const { result } = renderHook(() => useTestRunResults('mapping-1'));

    // Should not throw
    expect(() => {
      act(() => {
        result.current.recordResult('tc-1', makeResult('tc-1'));
      });
    }).not.toThrow();
  });
});
