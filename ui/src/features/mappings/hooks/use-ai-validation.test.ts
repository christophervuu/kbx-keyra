import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAiValidation } from './use-ai-validation';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { ValidateMappingsInput, ValidationReport } from '@/lib/types';

const MOCK_INPUT: ValidateMappingsInput = {
  mappingId: 'mapping-1',
};

const MOCK_REPORT: ValidationReport = {
  summary: {
    totalIssues: 1,
    bySeverity: { info: 0, warning: 1, error: 0 },
    byCategory: {
      correctness: 0,
      completeness: 1,
      maintainability: 0,
      risk: 0,
    },
  },
  issues: [
    {
      id: 'issue-1',
      category: 'completeness',
      severity: 'warning',
      affectedRules: [{ ruleIndex: 1, targetPath: 'Order.Header.Currency' }],
      description: 'Fallback handling may be incomplete.',
      recommendation: 'Add an explicit default() fallback for missing values.',
    },
  ],
};

function makeAdapter(validateMappings: ApiAdapter['validateMappings']): Partial<ApiAdapter> {
  return { validateMappings };
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

describe('useAiValidation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial idle state', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_REPORT));
    const { result } = renderHook(() => useAiValidation(), {
      wrapper: makeWrapper(adapter),
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      report: null,
      error: null,
    });
  });

  it('transitions loading -> success and captures report', async () => {
    const validateMappings = vi.fn().mockResolvedValue(MOCK_REPORT);
    const adapter = makeAdapter(validateMappings);
    const { result } = renderHook(() => useAiValidation(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });

    expect(result.current.state.report).toEqual(MOCK_REPORT);
    expect(validateMappings).toHaveBeenCalledWith(MOCK_INPUT);
  });

  it('transitions loading -> error with normalized message on failure', async () => {
    const adapter = makeAdapter(vi.fn().mockRejectedValue(new Error('Some unknown failure')));
    const { result } = renderHook(() => useAiValidation(), {
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
      report: null,
      error: 'An unexpected error occurred. Please try again.',
    });
  });

  it('retry() replays last request payload', async () => {
    const validateMappings = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not reach AI Validation service.'))
      .mockResolvedValueOnce(MOCK_REPORT);

    const adapter = makeAdapter(validateMappings);
    const { result } = renderHook(() => useAiValidation(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run({
        mappingId: 'mapping-1',
        sampleData: {
          contentType: 'application/json',
          content: '{"hello":"world"}',
        },
      });
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('success');
    });

    expect(validateMappings).toHaveBeenCalledTimes(2);
    expect(validateMappings).toHaveBeenNthCalledWith(1, {
      mappingId: 'mapping-1',
      sampleData: {
        contentType: 'application/json',
        content: '{"hello":"world"}',
      },
    });
    expect(validateMappings).toHaveBeenNthCalledWith(2, {
      mappingId: 'mapping-1',
      sampleData: {
        contentType: 'application/json',
        content: '{"hello":"world"}',
      },
    });
  });

  it('retry() is a no-op when no prior run exists', () => {
    const validateMappings = vi.fn();
    const adapter = makeAdapter(validateMappings);
    const { result } = renderHook(() => useAiValidation(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.retry();
    });

    expect(validateMappings).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('reset() clears state and prevents in-flight completion from mutating state', async () => {
    let resolveRequest!: (value: ValidationReport) => void;
    const pending = new Promise<ValidationReport>((resolve) => {
      resolveRequest = resolve;
    });

    const adapter = makeAdapter(vi.fn().mockReturnValue(pending));
    const { result } = renderHook(() => useAiValidation(), {
      wrapper: makeWrapper(adapter),
    });

    act(() => {
      result.current.run(MOCK_INPUT);
    });

    expect(result.current.state.status).toBe('loading');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual({
      status: 'idle',
      report: null,
      error: null,
    });

    await act(async () => {
      resolveRequest(MOCK_REPORT);
    });

    expect(result.current.state.status).toBe('idle');
  });
});
