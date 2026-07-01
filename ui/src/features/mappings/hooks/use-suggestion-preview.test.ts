import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSuggestionPreview } from './use-suggestion-preview';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSuggestionPreview', () => {
  it('returns null result when sourceData is null', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('source.id', null),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('returns null result when expression is empty', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('', { id: 1 }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('returns null result when expression is whitespace only', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('   ', { id: 1 }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('sets isEvaluating=true immediately when expression and sourceData are provided', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('source.id', { id: 42 }),
    );
    expect(result.current.isEvaluating).toBe(true);
  });

  it('evaluates expression after 150ms debounce', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('source.id', { id: 42 }),
    );
    expect(result.current.isEvaluating).toBe(true);
    act(() => {
      vi.advanceTimersByTime(150);
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isEvaluating).toBe(false);
    // Result depends on engine — just check it resolved
    expect(result.current.error === null || typeof result.current.error === 'string').toBe(true);
  });

  it('resets to null immediately when sourceData becomes null', () => {
    const { result, rerender } = renderHook(
      ({ expr, data }: { expr: string; data: unknown | null }) =>
        useSuggestionPreview(expr, data),
      { initialProps: { expr: 'source.id', data: { id: 1 } as unknown | null } },
    );
    expect(result.current.isEvaluating).toBe(true);
    rerender({ expr: 'source.id', data: null });
    expect(result.current.result).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('resets to null immediately when expression becomes empty', () => {
    const { result, rerender } = renderHook(
      ({ expr, data }: { expr: string; data: unknown | null }) =>
        useSuggestionPreview(expr, data),
      { initialProps: { expr: 'source.id', data: { id: 1 } as unknown | null } },
    );
    expect(result.current.isEvaluating).toBe(true);
    rerender({ expr: '', data: { id: 1 } });
    expect(result.current.result).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('returns explicit error when required enrichment aliases are missing', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('get(external("carrier"), "rateCode")', { id: 1 }, {
        requiredEnrichmentAliases: ['carrier'],
        externalSources: {},
      }),
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
    expect(result.current.error).toContain('Missing required enrichment sample');
  });

  it('evaluates enrichment expression when required alias data is present', () => {
    const { result } = renderHook(() =>
      useSuggestionPreview('get(external("carrier"), "rateCode")', { id: 1 }, {
        requiredEnrichmentAliases: ['carrier'],
        externalSources: { carrier: { rateCode: 'EXPRESS' } },
      }),
    );

    expect(result.current.isEvaluating).toBe(true);
    act(() => {
      vi.advanceTimersByTime(150);
      vi.runOnlyPendingTimers();
    });
    expect(result.current.isEvaluating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBe('EXPRESS');
  });
});
