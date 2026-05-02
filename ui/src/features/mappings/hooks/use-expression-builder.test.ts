import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { useExpressionBuilder } from './use-expression-builder';

import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeRule = (expression: string): MappingRule => ({
  target: 'output.field',
  type: 'string',
  expression,
  description: 'test rule',
});

const rules: readonly MappingRule[] = [
  makeRule('source("name")'),
  makeRule('upper(source("code"))'),
  makeRule(''),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useExpressionBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null selectedRule and empty expression when selectedRuleIndex is null', () => {
    const updateRule = vi.fn();
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: null,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    expect(result.current.selectedRule).toBeNull();
    expect(result.current.expression).toBe('');
    expect(result.current.isValid).toBe(true);
  });

  it('loads expression from the selected rule', () => {
    const updateRule = vi.fn();
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    expect(result.current.selectedRule).toBe(rules[0]);
    expect(result.current.expression).toBe('source("name")');
  });

  it('updates expression when selectedRuleIndex changes', () => {
    const updateRule = vi.fn();
    let selectedRuleIndex = 0;

    const { result, rerender } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    expect(result.current.expression).toBe('source("name")');

    selectedRuleIndex = 1;
    rerender();

    expect(result.current.expression).toBe('upper(source("code"))');
  });

  it('debounces updateRule calls (does not call immediately)', () => {
    const updateRule = vi.fn();
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    act(() => {
      result.current.setExpression('static("hello")');
    });

    expect(updateRule).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(updateRule).toHaveBeenCalledTimes(1);
    expect(updateRule).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ expression: 'static("hello")' }),
    );
  });

  it('does not commit invalid expressions to rule state', () => {
    const updateRule = vi.fn();
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    act(() => {
      result.current.setExpression('concat(source("name"), '); // invalid — missing closing paren
    });

    act(() => {
      vi.advanceTimersByTime(600); // advance past both debounce timers
    });

    expect(updateRule).not.toHaveBeenCalled();
  });

  it('commits empty expression (clearing is valid)', () => {
    const updateRule = vi.fn();
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule,
        parsedSourceSchema: null,
      }),
    );

    act(() => {
      result.current.setExpression('');
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(updateRule).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ expression: '' }),
    );
  });

  it('mode defaults to editor', () => {
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    expect(result.current.mode).toBe('editor');
  });

  it('switchToEditor sets mode to editor', () => {
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    act(() => { result.current.switchToEditor(); });
    expect(result.current.mode).toBe('editor');
  });

  it('switchToBuilder with simple expression succeeds and sets builder mode', () => {
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0, // expression: source("name")
        rules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    act(() => { result.current.switchToBuilder(); });
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
    expect(result.current.initialBuilderState).not.toBeNull();
  });

  it('switchToBuilder with complex expression sets decompositionWarning and stays in editor', () => {
    // 4-level nesting → too deep
    const complexRules: readonly MappingRule[] = [
      makeRule('if(gt(concat(source("x"), "a"), 10), static("yes"), static("no"))'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    act(() => { result.current.switchToBuilder(); });
    expect(result.current.mode).toBe('editor'); // stayed in editor
    expect(result.current.decompositionWarning).toMatch(/nests too deeply/i);
  });

  it('dismissDecompositionWarning clears the warning', () => {
    const complexRules: readonly MappingRule[] = [
      makeRule('if(gt(concat(source("x"), "a"), 10), static("yes"), static("no"))'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    act(() => { result.current.switchToBuilder(); });
    expect(result.current.decompositionWarning).not.toBeNull();

    act(() => { result.current.dismissDecompositionWarning(); });
    expect(result.current.decompositionWarning).toBeNull();
    expect(result.current.mode).toBe('editor');
  });

  it('forceBuilder clears warning and switches to builder mode', () => {
    const complexRules: readonly MappingRule[] = [
      makeRule('if(gt(concat(source("x"), "a"), 10), static("yes"), static("no"))'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    act(() => { result.current.switchToBuilder(); });
    act(() => { result.current.forceBuilder(); });
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
  });
});
