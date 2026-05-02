/**
 * Tests for evaluateExpression helper and useExpressionPreview hook — T-10
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { evaluateExpression } from '@/lib/engine';
import { useExpressionPreview } from './use-expression-preview';

// ---------------------------------------------------------------------------
// evaluateExpression unit tests
// ---------------------------------------------------------------------------

describe('evaluateExpression', () => {
  it('source("name") with { name: "Alice" } → "Alice"', () => {
    const { value, error } = evaluateExpression('source("name")', { name: 'Alice' });
    expect(error).toBeNull();
    expect(value).toBe('Alice');
  });

  it('concat(source("a"), source("b")) with data → "Hello World"', () => {
    const { value, error } = evaluateExpression(
      'concat(source("a"), source("b"))',
      { a: 'Hello', b: ' World' },
    );
    expect(error).toBeNull();
    expect(value).toBe('Hello World');
  });

  it('static("test") with any data → "test"', () => {
    const { value, error } = evaluateExpression('static("test")', { anything: true });
    expect(error).toBeNull();
    expect(value).toBe('test');
  });

  it('invalid expression → error message returned', () => {
    const { value, error } = evaluateExpression('source("unclosed', { x: 1 });
    expect(value).toBeNull();
    expect(error).not.toBeNull();
  });

  it('null sourceData → null result (no error)', () => {
    const { value, error } = evaluateExpression('source("x")', null);
    expect(value).toBeNull();
    expect(error).toBeNull();
  });

  it('empty expression → null result (no error)', () => {
    const { value, error } = evaluateExpression('', { x: 1 });
    expect(value).toBeNull();
    expect(error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useExpressionPreview hook tests
// ---------------------------------------------------------------------------

describe('useExpressionPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null result when expression is empty', () => {
    const { result } = renderHook(() =>
      useExpressionPreview({ expression: '', sourceData: { x: 1 } }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('returns null result when sourceData is null', () => {
    const { result } = renderHook(() =>
      useExpressionPreview({ expression: 'source("x")', sourceData: null }),
    );
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isEvaluating).toBe(false);
  });

  it('returns evaluated result after debounce for valid expression + data', async () => {
    const { result } = renderHook(() =>
      useExpressionPreview({ expression: 'source("name")', sourceData: { name: 'Bob' } }),
    );

    // Should start evaluating
    expect(result.current.isEvaluating).toBe(true);

    act(() => { vi.advanceTimersByTime(350); });

    expect(result.current.isEvaluating).toBe(false);
    expect(result.current.result).toBe('Bob');
    expect(result.current.error).toBeNull();
  });

  it('returns error for invalid expression', () => {
    const { result } = renderHook(() =>
      useExpressionPreview({ expression: 'source("unclosed', sourceData: { x: 1 } }),
    );

    act(() => { vi.advanceTimersByTime(350); });

    expect(result.current.isEvaluating).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it('debounces — only evaluates after 300ms of quiet', () => {
    const { result, rerender } = renderHook(
      ({ expr }: { expr: string }) =>
        useExpressionPreview({ expression: expr, sourceData: { name: 'Alice' } }),
      { initialProps: { expr: 'source("n")' } },
    );

    expect(result.current.isEvaluating).toBe(true);

    // Rerender before debounce fires — resets timer
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ expr: 'source("name")' });

    // Advance remaining time
    act(() => { vi.advanceTimersByTime(350); });

    expect(result.current.result).toBe('Alice');
  });
});
