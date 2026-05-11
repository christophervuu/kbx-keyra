import { beforeEach, describe, expect, it, vi } from 'vitest';

import { explainRuleHttp, suggestExpressionHttp } from '../ai-api-client';
import { HybridAdapter } from '../hybrid-adapter';
import { LocalStorageAdapter } from '../local-storage-adapter';

vi.mock('../ai-api-client', () => ({
  explainRuleHttp: vi.fn(),
  suggestExpressionHttp: vi.fn(),
}));

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

function createStorageMock(): StorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe('HybridAdapter', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.clearAllMocks();
  });

  it('extends LocalStorageAdapter', () => {
    const adapter = new HybridAdapter('https://example.com/sandbox');
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('routes explainRule to explainRuleHttp with apiUrl and input', async () => {
    const adapter = new HybridAdapter('https://example.com/sandbox');
    const input = {
      targetPath: 'Order.Header.DocumentType',
      expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
    };

    vi.mocked(explainRuleHttp).mockResolvedValue({ explanation: 'ok' });

    await expect(adapter.explainRule(input)).resolves.toEqual({ explanation: 'ok' });
    expect(explainRuleHttp).toHaveBeenCalledWith('https://example.com/sandbox', input);
  });

  it('routes suggestExpression to suggestExpressionHttp with apiUrl and input', async () => {
    const adapter = new HybridAdapter('https://example.com/sandbox');
    const input = {
      instruction: 'default to USD if source currency is missing',
      targetPath: 'Order.Header.Currency',
      targetType: 'string',
      targetDescription: 'ISO currency code',
      sourceContext: '- Invoice.Amount (number)\n- Invoice.CurrencyCode (string)',
    };

    vi.mocked(suggestExpressionHttp).mockResolvedValue({
      expression: 'default(source("Invoice.CurrencyCode"), "USD")',
      explanation: 'Uses source currency and falls back to USD.',
    });

    await expect(adapter.suggestExpression(input)).resolves.toEqual({
      expression: 'default(source("Invoice.CurrencyCode"), "USD")',
      explanation: 'Uses source currency and falls back to USD.',
    });
    expect(suggestExpressionHttp).toHaveBeenCalledWith('https://example.com/sandbox', input);
  });

  it('delegates CRUD methods to LocalStorageAdapter behavior', async () => {
    const adapter = new HybridAdapter('https://example.com/sandbox');

    await adapter.createSchema({
      name: 'Invoice Schema',
      format: 'json-schema',
      origin: 'local',
      content: { type: 'object' },
    });

    await expect(adapter.listSchemas()).resolves.toHaveLength(1);
  });

  it('keeps other non-overridden AI methods in offline-mode behavior', async () => {
    const adapter = new HybridAdapter('https://example.com/sandbox');

    await expect(adapter.autoMap({ projectId: 'p', mappingId: 'm' })).rejects.toThrow(
      'Not available in offline mode',
    );
    await expect(adapter.smartFix({ mappingId: 'm', diagnostics: [] })).rejects.toThrow(
      'Not available in offline mode',
    );
  });
});
