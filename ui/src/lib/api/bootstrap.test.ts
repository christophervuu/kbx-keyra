import { describe, expect, it, vi } from 'vitest';

import { explainRuleHttp } from './ai-api-client';

import { createAdapter, HybridAdapter, LocalStorageAdapter } from '@/lib/api';

vi.mock('./ai-api-client', () => ({
  explainRuleHttp: vi.fn(),
}));

describe('createAdapter', () => {
  it('returns LocalStorageAdapter when VITE_API_URL is unset', () => {
    const adapter = createAdapter(undefined);

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns LocalStorageAdapter when VITE_API_URL is empty string', () => {
    const adapter = createAdapter('');

    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('returns HybridAdapter when VITE_API_URL is set', () => {
    const adapter = createAdapter('http://localhost:4000');

    expect(adapter).toBeInstanceOf(HybridAdapter);
  });

  it('returned HybridAdapter is wired with apiUrl for explainRule', async () => {
    const adapter = createAdapter('http://localhost:4000');
    vi.mocked(explainRuleHttp).mockResolvedValue({ explanation: 'ok' });

    expect(adapter).toBeInstanceOf(HybridAdapter);

    const input = {
      targetPath: 'Order.Header.DocumentType',
      expression: 'source("InvoiceAmount")',
    };

    await expect(adapter.explainRule(input)).resolves.toEqual({ explanation: 'ok' });
    expect(explainRuleHttp).toHaveBeenCalledWith('http://localhost:4000', input);
  });
});
