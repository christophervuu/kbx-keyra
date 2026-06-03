import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSmartFix } from './use-smart-fix';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { SmartFixInput, SmartFixResult } from '@/lib/types';

const MOCK_INPUT: SmartFixInput = {
  mappingId: 'mapping-1',
  ruleIndex: 0,
  targetPath: 'Order.Total',
  targetType: 'number',
  failingExpression: 'source("Invoice.Total")',
  diagnostics: [
    { code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch', path: 'Order.Total' },
    { code: 'KEYRA-W003', severity: 'warning', message: 'Null propagated', path: 'Order.Total' },
  ],
  diagnosticScope: 'all',
  ruleVersion: 12,
  ruleHash: 'fnv1a-91e713ad',
};

const MOCK_RESULT_VALID: SmartFixResult = {
  originalExpression: 'source("Invoice.Total")',
  suggestedExpression: 'default(source("Invoice.Total"), 0)',
  explanation: 'Defaults missing value to zero.',
  validation: {
    valid: true,
    diagnostics: [],
  },
  readyToApply: true,
  diagnosticsScopeApplied: 'all',
  context: {
    truncated: false,
    approxTokenCount: 512,
    byteLength: 3200,
    totalDiagnosticCount: 2,
    includedDiagnosticCount: 2,
    sourceNodeCount: 80,
    includedSourceNodeCount: 30,
    targetNodeCount: 60,
    includedTargetNodeCount: 25,
  },
  applyGuard: {
    ruleVersion: 12,
    ruleHash: 'fnv1a-91e713ad',
  },
};

const MOCK_RESULT_INVALID: SmartFixResult = {
  originalExpression: 'source("Invoice.Total")',
  suggestedExpression: 'concat(source("Invoice.Total"), "USD")',
  explanation: 'Formats numeric amount as text.',
  validation: {
    valid: false,
    diagnostics: [
      {
        code: 'TYPE_MISMATCH',
        severity: 'error',
        message: 'Expression returns string but target expects number',
        path: 'Order.Total',
      },
    ],
  },
  readyToApply: false,
  diagnosticsScopeApplied: 'single',
  context: {
    truncated: true,
    approxTokenCount: 7800,
    byteLength: 64000,
    totalDiagnosticCount: 14,
    includedDiagnosticCount: 7,
    sourceNodeCount: 400,
    includedSourceNodeCount: 112,
    targetNodeCount: 300,
    includedTargetNodeCount: 90,
  },
  applyGuard: {
    ruleVersion: 12,
    ruleHash: 'fnv1a-91e713ad',
  },
};

function makeAdapter(smartFix: ApiAdapter['smartFix']): Partial<ApiAdapter> {
  return { smartFix };
}

function makeWrapper(adapter: Partial<ApiAdapter>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      AdapterProvider,
      { adapter: adapter as ApiAdapter },
      children,
    );
  };
}

