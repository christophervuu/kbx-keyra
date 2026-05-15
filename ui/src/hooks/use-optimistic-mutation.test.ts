import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useOptimisticMutation } from './use-optimistic-mutation';

describe('useOptimisticMutation', () => {
  it('keeps optimistic state when mutation succeeds', async () => {
    const applied: string[] = [];
    const rolledBack: string[] = [];

    const { result } = renderHook(() =>
      useOptimisticMutation<string, string, string>({
        captureSnapshot: () => 'before',
        applyOptimistic: (input) => {
          applied.push(input);
        },
        rollback: (snapshot) => {
          rolledBack.push(snapshot);
        },
        mutate: async (input) => input.toUpperCase(),
      }),
    );

    await act(async () => {
      const output = await result.current.run('after');
      expect(output).toBe('AFTER');
    });

    expect(applied).toEqual(['after']);
    expect(rolledBack).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isMutating).toBe(false);
  });

  it('rolls back and surfaces error when mutation fails', async () => {
    const rolledBack: string[] = [];

    const { result } = renderHook(() =>
      useOptimisticMutation<string, string, never>({
        captureSnapshot: () => 'snapshot',
        applyOptimistic: () => {},
        rollback: (snapshot) => {
          rolledBack.push(snapshot);
        },
        mutate: async () => {
          throw new Error('mutation failed');
        },
      }),
    );

    await act(async () => {
      await expect(result.current.run('input')).rejects.toMatchObject({ message: 'mutation failed' });
    });

    expect(rolledBack).toEqual(['snapshot']);
    expect(result.current.error?.message).toBe('mutation failed');
    expect(result.current.isMutating).toBe(false);
  });

  it('only latest mutation snapshot rolls back on stale completion', async () => {
    let rejectFirst!: (error: Error) => void;
    let rejectSecond!: (error: Error) => void;

    const rolledBack: string[] = [];

    const mutate = vi
      .fn<(input: string) => Promise<string>>()
      .mockImplementationOnce(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectSecond = reject;
          }),
      );

    const { result } = renderHook(() =>
      useOptimisticMutation<string, string, string>({
        captureSnapshot: () => `snapshot-${Date.now()}-${Math.random()}`,
        applyOptimistic: () => {},
        rollback: (snapshot) => {
          rolledBack.push(snapshot);
        },
        mutate,
      }),
    );

    let p1!: Promise<string>;
    let p2!: Promise<string>;

    act(() => {
      p1 = result.current.run('first');
      p2 = result.current.run('second');
    });

    await act(async () => {
      rejectFirst(new Error('first failed'));
      await expect(p1).rejects.toMatchObject({ message: 'first failed' });
    });

    // First failure is stale now, so no rollback yet.
    expect(rolledBack).toHaveLength(0);

    await act(async () => {
      rejectSecond(new Error('second failed'));
      await expect(p2).rejects.toMatchObject({ message: 'second failed' });
    });

    // Only latest failure should rollback.
    expect(rolledBack).toHaveLength(1);
    expect(result.current.error?.message).toBe('second failed');
  });
});
