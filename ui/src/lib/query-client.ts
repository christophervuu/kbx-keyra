import { QueryClient } from '@tanstack/react-query';

function setGlobalDevQueryDiagnostics(client: QueryClient): void {
  if (!import.meta.env.DEV || typeof globalThis === 'undefined') {
    return;
  }

  const scopedGlobal = globalThis as {
    __KEYRA_QUERY_CLIENT__?: QueryClient;
  };

  scopedGlobal.__KEYRA_QUERY_CLIENT__ = client;
}

/**
 * FS-103 T-01 baseline query-client defaults.
 * Resource-specific timing policies are layered in query definitions (T-02+).
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Conservative baseline; per-resource staleTime/gcTime overrides come later.
        staleTime: 0,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: (failureCount, error) => {
          const statusCode =
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof (error as { statusCode?: unknown }).statusCode === 'number'
              ? ((error as { statusCode: number }).statusCode as number)
              : undefined;

          if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 404) {
            return false;
          }

          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });

  setGlobalDevQueryDiagnostics(client);
  return client;
}

/**
 * Clears all query + mutation caches for backend/adapter context changes
 * and development reset workflows.
 */
export function resetQueryClient(client: QueryClient): void {
  client.clear();
}
