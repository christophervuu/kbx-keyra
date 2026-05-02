import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { mapDiagnosticsToDecorations, useDslValidation } from './use-dsl-validation';
import type { ParseResult } from '@/lib/engine';

// ---------------------------------------------------------------------------
// mapDiagnosticsToDecorations unit tests (pure function, no hook overhead)
// ---------------------------------------------------------------------------

describe('mapDiagnosticsToDecorations', () => {
  it('returns empty array when parseResult has no diagnostics', () => {
    const result: ParseResult = { success: true, ast: null, diagnostics: [] };
    expect(mapDiagnosticsToDecorations(result, 'source("x")')).toEqual([]);
  });

  it('produces full-expression decoration when ast is null (syntax error)', () => {
    const expr = 'source(';
    const result: ParseResult = {
      success: false,
      ast: null,
      diagnostics: [
        {
          code: 'KEYRA-E001',
          severity: 'error',
          message: 'Invalid syntax: unexpected end of input',
        },
      ],
    };
    const decorations = mapDiagnosticsToDecorations(result, expr);
    expect(decorations).toHaveLength(1);
    expect(decorations[0].start).toBe(0);
    expect(decorations[0].end).toBe(expr.length);
    expect(decorations[0].code).toBe('KEYRA-E001');
    expect(decorations[0].severity).toBe('error');
  });

  it('uses AST node position when ast is available and location.function matches', () => {
    const expr = 'unknownFn("x")';
    // Build a synthetic AST with a FunctionCallNode at known positions
    const ast = {
      type: 'FunctionCall' as const,
      name: 'unknownFn',
      arguments: [],
      start: 0,
      end: 14,
    };
    const result: ParseResult = {
      success: true,
      ast,
      diagnostics: [
        {
          code: 'KEYRA-E002',
          severity: 'error',
          message: 'Unknown function: `unknownFn`',
          location: { function: 'unknownFn' },
        },
      ],
    };
    const decorations = mapDiagnosticsToDecorations(result, expr);
    expect(decorations[0].start).toBe(0);
    expect(decorations[0].end).toBe(14);
  });

  it('falls back to full-expression range when function name not found in AST', () => {
    const expr = 'source("x")';
    const ast = {
      type: 'FunctionCall' as const,
      name: 'source',
      arguments: [],
      start: 0,
      end: 11,
    };
    const result: ParseResult = {
      success: true,
      ast,
      diagnostics: [
        {
          code: 'KEYRA-E002',
          severity: 'error',
          message: 'Unknown function: `missingFn`',
          location: { function: 'missingFn' },
        },
      ],
    };
    const decorations = mapDiagnosticsToDecorations(result, expr);
    expect(decorations[0].start).toBe(0);
    expect(decorations[0].end).toBe(expr.length);
  });

  it('preserves severity from diagnostic', () => {
    const expr = 'concat()';
    const ast = {
      type: 'FunctionCall' as const,
      name: 'concat',
      arguments: [],
      start: 0,
      end: 8,
    };
    const result: ParseResult = {
      success: true,
      ast,
      diagnostics: [
        {
          code: 'KEYRA-E003',
          severity: 'error',
          message: 'Wrong number of arguments for `concat`',
          location: { function: 'concat' },
        },
      ],
    };
    const decorations = mapDiagnosticsToDecorations(result, expr);
    expect(decorations[0].severity).toBe('error');
    expect(decorations[0].message).toBe('Wrong number of arguments for `concat`');
  });
});

// ---------------------------------------------------------------------------
// useDslValidation hook tests
// ---------------------------------------------------------------------------

describe('useDslValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns valid + no diagnostics for empty expression immediately', () => {
    const { result } = renderHook(() => useDslValidation(''));
    expect(result.current.isValid).toBe(true);
    expect(result.current.isValidating).toBe(false);
    expect(result.current.diagnostics).toHaveLength(0);
    expect(result.current.errorDecorations).toHaveLength(0);
    expect(result.current.parseResult).toBeNull();
  });

  it('sets isValidating=true during debounce window', () => {
    const { result } = renderHook(() => useDslValidation('source("x")'));
    expect(result.current.isValidating).toBe(true);
  });

  it('resolves isValidating=false after debounce fires', async () => {
    const { result } = renderHook(() => useDslValidation('source("x")'));
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      expect(result.current.isValidating).toBe(false);
    });
  });

  it('returns isValid=true for a syntactically valid expression', async () => {
    const { result } = renderHook(() => useDslValidation('source("name")'));
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      expect(result.current.isValidating).toBe(false);
    });
    expect(result.current.isValid).toBe(true);
    expect(result.current.parseResult?.success).toBe(true);
  });

  it('returns isValid=false for a syntax-error expression', async () => {
    const { result } = renderHook(() => useDslValidation('source('));
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => {
      expect(result.current.isValidating).toBe(false);
    });
    expect(result.current.isValid).toBe(false);
    expect(result.current.errorDecorations.length).toBeGreaterThan(0);
    expect(result.current.errorDecorations[0].severity).toBe('error');
  });

  it('produces error decoration for invalid expression spanning full expression', async () => {
    const expr = 'source(';
    const { result } = renderHook(() => useDslValidation(expr));
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.isValidating).toBe(false));
    const dec = result.current.errorDecorations[0];
    expect(dec).toBeDefined();
    expect(dec.start).toBe(0);
    expect(dec.end).toBe(expr.length);
  });

  it('debounce: rapid expression changes only trigger one parse', async () => {
    let expr = 'source(';
    const { result, rerender } = renderHook((e: string) => useDslValidation(e), {
      initialProps: expr,
    });
    // Change expression multiple times quickly
    expr = 'source("';
    rerender(expr);
    expr = 'source("n';
    rerender(expr);
    expr = 'source("name")';
    rerender(expr);
    // Only the last expression should be parsed after 300ms
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.isValidating).toBe(false));
    expect(result.current.isValid).toBe(true);
  });

  it('resets to empty/valid state when expression changes to empty', async () => {
    const { result, rerender } = renderHook((e: string) => useDslValidation(e), {
      initialProps: 'source("x")',
    });
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.isValidating).toBe(false));

    rerender('');
    expect(result.current.isValid).toBe(true);
    expect(result.current.parseResult).toBeNull();
    expect(result.current.isValidating).toBe(false);
  });

  it('produces warning decoration for unknown function', async () => {
    // Using with defaultRegistry, an unknown function name triggers KEYRA-E002
    const { result } = renderHook(() => useDslValidation('unknownFunctionXYZ("x")'));
    act(() => { vi.advanceTimersByTime(300); });
    await waitFor(() => expect(result.current.isValidating).toBe(false));
    // KEYRA-E002 has severity 'error' per codes.ts
    const dec = result.current.errorDecorations.find((d) => d.code === 'KEYRA-E002');
    expect(dec).toBeDefined();
  });
});
