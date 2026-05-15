import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useIngestionPolling } from '../use-ingestion-polling';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDetail(status: 'ingesting' | 'ready' | 'error'): SchemaDetail {
  return {
    metadata: {
      schemaId: 'schema-1',
      name: 'Test Schema',
      format: 'json-schema',
      fieldCount: 2,
      origin: 'local',
      status,
      scope: 'project',
      syncStatus: 'synced',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    content: {},
  };
}

function makeAdapter(getSchema: ApiAdapter['getSchema']): Partial<ApiAdapter> {
  return { getSchema };
}

function wrapper(adapter: Partial<ApiAdapter>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(AdapterProvider, { adapter: adapter as ApiAdapter }, children);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useIngestionPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const getSchema = vi.fn<ApiAdapter['getSchema']>().mockResolvedValue(makeDetail('ready'));
    const { result } = renderHook(() => useIngestionPolling(), {
      wrapper: wrapper(makeAdapter(getSchema)),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.schema).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('transitions to polling then ready when status becomes ready', async () => {
    const getSchema = vi
      .fn<ApiAdapter['getSchema']>()
      .mockResolvedValueOnce(makeDetail('ingesting'))
      .mockResolvedValueOnce(makeDetail('ready'));

    const { result } = renderHook(() => useIngestionPolling({ intervalMs: 100 }), {
      wrapper: wrapper(makeAdapter(getSchema)),
    });

    act(() => {
      result.current.startPolling('schema-1');
    });

    expect(result.current.status).toBe('polling');

    // First poll fires immediately — resolves to 'ingesting', stays polling
    await waitFor(() => expect(getSchema).toHaveBeenCalledTimes(1));

    // Advance timer to trigger second poll
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.schema).not.toBeNull();
    expect(result.current.schema?.metadata.status).toBe('ready');
  });

  it('transitions to error when backend reports error status', async () => {
    const getSchema = vi
      .fn<ApiAdapter['getSchema']>()
      .mockResolvedValueOnce(makeDetail('ingesting'))
      .mockResolvedValueOnce(makeDetail('error'));

    const { result } = renderHook(() => useIngestionPolling({ intervalMs: 100 }), {
      wrapper: wrapper(makeAdapter(getSchema)),
    });

    act(() => {
      result.current.startPolling('schema-1');
    });

    await waitFor(() => expect(getSchema).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
  });

  it('transitions to timeout after configured duration', async () => {
    const getSchema = vi
      .fn<ApiAdapter['getSchema']>()
      .mockResolvedValue(makeDetail('ingesting'));

    const { result } = renderHook(
      () => useIngestionPolling({ intervalMs: 100, timeoutMs: 500 }),
      { wrapper: wrapper(makeAdapter(getSchema)) },
    );

    act(() => {
      result.current.startPolling('schema-1');
    });

    expect(result.current.status).toBe('polling');

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('timeout');
    });
  });

  it('cleans up interval on unmount — no leaked timers', async () => {
    const getSchema = vi
      .fn<ApiAdapter['getSchema']>()
      .mockResolvedValue(makeDetail('ingesting'));

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { result, unmount } = renderHook(
      () => useIngestionPolling({ intervalMs: 100 }),
      { wrapper: wrapper(makeAdapter(getSchema)) },
    );

    act(() => {
      result.current.startPolling('schema-1');
    });

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('reset() returns to idle and stops polling', async () => {
    const getSchema = vi
      .fn<ApiAdapter['getSchema']>()
      .mockResolvedValue(makeDetail('ingesting'));

    const { result } = renderHook(() => useIngestionPolling({ intervalMs: 100 }), {
      wrapper: wrapper(makeAdapter(getSchema)),
    });

    act(() => {
      result.current.startPolling('schema-1');
    });

    expect(result.current.status).toBe('polling');

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.schema).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('does not call getSchema after unmount', async () => {
    let resolveFirst!: (v: SchemaDetail) => void;
    const firstCall = new Promise<SchemaDetail>((res) => { resolveFirst = res; });

    const getSchema = vi.fn<ApiAdapter['getSchema']>().mockReturnValueOnce(firstCall);

    const { result, unmount } = renderHook(
      () => useIngestionPolling({ intervalMs: 100 }),
      { wrapper: wrapper(makeAdapter(getSchema)) },
    );

    act(() => {
      result.current.startPolling('schema-1');
    });

    unmount();

    // Resolve after unmount — should not trigger state updates
    act(() => {
      resolveFirst(makeDetail('ready'));
    });

    // Status should remain polling (last known before unmount) — no crash
    // The key assertion is that no React state-update-after-unmount warning fires.
    // We verify getSchema was called exactly once (no further polls after unmount).
    expect(getSchema).toHaveBeenCalledTimes(1);
  });
});
