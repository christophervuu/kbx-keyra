import type {
  QueryClient,
  QueryFunction,
  QueryKey,
} from '@tanstack/react-query';

const PREFETCH_COOLDOWN_MS = 15_000;

const lastPrefetchAtByKey = new Map<string, number>();

export function resetBoundedPrefetchState(): void {
  lastPrefetchAtByKey.clear();
}

function toPrefetchKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

export interface BoundedPrefetchQueryInput<TData> {
  readonly queryClient: QueryClient;
  readonly queryKey: QueryKey;
  readonly queryFn: QueryFunction<TData, QueryKey>;
  readonly staleTime: number;
  readonly gcTime: number;
}

/**
 * Conservative prefetch helper to avoid hover/focus traffic spikes.
 *
 * Returns true if a prefetch request was started, false when skipped.
 */
export async function boundedPrefetchQuery<TData>(
  input: BoundedPrefetchQueryInput<TData>,
): Promise<boolean> {
  const {
    queryClient,
    queryKey,
    queryFn,
    staleTime,
    gcTime,
  } = input;

  const now = Date.now();
  const prefetchKey = toPrefetchKey(queryKey);
  const lastPrefetchAt = lastPrefetchAtByKey.get(prefetchKey) ?? 0;

  if (now - lastPrefetchAt < PREFETCH_COOLDOWN_MS) {
    return false;
  }

  const state = queryClient.getQueryState(queryKey);
  if (state?.fetchStatus === 'fetching') {
    return false;
  }

  if (
    state?.data !== undefined
    && state.dataUpdatedAt > 0
    && now - state.dataUpdatedAt < staleTime
  ) {
    return false;
  }

  lastPrefetchAtByKey.set(prefetchKey, now);

  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime,
    gcTime,
  });

  return true;
}
