import { describe, expect, it, vi } from 'vitest';

import { retryWithBackoff } from './retry';

describe('retryWithBackoff', () => {
  it('retries retryable errors up to maxAttempts then throws last error', async () => {
    vi.useFakeTimers();

    const error = new Error('boom') as Error & { retryable?: boolean };
    error.retryable = true;
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryWithBackoff(fn, { maxAttempts: 3, jitter: false });
    const caught = promise.catch((err: unknown) => err);

    await vi.runAllTimersAsync();

    await expect(caught).resolves.toBe(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('returns success on second attempt', async () => {
    vi.useFakeTimers();

    const retryable = new Error('retry') as Error & { retryable?: boolean };
    retryable.retryable = true;
    const fn = vi.fn().mockRejectedValueOnce(retryable).mockResolvedValueOnce('ok');

    const promise = retryWithBackoff(fn, { jitter: false });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const error = new Error('bad request') as Error & { retryable?: boolean; statusCode?: number };
    error.retryable = false;
    error.statusCode = 400;
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const fn = vi.fn().mockResolvedValue('ok');

    await expect(retryWithBackoff(fn, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('aborts active backoff wait and clears retry timer path', async () => {
    vi.useFakeTimers();

    const controller = new AbortController();
    const retryable = new Error('retry') as Error & { retryable?: boolean };
    retryable.retryable = true;
    const fn = vi.fn().mockRejectedValue(retryable);

    const promise = retryWithBackoff(fn, { signal: controller.signal });
    const caught = promise.catch((err: unknown) => err);

    controller.abort();
    await vi.runAllTimersAsync();

    await expect(caught).resolves.toMatchObject({ name: 'AbortError' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff timing within expected tolerance window', async () => {
    vi.useFakeTimers();

    const retryable = new Error('retry') as Error & { retryable?: boolean };
    retryable.retryable = true;
    const fn = vi.fn().mockRejectedValue(retryable);

    const promise = retryWithBackoff(fn, { maxAttempts: 3, jitter: false, baseDelayMs: 100, maxDelayMs: 1000 });
    const caught = promise.catch((err: unknown) => err);

    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(399);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await caught;
  });

  it('jitter introduces variable delay', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1);

    const retryable = new Error('retry') as Error & { retryable?: boolean };
    retryable.retryable = true;
    const fn = vi.fn().mockRejectedValue(retryable);

    const promise = retryWithBackoff(fn, {
      maxAttempts: 3,
      jitter: true,
      baseDelayMs: 100,
      maxDelayMs: 1000,
    });
    const caught = promise.catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(449);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(randomSpy).toHaveBeenCalledTimes(2);

    await caught;
  });
});
