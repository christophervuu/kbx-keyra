import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSuggestExpression } from './use-suggest-expression';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { SuggestExpressionInput, SuggestExpressionResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_INPUT: SuggestExpressionInput = {
  instruction: 'default to USD if source currency is missing',
  targetPath: 'Order.Header.Currency',
  targetType: 'string',
  sourceContext: '- Invoice.CurrencyCode (string)',
};

const MOCK_RESULT: SuggestExpressionResult = {
  expression: 'default(source("Invoice.CurrencyCode"), "USD")',
  explanation: 'Uses source currency and falls back to USD.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(
  suggestExpression: ApiAdapter['suggestExpression'],
): Partial<ApiAdapter> {
  return { suggestExpression };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSuggestExpression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial idle state', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('transitions idle → inputting on openInput()', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.openInput();
    });

    expect(result.current.state).toEqual({
      status: 'inputting',
      result: null,
      error: null,
    });
  });

  it('transitions inputting → loading when generate() is called', async () => {
    let resolveGenerate!: (value: SuggestExpressionResult) => void;
    const pending = new Promise<SuggestExpressionResult>((res) => {
      resolveGenerate = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.openInput();
    });
    expect(result.current.state.status).toBe('inputting');

    act(() => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('loading');
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.error).toBeNull();

    // Resolve to avoid dangling promise
    await act(async () => {
      resolveGenerate(MOCK_RESULT);
    });
  });

  it('transitions loading → success with result when adapter resolves', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state).toEqual({
      status: 'success',
      result: MOCK_RESULT,
      error: null,
    });
  });

  it('transitions loading → error with user-friendly message when adapter rejects', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Some unknown failure')),
    );
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.error).toBe(
      'An unexpected error occurred. Please try again.',
    );
  });

  it('maps offline mode error to user-friendly message', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Not available in offline mode')),
    );
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe(
      'Suggest Expression is not available in offline mode',
    );
  });

  it('passes through rate limit error message', async () => {
    const rateMsg =
      'The Suggest service is temporarily busy. Please try again in a moment.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(rateMsg)));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state.error).toBe(rateMsg);
  });

  it('passes through network error message', async () => {
    const netMsg =
      'Could not reach the Suggest service. Check your connection and try again.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(netMsg)));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    expect(result.current.state.error).toBe(netMsg);
  });

  it('dismiss() resets state to idle', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('reset() resets state to idle', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('success');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('reset() aborts in-flight request and does not update state', async () => {
    let resolveGenerate!: (value: SuggestExpressionResult) => void;
    const pending = new Promise<SuggestExpressionResult>((res) => {
      resolveGenerate = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.generate(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('loading');

    act(() => {
      result.current.reset();
    });
    expect(result.current.state.status).toBe('idle');

    // Resolve the in-flight request — should NOT update state
    await act(async () => {
      resolveGenerate(MOCK_RESULT);
    });

    expect(result.current.state.status).toBe('idle');
  });

  it('re-invocation aborts previous in-flight request', async () => {
    let firstResolve!: (value: SuggestExpressionResult) => void;
    const firstPending = new Promise<SuggestExpressionResult>((res) => {
      firstResolve = res;
    });

    const generateFn = vi
      .fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(MOCK_RESULT);

    const adapter = makeAdapter(generateFn);
    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    // Start first request
    act(() => {
      result.current.generate(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('loading');

    // Start second request while first is in-flight
    await act(async () => {
      result.current.generate(MOCK_INPUT);
    });

    // Second request resolved — state should be success
    expect(result.current.state.status).toBe('success');

    // Resolve first request — should NOT update state (aborted)
    await act(async () => {
      firstResolve(MOCK_RESULT);
    });

    expect(result.current.state.status).toBe('success');
    expect(generateFn).toHaveBeenCalledTimes(2);
  });

  it('abort is called on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    let resolveGenerate!: (value: SuggestExpressionResult) => void;
    const pending = new Promise<SuggestExpressionResult>((res) => {
      resolveGenerate = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result, unmount } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.generate(MOCK_INPUT);
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();

    // Resolve to avoid dangling promise
    resolveGenerate(MOCK_RESULT);
    abortSpy.mockRestore();
  });

  it('openInput() while loading aborts in-flight and transitions to inputting', async () => {
    let resolveGenerate!: (value: SuggestExpressionResult) => void;
    const pending = new Promise<SuggestExpressionResult>((res) => {
      resolveGenerate = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result } = renderHook(() => useSuggestExpression(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.generate(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('loading');

    act(() => {
      result.current.openInput();
    });
    expect(result.current.state.status).toBe('inputting');

    // Resolve the aborted request — should NOT update state
    await act(async () => {
      resolveGenerate(MOCK_RESULT);
    });

    expect(result.current.state.status).toBe('inputting');
  });
});
