import { describe, expect, it } from 'vitest';

import { deriveQueryBackendContext, shouldResetQueryClient } from './query-context';

describe('query-context', () => {
  it('derives local-storage identity for empty/blank apiUrl override', () => {
    expect(deriveQueryBackendContext('')).toEqual({
      adapterIdentity: 'local-storage',
      backendBaseUrl: null,
    });

    expect(deriveQueryBackendContext('   ')).toEqual({
      adapterIdentity: 'local-storage',
      backendBaseUrl: null,
    });
  });

  it('normalizes http backend context and trims trailing slash', () => {
    expect(deriveQueryBackendContext('http://localhost:4000/')).toEqual({
      adapterIdentity: 'http',
      backendBaseUrl: 'http://localhost:4000',
    });
  });

  it('requires query-client reset when adapter identity changes', () => {
    const prev = deriveQueryBackendContext(undefined);
    const next = deriveQueryBackendContext('http://localhost:4000');

    expect(shouldResetQueryClient(prev, next)).toBe(true);
  });

  it('requires query-client reset when backend url changes within http mode', () => {
    const prev = deriveQueryBackendContext('http://localhost:4000');
    const next = deriveQueryBackendContext('http://localhost:4100');

    expect(shouldResetQueryClient(prev, next)).toBe(true);
  });

  it('does not require reset when normalized backend context is unchanged', () => {
    const prev = deriveQueryBackendContext('http://localhost:4000/');
    const next = deriveQueryBackendContext('http://localhost:4000');

    expect(shouldResetQueryClient(prev, next)).toBe(false);
  });
});
