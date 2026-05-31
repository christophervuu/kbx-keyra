import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpAdapter } from './http-adapter';

import { createAdapter, HybridAdapter, LocalStorageAdapter } from '@/lib/api';

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
  });

  it('returned HttpAdapter uses NOT_IMPLEMENTED placeholder for explainRule', async () => {
    const adapter = createAdapter('http://localhost:4000');

    expect(adapter).toBeInstanceOf(HttpAdapter);

    const input = {
      targetPath: 'Order.Header.DocumentType',
      expression: 'source("InvoiceAmount")',
    };

    await expect(adapter.explainRule(input)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
      retryable: false,
    });
  });

  it('HybridAdapter constructor warns in dev mode', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    new HybridAdapter('http://localhost:4000');

    expect(warnSpy).toHaveBeenCalledWith(
      '[KeyRa] HybridAdapter is deprecated. Use HttpAdapter via VITE_API_URL instead.',
    );
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
