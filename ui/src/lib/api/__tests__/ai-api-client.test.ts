import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { explainRuleHttp } from '../ai-api-client';

describe('explainRuleHttp', () => {
  const apiUrl = 'https://example.execute-api.us-east-1.amazonaws.com/sandbox';
  const input = {
    targetPath: 'Order.Header.DocumentType',
    expression: 'if(lt(source("InvoiceAmount"), 0), "CreditMemo", "Invoice")',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns ExplainRuleResult on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { explanation: 'This rule maps negative invoices to credit memos.' },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(explainRuleHttp(apiUrl, input)).resolves.toEqual({
      explanation: 'This rule maps negative invoices to credit memos.',
    });

    expect(fetchMock).toHaveBeenCalledWith(`${apiUrl}/ai/explain-rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: expect.any(AbortSignal),
    });
  });

  it('maps HTTP 400 to invalid request message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'Invalid request — the rule may be malformed.',
    );
  });

  it('maps HTTP 429 to temporarily busy message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'The AI service is temporarily busy. Please try again in a moment.',
    );
  });

  it('maps HTTP 500 to generic server error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'The Explain service encountered an error. Please try again.',
    );
  });

  it('maps AIError envelope code to user-friendly message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'MODEL_RATE_LIMITED', message: 'rate limited' },
        }),
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'The AI service is temporarily busy. Please try again in a moment.',
    );
  });

  it('maps network TypeError to connection message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'Could not reach the Explain service. Check your connection and try again.',
    );
  });

  it('aborts after 15 seconds and maps timeout to connection message', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockImplementation((_url: string, init?: globalThis.RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const promise = explainRuleHttp(apiUrl, input);
    const assertion = expect(promise).rejects.toThrow(
      'Could not reach the Explain service. Check your connection and try again.',
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('throws malformed response error for invalid JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'Received an unexpected response from the server.',
    );
  });

  it('throws malformed response error when explanation is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {},
        }),
      }),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'Received an unexpected response from the server.',
    );
  });

  it('clears timeout on success and on error', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { explanation: 'ok' },
        }),
      }),
    );

    await explainRuleHttp(apiUrl, input);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );

    await expect(explainRuleHttp(apiUrl, input)).rejects.toThrow(
      'Could not reach the Explain service. Check your connection and try again.',
    );

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });
});
