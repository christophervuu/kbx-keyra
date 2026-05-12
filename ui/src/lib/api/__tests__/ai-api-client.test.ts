import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { autoMapSectionHttp, explainRuleHttp, suggestExpressionHttp } from '../ai-api-client';

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

describe('suggestExpressionHttp', () => {
  const apiUrl = 'https://example.execute-api.us-east-1.amazonaws.com/sandbox';
  const input = {
    instruction: 'default to USD if source currency is missing',
    targetPath: 'Order.Header.Currency',
    targetType: 'string',
    targetDescription: 'ISO currency code',
    sourceContext: '- Invoice.Amount (number)\n- Invoice.CurrencyCode (string)',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns SuggestExpressionResult on success with explanation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          expression: 'default(source("Invoice.CurrencyCode"), "USD")',
          explanation: 'Uses source currency and falls back to USD.',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(suggestExpressionHttp(apiUrl, input)).resolves.toEqual({
      expression: 'default(source("Invoice.CurrencyCode"), "USD")',
      explanation: 'Uses source currency and falls back to USD.',
    });

    expect(fetchMock).toHaveBeenCalledWith(`${apiUrl}/ai/suggest-expression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: input.instruction,
        targetPath: input.targetPath,
        targetType: input.targetType,
        targetDescription: input.targetDescription,
        sourceContext: input.sourceContext,
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('returns SuggestExpressionResult on success without explanation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            expression: 'default(source("Invoice.CurrencyCode"), "USD")',
          },
        }),
      }),
    );

    await expect(suggestExpressionHttp(apiUrl, input)).resolves.toEqual({
      expression: 'default(source("Invoice.CurrencyCode"), "USD")',
      explanation: undefined,
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

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'Invalid request — check the instruction and try again.',
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

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
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

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'The Suggest service encountered an error. Please try again.',
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

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'The AI service is temporarily busy. Please try again in a moment.',
    );
  });

  it('maps network TypeError to connection message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'Could not reach the Suggest service. Check your connection and try again.',
    );
  });

  it('aborts after 30 seconds and maps timeout to connection message', async () => {
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

    const promise = suggestExpressionHttp(apiUrl, input);
    const assertion = expect(promise).rejects.toThrow(
      'Could not reach the Suggest service. Check your connection and try again.',
    );

    await vi.advanceTimersByTimeAsync(30_000);
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

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'Received an unexpected response from the server.',
    );
  });

  it('throws malformed response error when expression is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { explanation: 'no expression' },
        }),
      }),
    );

    await expect(suggestExpressionHttp(apiUrl, input)).rejects.toThrow(
      'Received an unexpected response from the server.',
    );
  });

  it('includes sourceContext when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { expression: 'source("Invoice.CurrencyCode")' },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await suggestExpressionHttp(apiUrl, input);

    const requestInit = fetchMock.mock.calls[0][1] as globalThis.RequestInit;
    const parsedBody = JSON.parse(String(requestInit.body));
    expect(parsedBody.sourceContext).toBe(input.sourceContext);
  });

  it('omits targetDescription when undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { expression: 'source("Invoice.CurrencyCode")' },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await suggestExpressionHttp(apiUrl, {
      instruction: input.instruction,
      targetPath: input.targetPath,
      targetType: input.targetType,
      sourceContext: input.sourceContext,
    });

    const requestInit = fetchMock.mock.calls[0][1] as globalThis.RequestInit;
    const parsedBody = JSON.parse(String(requestInit.body));
    expect(parsedBody).not.toHaveProperty('targetDescription');
  });
});

describe('autoMapSectionHttp', () => {
  const apiUrl = 'https://example.execute-api.us-east-1.amazonaws.com/sandbox';
  const input = {
    projectId: 'project-1',
    mappingId: 'mapping-1',
    sectionPath: 'Order.Header',
    sourceContext: '- Invoice.InvoiceAmount (number)\n- Invoice.CurrencyCode (string)',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns AutoMapSectionResult on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          suggestions: [
            {
              target: 'Order.Header.Currency',
              expression: 'default(source("Invoice.CurrencyCode"), "USD")',
              explanation: 'Uses source currency and falls back to USD.',
              confidence: 'high',
              validation: {
                valid: true,
                diagnostics: [],
              },
            },
          ],
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(autoMapSectionHttp(apiUrl, input)).resolves.toEqual({
      suggestions: [
        {
          target: 'Order.Header.Currency',
          expression: 'default(source("Invoice.CurrencyCode"), "USD")',
          explanation: 'Uses source currency and falls back to USD.',
          confidence: 'high',
          validation: {
            valid: true,
            diagnostics: [],
          },
        },
      ],
      diagnostics: undefined,
    });

    expect(fetchMock).toHaveBeenCalledWith(`${apiUrl}/ai/auto-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: input.projectId,
        mappingId: input.mappingId,
        sectionPath: input.sectionPath,
        sourceContext: input.sourceContext,
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('sends targetSection in request body when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { suggestions: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const inputWithTarget = {
      projectId: 'project-1',
      mappingId: 'mapping-1',
      sectionPath: 'Order.Header',
      targetSection: '- Order.Header.Currency (string)\n- Order.Header.DocumentType (string)',
      sourceContext: '- Invoice.CurrencyCode (string)',
    };

    await autoMapSectionHttp(apiUrl, inputWithTarget);

    const calledBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(calledBody.targetSection).toBe(inputWithTarget.targetSection);
  });

  it('omits targetSection from request body when undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { suggestions: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await autoMapSectionHttp(apiUrl, input);

    const calledBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(calledBody).not.toHaveProperty('targetSection');
  });

  it('omits sectionPath from request body when undefined (header mode)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { suggestions: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const headerModeInput = {
      projectId: 'project-1',
      mappingId: 'mapping-1',
      targetSection: '- Order.Header.Currency (string)',
    };

    await autoMapSectionHttp(apiUrl, headerModeInput);

    const calledBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(calledBody).not.toHaveProperty('sectionPath');
    expect(calledBody.targetSection).toBe(headerModeInput.targetSection);
  });

  it('maps HTTP 429 to temporarily busy message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );

    await expect(autoMapSectionHttp(apiUrl, input)).rejects.toThrow(
      'The AI service is temporarily busy. Please try again in a moment.',
    );
  });

  it('maps network TypeError to connection message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(autoMapSectionHttp(apiUrl, input)).rejects.toThrow(
      'Could not reach the Auto-Map service. Check your connection and try again.',
    );
  });

  it('aborts after 60 seconds and maps timeout to connection message', async () => {
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

    const promise = autoMapSectionHttp(apiUrl, input);
    const assertion = expect(promise).rejects.toThrow(
      'Could not reach the Auto-Map service. Check your connection and try again.',
    );

    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it('throws malformed response error when suggestions field is missing', async () => {
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

    await expect(autoMapSectionHttp(apiUrl, input)).rejects.toThrow(
      'Received an unexpected response from the server.',
    );
  });
});
