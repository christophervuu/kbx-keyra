import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient, resetQueryClient } from './query-client';

describe('query-client', () => {
  it('creates a QueryClient with FS-103 baseline defaults', () => {
    const client = createQueryClient();

    expect(client).toBeInstanceOf(QueryClient);

    const queries = client.getDefaultOptions().queries;
    const mutations = client.getDefaultOptions().mutations;

    expect(queries?.staleTime).toBe(0);
    expect(queries?.gcTime).toBe(5 * 60 * 1000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.refetchOnReconnect).toBe(true);
    expect(queries?.refetchOnMount).toBe(true);

    expect(typeof queries?.retry).toBe('function');
    const retry = queries?.retry as (failureCount: number, error: unknown) => boolean;
    expect(retry(0, { statusCode: 404 })).toBe(false);
    expect(retry(0, { statusCode: 500 })).toBe(true);
    expect(retry(2, { statusCode: 500 })).toBe(false);

    expect(mutations?.retry).toBe(0);
  });

  it('resetQueryClient clears cached query data deterministically', async () => {
    const client = createQueryClient();

    await client.prefetchQuery({
      queryKey: ['fs-103', 'reset-test'],
      queryFn: async () => 'cached-value',
    });

    expect(client.getQueryData(['fs-103', 'reset-test'])).toBe('cached-value');

    resetQueryClient(client);

    expect(client.getQueryData(['fs-103', 'reset-test'])).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('registers dev query diagnostics handle on global scope when DEV is true', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', 'true');

    const module = await import('./query-client');
    const client = module.createQueryClient();

    const scopedGlobal = globalThis as {
      __KEYRA_QUERY_CLIENT__?: QueryClient;
    };

    expect(scopedGlobal.__KEYRA_QUERY_CLIENT__).toBe(client);

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
