import { useCallback, useRef, useState } from 'react';

import type { AppError } from '@/lib/state/app-error';
import { toAppError } from '@/lib/state/app-error';

export interface UseOptimisticMutationOptions<TInput, TSnapshot, TResult> {
  captureSnapshot: () => TSnapshot;
  applyOptimistic: (input: TInput) => void;
  rollback: (snapshot: TSnapshot) => void;
  mutate: (input: TInput) => Promise<TResult>;
  onSuccess?: (result: TResult, input: TInput, snapshot: TSnapshot) => void;
  onError?: (error: AppError, input: TInput, snapshot: TSnapshot) => void;
}

export interface UseOptimisticMutationResult<TInput, TResult> {
  run: (input: TInput) => Promise<TResult>;
  isMutating: boolean;
  error: AppError | null;
  clearError: () => void;
}

/**
 * Shared optimistic mutation helper.
 *
 * Behavior:
 * - Captures a snapshot before optimistic update
 * - Applies optimistic state immediately
 * - Rolls back on failure and rethrows error
 * - Uses mutation-id guard so stale failures from older attempts do not rollback
 *   newer optimistic state ("only latest snapshot matters").
 */
export function useOptimisticMutation<TInput, TSnapshot, TResult>(
  options: UseOptimisticMutationOptions<TInput, TSnapshot, TResult>,
): UseOptimisticMutationResult<TInput, TResult> {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const latestMutationIdRef = useRef(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const run = useCallback(
    async (input: TInput): Promise<TResult> => {
      const mutationId = latestMutationIdRef.current + 1;
      latestMutationIdRef.current = mutationId;

      const snapshot = options.captureSnapshot();
      options.applyOptimistic(input);
      setIsMutating(true);
      setError(null);

      try {
        const result = await options.mutate(input);

        if (mutationId === latestMutationIdRef.current) {
          setIsMutating(false);
          options.onSuccess?.(result, input, snapshot);
        }

        return result;
      } catch (unknownError) {
        const appError = toAppError(unknownError);

        if (mutationId === latestMutationIdRef.current) {
          options.rollback(snapshot);
          setError(appError);
          setIsMutating(false);
          options.onError?.(appError, input, snapshot);
        }

        throw appError;
      }
    },
    [options],
  );

  return {
    run,
    isMutating,
    error,
    clearError,
  };
}
