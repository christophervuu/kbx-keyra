import { describe, expect, it } from 'vitest';

import { createAdapter, LocalStorageAdapter } from '@/lib/api';

describe('createAdapter', () => {
  it('returns LocalStorageAdapter when VITE_API_URL is unset', () => {
    const adapter = createAdapter(undefined);

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns LocalStorageAdapter when VITE_API_URL is empty string', () => {
    const adapter = createAdapter('');

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('throws when VITE_API_URL is set', () => {
    expect(() => createAdapter('http://localhost:4000')).toThrow('HttpAdapter not implemented');
  });
});