describe('useSmartFix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial idle state', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT_VALID));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('transitions loading -> success-valid when adapter returns apply-ready result', async () => {
    const smartFix = vi.fn().mockResolvedValue(MOCK_RESULT_VALID);
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-valid');
    });

    expect(result.current.state).toEqual({
      status: 'success-valid',
      result: MOCK_RESULT_VALID,
      error: null,
    });
    expect(smartFix).toHaveBeenCalledWith(MOCK_INPUT);
  });

  it('sets loading state immediately when run() is invoked', async () => {
    let resolveRequest!: (value: SmartFixResult) => void;
    const pending = new Promise<SmartFixResult>((resolve) => {
      resolveRequest = resolve;
    });

    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });

    expect(result.current.state).toEqual({
      status: 'loading',
      result: null,
      error: null,
    });

    await act(async () => {
      resolveRequest(MOCK_RESULT_VALID);
    });
  });

  it('transitions loading -> success-invalid for validation-invalid suggestions', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT_INVALID));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-invalid');
    });

    expect(result.current.state).toEqual({
      status: 'success-invalid',
      result: MOCK_RESULT_INVALID,
      error: null,
    });
  });

  it('maps stale mismatch errors to stale-mismatch state', async () => {
    const staleError = Object.assign(new Error('Rule snapshot is stale. Re-run fix on latest rule before applying.'), {
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
    });
    const adapter = makeAdapter(vi.fn().mockRejectedValue(staleError));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('stale-mismatch');
    });

    expect(result.current.state.status).toBe('stale-mismatch');
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.error).toBe('Rule snapshot is stale. Re-run fix on latest rule before applying.');
  });

  it('classifies 409 stale mismatch by status code even when code is absent', async () => {
    const staleByStatusOnly = Object.assign(new Error('Conflict while applying Smart Fix'), {
      statusCode: 409,
      retryable: false,
    });
    const adapter = makeAdapter(vi.fn().mockRejectedValue(staleByStatusOnly));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('stale-mismatch');
    });

    expect(result.current.state.status).toBe('stale-mismatch');
    expect(result.current.state.error).toBe('Conflict while applying Smart Fix');
  });

  it('stale-mismatch transitions to idle on dismiss', async () => {
    const staleError = Object.assign(new Error('Rule hash mismatch. Re-run fix on latest rule before applying.'), {
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
    });
    const adapter = makeAdapter(vi.fn().mockRejectedValue(staleError));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('stale-mismatch');
    });

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('stale-mismatch exposes null result payload', async () => {
    const staleError = Object.assign(new Error('Rule snapshot is stale. Re-run fix on latest rule before applying.'), {
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
    });
    const adapter = makeAdapter(vi.fn().mockRejectedValue(staleError));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('stale-mismatch');
    });

    expect(result.current.state.result).toBeNull();
  });

  it('does not overwrite fresh state when stale in-flight request resolves later', async () => {
    let firstReject!: (reason?: unknown) => void;
    const firstPending = new Promise<SmartFixResult>((_resolve, reject) => {
      firstReject = reject;
    });

    const smartFix = vi
      .fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(MOCK_RESULT_VALID);
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });

    act(() => {
      result.current.run({
        ...MOCK_INPUT,
        ruleVersion: 13,
        ruleHash: 'fnv1a-newer',
      });
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-valid');
    });

    await act(async () => {
      firstReject(new Error('stale request completion'));
    });

    expect(smartFix).toHaveBeenCalledTimes(2);
  });

  it('maps non-stale failures to error state with friendly message', async () => {
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error('Some unknown failure')));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state).toEqual({
      status: 'error',
      result: null,
      error: 'An unexpected error occurred. Please try again.',
    });
  });

  it('passes through FEATURE_NOT_ENABLED message from canonical gating', async () => {
    const featureDisabledError = Object.assign(new Error('"smartFix" is not enabled in this mode.'), {
      code: 'FEATURE_NOT_ENABLED',
      retryable: false,
    });
    const adapter = makeAdapter(vi.fn().mockRejectedValue(featureDisabledError));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBe('"smartFix" is not enabled in this mode.');
  });

  it('maps offline mode error to user-friendly message', async () => {
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error('Not available in offline mode')));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBe('Smart Fix is not available in offline mode');
  });

  it('passes through network error message', async () => {
    const netMsg = 'Could not reach Smart Fix service. Check your connection and try again.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(netMsg)));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBe(netMsg);
  });

  it('passes through rate limit error message', async () => {
    const rateLimit = 'Smart Fix service is temporarily busy. Please try again in a moment.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(rateLimit)));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBe(rateLimit);
  });

  it('passes through unexpected response error message', async () => {
    const unexpectedResponse = 'Received an unexpected response from the server.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(unexpectedResponse)));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBe(unexpectedResponse);
  });

  it('retry reuses last input after failure', async () => {
    const smartFix = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not reach Smart Fix service.'))
      .mockResolvedValueOnce(MOCK_RESULT_VALID);
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-valid');
    });

    expect(smartFix).toHaveBeenCalledTimes(2);
    expect(smartFix).toHaveBeenNthCalledWith(1, MOCK_INPUT);
    expect(smartFix).toHaveBeenNthCalledWith(2, MOCK_INPUT);
  });

  it('retry is a no-op before any request has been run', () => {
    const smartFix = vi.fn();
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.retry();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
    expect(smartFix).not.toHaveBeenCalled();
  });

  it('rerunOnLatest executes with latest snapshot payload after stale mismatch', async () => {
    const staleError = Object.assign(new Error('Rule hash mismatch. Re-run fix on latest rule before applying.'), {
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
    });
    const latestInput: SmartFixInput = {
      ...MOCK_INPUT,
      ruleVersion: 13,
      ruleHash: 'fnv1a-updated',
      failingExpression: 'coalesce(source("Invoice.Total"), 0)',
    };

    const smartFix = vi.fn().mockRejectedValueOnce(staleError).mockResolvedValueOnce(MOCK_RESULT_VALID);
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('stale-mismatch');
    });

    act(() => {
      result.current.rerunOnLatest(latestInput);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-valid');
    });

    expect(smartFix).toHaveBeenCalledTimes(2);
    expect(smartFix).toHaveBeenNthCalledWith(1, MOCK_INPUT);
    expect(smartFix).toHaveBeenNthCalledWith(2, latestInput);
  });

  it('dismiss and failure paths do not mutate caller input object', async () => {
    const input: SmartFixInput = {
      ...MOCK_INPUT,
      diagnostics: MOCK_INPUT.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
    const snapshot = JSON.parse(JSON.stringify(input)) as SmartFixInput;

    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error('Some unknown failure')));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(input);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    expect(input).toEqual(snapshot);

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
    expect(input).toEqual(snapshot);
  });

  it('reset aborts in-flight request and clears last input so retry remains a no-op', async () => {
    let resolveRequest!: (value: SmartFixResult) => void;
    const pending = new Promise<SmartFixResult>((resolve) => {
      resolveRequest = resolve;
    });

    const smartFix = vi.fn().mockReturnValue(pending);
    const adapter = makeAdapter(smartFix);
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('loading');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      resolveRequest(MOCK_RESULT_VALID);
    });

    act(() => {
      result.current.retry();
    });

    expect(result.current.state.status).toBe('idle');
    expect(smartFix).toHaveBeenCalledTimes(1);
  });

  it('reset from success state returns to idle', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT_VALID));
    const { result } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('success-valid');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('abort is called on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    let resolveRequest!: (value: SmartFixResult) => void;
    const pending = new Promise<SmartFixResult>((resolve) => {
      resolveRequest = resolve;
    });

    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));
    const { result, unmount } = renderHook(() => useSmartFix(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });

    unmount();
    expect(abortSpy).toHaveBeenCalled();

    void resolveRequest(MOCK_RESULT_VALID);
    abortSpy.mockRestore();
  });
});
