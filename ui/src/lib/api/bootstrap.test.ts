import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpAdapter } from './http-adapter';

import { createAdapter, getAdapterIdentity, LocalStorageAdapter, normalizeApiUrl } from '@/lib/api';

describe('createAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns LocalStorageAdapter when VITE_API_URL is unset', () => {
    const adapter = createAdapter(undefined);

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns LocalStorageAdapter when VITE_API_URL is empty string', () => {
    const adapter = createAdapter('');

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns HttpAdapter when VITE_API_URL is set', () => {
    const adapter = createAdapter('http://localhost:4000');

    expect(adapter).toBeInstanceOf(HttpAdapter);
    expect(adapter.constructor.name).not.toBe('HybridAdapter');
  });

  it('does not touch localStorage/sessionStorage when VITE_API_URL is set', () => {
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('storage read should not occur');
      }),
      setItem: vi.fn(() => {
        throw new Error('storage write should not occur');
      }),
      removeItem: vi.fn(() => {
        throw new Error('storage mutation should not occur');
      }),
      clear: vi.fn(() => {
        throw new Error('storage clear should not occur');
      }),
    };

    vi.stubGlobal('localStorage', throwingStorage);
    vi.stubGlobal('sessionStorage', throwingStorage);

    const adapter = createAdapter('http://localhost:4000');
    expect(adapter).toBeInstanceOf(HttpAdapter);
  });
});

describe('bootstrap identity helpers', () => {
  it('returns adapter identity from apiUrl presence', () => {
    expect(getAdapterIdentity('')).toBe('local-storage');
    expect(getAdapterIdentity('   ')).toBe('local-storage');
    expect(getAdapterIdentity('http://localhost:4000')).toBe('http');
  });

  it('normalizes api url and trims trailing slashes', () => {
    expect(normalizeApiUrl('')).toBeNull();
    expect(normalizeApiUrl('   ')).toBeNull();
    expect(normalizeApiUrl('http://localhost:4000/')).toBe('http://localhost:4000');
    expect(normalizeApiUrl('http://localhost:4000///')).toBe('http://localhost:4000');
  });
});
