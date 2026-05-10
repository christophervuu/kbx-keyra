import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useComparisonSnapshots } from './use-comparison-snapshots';

import type { ComparisonSnapshot } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-test-1';
const STORAGE_KEY = `keyra:comparison-snapshots:${MAPPING_ID}`;

function makeSnapshotPayload(
  testCaseId: string,
  overrides: Partial<Omit<ComparisonSnapshot, 'id'>> = {},
): Omit<ComparisonSnapshot, 'id'> {
  return {
    testCaseId,
    mappingId: MAPPING_ID,
    mode: 'current-vs-saved',
    leftResult: {
      label: 'Current',
      status: 'success',
      metadata: { executionContext: 'client', configVersion: 1, engineVersion: 'client' },
      output: { foo: 'bar' },
      diagnostics: [],
    },
    rightResult: {
      label: 'Saved',
      status: 'success',
      metadata: { executionContext: 'client', configVersion: 1, engineVersion: 'client' },
      output: { foo: 'bar' },
      diagnostics: [],
    },
    diffEntries: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useComparisonSnapshots', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes with empty snapshots when no storage data', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    expect(result.current.snapshots).toEqual([]);
  });

  it('saves a snapshot and returns it with a generated ID', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    const payload = makeSnapshotPayload('tc-1');

    let saved: ComparisonSnapshot | undefined;
    act(() => {
      saved = result.current.saveSnapshot(payload);
    });

    expect(saved).toBeDefined();
    expect(saved!.id).toBeTruthy();
    expect(saved!.testCaseId).toBe('tc-1');
    expect(saved!.mode).toBe('current-vs-saved');
  });

  it('persists snapshot to localStorage', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as ComparisonSnapshot[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].testCaseId).toBe('tc-1');
  });

  it('updates snapshots state after save', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });
    expect(result.current.snapshots).toHaveLength(1);
  });

  it('saves multiple snapshots', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-2'));
    });
    expect(result.current.snapshots).toHaveLength(2);
  });

  it('snapshotsForTestCase returns only snapshots for that test case', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-2'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });

    const tc1Snaps = result.current.snapshotsForTestCase('tc-1');
    expect(tc1Snaps).toHaveLength(2);
    tc1Snaps.forEach((s) => expect(s.testCaseId).toBe('tc-1'));

    const tc2Snaps = result.current.snapshotsForTestCase('tc-2');
    expect(tc2Snaps).toHaveLength(1);
  });

  it('snapshotsForTestCase returns empty array for unknown test case', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    expect(result.current.snapshotsForTestCase('nonexistent')).toEqual([]);
  });

  it('deleteSnapshot removes a single snapshot by ID', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    let snap1: ComparisonSnapshot | undefined;
    act(() => {
      snap1 = result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });

    act(() => {
      result.current.deleteSnapshot(snap1!.id);
    });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].id).not.toBe(snap1!.id);
  });

  it('deleteSnapshot persists the removal to localStorage', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    let snap: ComparisonSnapshot | undefined;
    act(() => {
      snap = result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });
    act(() => {
      result.current.deleteSnapshot(snap!.id);
    });

    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!) as ComparisonSnapshot[];
    expect(parsed).toHaveLength(0);
  });

  it('deleteSnapshotsForTestCase removes all snapshots for a test case', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
      result.current.saveSnapshot(makeSnapshotPayload('tc-2'));
    });

    act(() => {
      result.current.deleteSnapshotsForTestCase('tc-1');
    });

    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].testCaseId).toBe('tc-2');
  });

  it('deleteSnapshotsForTestCase is a no-op for unknown test case', () => {
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    act(() => {
      result.current.saveSnapshot(makeSnapshotPayload('tc-1'));
    });
    act(() => {
      result.current.deleteSnapshotsForTestCase('nonexistent');
    });
    expect(result.current.snapshots).toHaveLength(1);
  });

  it('loads existing snapshots from localStorage on mount', () => {
    const existing: ComparisonSnapshot[] = [
      { ...makeSnapshotPayload('tc-1'), id: 'snap-existing-1' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].id).toBe('snap-existing-1');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json{{{');
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    expect(result.current.snapshots).toEqual([]);
  });

  it('handles non-array localStorage value gracefully', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    const { result } = renderHook(() => useComparisonSnapshots(MAPPING_ID));
    expect(result.current.snapshots).toEqual([]);
  });
});
