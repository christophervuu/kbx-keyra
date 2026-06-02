import { beforeEach, describe, expect, it, vi } from 'vitest';

import { autoMapSectionHttp, explainRuleHttp, suggestExpressionHttp } from '../ai-api-client';
import { HybridAdapter } from '../hybrid-adapter';

vi.mock('../ai-api-client', () => ({
  explainRuleHttp: vi.fn(),
  suggestExpressionHttp: vi.fn(),
  autoMapSectionHttp: vi.fn(),
}));

describe('HybridAdapter (deprecated retained path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns in development mode when instantiated', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const adapter = new HybridAdapter('http://localhost:3001/api');

    expect(adapter).toBeInstanceOf(HybridAdapter);
    expect(warnSpy).toHaveBeenCalledTimes(import.meta.env.DEV ? 1 : 0);

    warnSpy.mockRestore();
  });

  it('routes explainRule through ai-api-client helper', async () => {
    vi.mocked(explainRuleHttp).mockResolvedValueOnce({ explanation: 'ok' });
    const adapter = new HybridAdapter('http://localhost:3001/api');

    await expect(
      adapter.explainRule({ targetPath: 'Order.Total', expression: 'source("Invoice.Total")' }),
    ).resolves.toEqual({ explanation: 'ok' });

    expect(explainRuleHttp).toHaveBeenCalledWith('http://localhost:3001/api', {
      targetPath: 'Order.Total',
      expression: 'source("Invoice.Total")',
    });
  });

  it('routes suggestExpression through ai-api-client helper', async () => {
    vi.mocked(suggestExpressionHttp).mockResolvedValueOnce({ expression: 'source("Invoice.Total")' });
    const adapter = new HybridAdapter('http://localhost:3001/api');

    await expect(
      adapter.suggestExpression({
        mappingId: 'm-1',
        instruction: 'copy',
        targetPath: 'Order.Total',
        targetType: 'string',
      }),
    ).resolves.toEqual({ expression: 'source("Invoice.Total")' });

    expect(suggestExpressionHttp).toHaveBeenCalledWith('http://localhost:3001/api', {
      mappingId: 'm-1',
      instruction: 'copy',
      targetPath: 'Order.Total',
      targetType: 'string',
    });
  });

  it('routes autoMapSection through ai-api-client helper', async () => {
    vi.mocked(autoMapSectionHttp).mockResolvedValueOnce({ suggestions: [] });
    const adapter = new HybridAdapter('http://localhost:3001/api');

    await expect(
      adapter.autoMapSection({
        projectId: 'p-1',
        mappingId: 'm-1',
        sectionPath: 'Order.Header',
      }),
    ).resolves.toEqual({ suggestions: [] });

    expect(autoMapSectionHttp).toHaveBeenCalledWith('http://localhost:3001/api', {
      projectId: 'p-1',
      mappingId: 'm-1',
      sectionPath: 'Order.Header',
    });
  });

  it('keeps other inherited AI methods offline-only in deprecated path', async () => {
    const adapter = new HybridAdapter('http://localhost:3001/api');

    await expect(adapter.autoMap({ projectId: 'p-1', mappingId: 'm-1' })).rejects.toThrow(
      'Not available in offline mode',
    );
  });
});
