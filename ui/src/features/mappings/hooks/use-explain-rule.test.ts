import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExplainRule } from './use-explain-rule';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { ExplainRuleInput, ExplainRuleResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_INPUT: ExplainRuleInput = {
  targetPath: 'order.total',
  expression: 'source.price * source.qty',
};

const MOCK_RESULT: ExplainRuleResult = {
  explanation: 'Multiplies price by quantity to compute the order total.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(explainRule: ApiAdapter['explainRule']): Partial<ApiAdapter> {
  return { explainRule };
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

describe('useExplainRule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial idle state', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      result: null,
      error: null,
    });
  });

  it('transitions to loading when explain() is called', async () => {
    let resolveExplain!: (value: ExplainRuleResult) => void;
    const pending = new Promise<ExplainRuleResult>((res) => {
      resolveExplain = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('loading');
    expect(result.current.state.result).toBeNull();
    expect(result.current.state.error).toBeNull();

    // Resolve to avoid dangling promise
    await act(async () => {
      resolveExplain(MOCK_RESULT);
    });
  });

  it('transitions to success with result when adapter resolves', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state).toEqual({
      status: 'success',
      result: MOCK_RESULT,
      error: null,
    });
  });

  it('transitions to error with user-friendly message when adapter rejects', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Some unknown failure')),
    );
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
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
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('error');
    expect(result.current.state.error).toBe(
      'Explain is not available in offline mode',
    );
  });

  it('passes through rate limit error message', async () => {
    const rateMsg = 'The AI service is temporarily busy. Please try again in a moment.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(rateMsg)));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state.error).toBe(rateMsg);
  });

  it('passes through network error message', async () => {
    const netMsg = 'Could not reach the Explain service. Check your connection and try again.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(netMsg)));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state.error).toBe(netMsg);
  });

  it('passes through unexpected response error message', async () => {
    const msg = 'Received an unexpected response from the server.';
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error(msg)));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    expect(result.current.state.error).toBe(msg);
  });

  it('dismiss() resets state to idle', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
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

  it('calling explain() after success resets and re-fetches', async () => {
    const explainFn = vi.fn().mockResolvedValue(MOCK_RESULT);
    const adapter = makeAdapter(explainFn);
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('success');

    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('success');
    expect(explainFn).toHaveBeenCalledTimes(2);
  });

  it('calling explain() while loading aborts previous request', async () => {
    let firstResolve!: (value: ExplainRuleResult) => void;
    const firstPending = new Promise<ExplainRuleResult>((res) => {
      firstResolve = res;
    });

    const explainFn = vi.fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce(MOCK_RESULT);

    const adapter = makeAdapter(explainFn);
    const { result } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    // Start first request
    act(() => {
      result.current.explain(MOCK_INPUT);
    });
    expect(result.current.state.status).toBe('loading');

    // Start second request while first is in-flight
    await act(async () => {
      result.current.explain(MOCK_INPUT);
    });

    // Second request resolved — state should be success
    expect(result.current.state.status).toBe('success');

    // Resolve first request — should NOT update state (aborted)
    await act(async () => {
      firstResolve(MOCK_RESULT);
    });

    // State should still be success (not reset by the stale first request)
    expect(result.current.state.status).toBe('success');
    expect(explainFn).toHaveBeenCalledTimes(2);
  });

  it('abort is called on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    let resolveExplain!: (value: ExplainRuleResult) => void;
    const pending = new Promise<ExplainRuleResult>((res) => {
      resolveExplain = res;
    });
    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));

    const { result, unmount } = renderHook(() => useExplainRule(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.explain(MOCK_INPUT);
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();

    // Resolve to avoid dangling promise
    resolveExplain(MOCK_RESULT);
    abortSpy.mockRestore();
  });
});
