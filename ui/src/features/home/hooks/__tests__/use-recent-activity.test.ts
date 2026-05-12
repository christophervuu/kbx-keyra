// use-recent-activity.test.ts — Unit tests for useRecentActivity hook (FS-049 T-03)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useRecentActivity } from '../use-recent-activity';

const STORAGE_KEY = 'keyra:recent-activity';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
  localStorageMock.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  localStorageMock.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRecentActivity', () => {
  it('returns empty array when localStorage is empty', () => {
    const { result } = renderHook(() => useRecentActivity());
    expect(result.current.getRecentItems()).toEqual([]);
  });

  it('records an entry and reads it back', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      result.current.recordActivity({ type: 'project', id: 'p1', name: 'Project Alpha' });
    });

    const items = result.current.getRecentItems();
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('project');
    expect(items[0].id).toBe('p1');
    expect(items[0].name).toBe('Project Alpha');
    expect(typeof items[0].timestamp).toBe('string');
  });

  it('deduplicates by type + id — updates timestamp instead of adding new entry', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      result.current.recordActivity({ type: 'mapping', id: 'm1', projectId: 'p1', name: 'Mapping One' });
    });
    const firstTimestamp = result.current.getRecentItems()[0].timestamp;

    // Small delay to ensure timestamp differs
    vi.setSystemTime(Date.now() + 1000);

    act(() => {
      result.current.recordActivity({ type: 'mapping', id: 'm1', projectId: 'p1', name: 'Mapping One' });
    });

    const items = result.current.getRecentItems();
    expect(items).toHaveLength(1);
    expect(items[0].timestamp).not.toBe(firstTimestamp);
  });

  it('maintains max 10 entries — oldest evicted when exceeded', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      for (let i = 1; i <= 11; i++) {
        result.current.recordActivity({ type: 'project', id: `p${i}`, name: `Project ${i}` });
      }
    });

    const items = result.current.getRecentItems();
    expect(items).toHaveLength(10);
    // p1 was the first recorded — it should have been evicted
    expect(items.find((e) => e.id === 'p1')).toBeUndefined();
    // p11 was the last recorded — it should be first (most recent)
    expect(items[0].id).toBe('p11');
  });

  it('returns items sorted by timestamp descending (most recent first)', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      result.current.recordActivity({ type: 'project', id: 'p1', name: 'First' });
    });
    act(() => {
      result.current.recordActivity({ type: 'project', id: 'p2', name: 'Second' });
    });

    const items = result.current.getRecentItems();
    expect(items[0].id).toBe('p2');
    expect(items[1].id).toBe('p1');
  });

  it('handles corrupted localStorage gracefully — returns empty array', () => {
    localStorageMock.getItem.mockReturnValueOnce('not-valid-json{{{');
    const { result } = renderHook(() => useRecentActivity());
    expect(result.current.getRecentItems()).toEqual([]);
  });

  it('handles non-array JSON in localStorage gracefully — returns empty array', () => {
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify({ foo: 'bar' }));
    const { result } = renderHook(() => useRecentActivity());
    expect(result.current.getRecentItems()).toEqual([]);
  });

  it('silently ignores malformed entries in the array', () => {
    const mixed = [
      { type: 'project', id: 'p1', name: 'Good', timestamp: new Date().toISOString() },
      { type: 'unknown', id: 'x', name: 'Bad', timestamp: 'ts' }, // invalid type
      null,
      42,
    ];
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mixed));
    const { result } = renderHook(() => useRecentActivity());
    const items = result.current.getRecentItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('p1');
  });

  it('silently fails when localStorage.setItem throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => { throw new Error('quota exceeded'); });
    const { result } = renderHook(() => useRecentActivity());
    // Should not throw
    expect(() => {
      act(() => {
        result.current.recordActivity({ type: 'project', id: 'p1', name: 'Test' });
      });
    }).not.toThrow();
  });

  it('stores projectId on mapping entries', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      result.current.recordActivity({ type: 'mapping', id: 'm1', projectId: 'proj-99', name: 'My Mapping' });
    });

    const items = result.current.getRecentItems();
    expect(items[0].projectId).toBe('proj-99');
  });

  it('uses keyra:recent-activity as the storage key', () => {
    const { result } = renderHook(() => useRecentActivity());

    act(() => {
      result.current.recordActivity({ type: 'project', id: 'p1', name: 'Test' });
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.any(String),
    );
  });
});
