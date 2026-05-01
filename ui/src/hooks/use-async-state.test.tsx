import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAsyncState } from '@/hooks';
import { toAppError } from '@/lib/state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('useAsyncState', () => {
  it('transitions idle → loading → success', async () => {
    const { result } = renderHook(() => useAsyncState<string[]>());

    expect(result.current[0]).toEqual({ status: 'idle' });

    const req = deferred<string[]>();

    act(() => {
      result.current[1].execute(req.promise);
    });

    expect(result.current[0]).toEqual({ status: 'loading' });

    act(() => {
      req.resolve(['a', 'b']);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    expect(result.current[0].status).toBe('success');
    if (result.current[0].status === 'success') {
      expect(result.current[0].data).toEqual(['a', 'b']);
      expect(result.current[0].updatedAt).toBeInstanceOf(Date);
    }
  });

  it('transitions idle → loading → error and defaults retryable true', async () => {
    const { result } = renderHook(() => useAsyncState<string[]>());
    const req = deferred<string[]>();

    act(() => {
      result.current[1].execute(req.promise);
    });

    act(() => {
      req.reject(new Error('fail'));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('error');
    });

    expect(result.current[0].status).toBe('error');
    if (result.current[0].status === 'error') {
      expect(result.current[0].error.message).toBe('fail');
      expect(result.current[0].retryable).toBe(true);
    }
  });

  it('resets to idle from any state', async () => {
    const { result } = renderHook(() => useAsyncState<number>());

    act(() => {
      result.current[1].execute(Promise.resolve(42));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    act(() => {
      result.current[1].reset();
    });

    expect(result.current[0]).toEqual({ status: 'idle' });
  });

  it('marks stale from success while preserving data', async () => {
    const { result } = renderHook(() => useAsyncState<number>());

    act(() => {
      result.current[1].execute(Promise.resolve(7));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    act(() => {
      result.current[1].markStale();
    });

    expect(result.current[0].status).toBe('stale');
    if (result.current[0].status === 'stale') {
      expect(result.current[0].data).toBe(7);
      expect(result.current[0].refreshing).toBe(false);
    }
  });

  it('refreshes from stale to success', async () => {
    const { result } = renderHook(() => useAsyncState<number>());

    act(() => {
      result.current[1].execute(Promise.resolve(1));
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    act(() => {
      result.current[1].markStale();
    });

    const req = deferred<number>();
    act(() => {
      result.current[1].refresh(req.promise);
    });

    expect(result.current[0].status).toBe('stale');
    if (result.current[0].status === 'stale') {
      expect(result.current[0].refreshing).toBe(true);
    }

    act(() => {
      req.resolve(2);
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    if (result.current[0].status === 'success') {
      expect(result.current[0].data).toBe(2);
    }
  });

  it('applies only the latest execute result during race conditions', async () => {
    const { result } = renderHook(() => useAsyncState<string>());

    const first = deferred<string>();
    const second = deferred<string>();

    act(() => {
      result.current[1].execute(first.promise);
      result.current[1].execute(second.promise);
    });

    act(() => {
      first.resolve('older');
    });

    act(() => {
      second.resolve('newer');
    });

    await waitFor(() => {
      expect(result.current[0].status).toBe('success');
    });

    expect(result.current[0].status).toBe('success');
    if (result.current[0].status === 'success') {
      expect(result.current[0].data).toBe('newer');
    }
  });
});

describe('toAppError', () => {
  it('normalizes Error instances', () => {
    const value = toAppError(new Error('boom'));

    expect(value.message).toBe('boom');
    expect(value.retryable).toBe(true);
  });

  it('normalizes strings', () => {
    const value = toAppError('plain message');

    expect(value).toEqual({
      message: 'plain message',
      retryable: true,
      cause: 'plain message',
    });
  });

  it('normalizes unknown values', () => {
    const value = toAppError({ nope: true });

    expect(value.message).toBe('An unknown error occurred');
    expect(value.retryable).toBe(true);
  });
});
