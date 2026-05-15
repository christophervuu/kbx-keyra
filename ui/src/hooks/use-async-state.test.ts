import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAsyncState } from './use-async-state';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('useAsyncState', () => {
  it('execute(factory) -> retryable error -> retry() -> success', async () => {
    const retryableError = { message: 'temporary', retryable: true };
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('ok');

    const { result } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(operation);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('error');
    });

    act(() => {
      result.current[1].retry();
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('non-retryable error keeps retry() as no-op', async () => {
    const nonRetryableError = { message: 'invalid', retryable: false };
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(nonRetryableError)
      .mockResolvedValueOnce('should-not-run');

    const { result } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(operation);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('error');
    });

    act(() => {
      result.current[1].retry();
    });

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.current[0].status).toBe('error');
  });

  it('raw promise errors remain backward-compatible and retry() is no-op', async () => {
    const { result } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(Promise.reject({ message: 'temporary', retryable: true }));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('error');
    });

    act(() => {
      result.current[1].retry();
    });

    expect(result.current[0].status).toBe('error');
  });

  it('retry() when state is success is a no-op', async () => {
    const operation = vi.fn<() => Promise<string>>().mockResolvedValue('ok');
    const { result } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(operation);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    act(() => {
      result.current[1].retry();
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('race protection: retry followed by execute uses latest result only', async () => {
    const firstError = { message: 'temporary', retryable: true };
    const retryDeferred = deferred<string>();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(firstError)
      .mockImplementationOnce(() => retryDeferred.promise);

    const { result } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(operation);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('error');
    });

    act(() => {
      result.current[1].retry();
      result.current[1].execute(Promise.resolve('latest'));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    if (result.current[0].status === 'success') {
      expect(result.current[0].data).toBe('latest');
    }

    await act(async () => {
      retryDeferred.resolve('stale-retry');
      await Promise.resolve();
    });

    if (result.current[0].status === 'success') {
      expect(result.current[0].data).toBe('latest');
    }
  });

  it('does not update state after unmount', async () => {
    const pending = deferred<string>();
    const operation = vi.fn<() => Promise<string>>().mockImplementation(() => pending.promise);

    const { result, unmount } = renderHook(() => useAsyncState<string>());

    act(() => {
      result.current[1].execute(operation);
    });

    unmount();

    await act(async () => {
      pending.resolve('late-success');
      await Promise.resolve();
    });

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
