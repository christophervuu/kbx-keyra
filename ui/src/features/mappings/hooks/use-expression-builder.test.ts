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
      vi.advanceTimersByTime(600);
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

  it('mode defaults to builder when rule has a decomposable expression', () => {
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0, // source("name") — decomposable
        rules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    expect(result.current.mode).toBe('builder');
  });

  it('mode defaults to editor when rule has an empty expression', () => {
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 2, // empty expression
        rules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    // Empty expression → default empty builder state (builder mode)
    expect(result.current.mode).toBe('builder');
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

    // Auto-hydration already sets builder mode on mount
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
    // New decomposer succeeds → initialUnifiedBuilderState is set
    expect(result.current.initialUnifiedBuilderState).not.toBeNull();

    // Calling switchToBuilder again should also succeed
    act(() => { result.current.switchToBuilder(); });
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
  });

  it('switchToBuilder with concat expression succeeds via Source Card decomposition', () => {
    const complexRules: readonly MappingRule[] = [
      makeRule('concat(source("first"), source("last"))'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    // Auto-hydration on mount sets builder mode via Source Card fallback
    expect(result.current.mode).toBe('builder');

    // Calling switchToBuilder again should keep builder mode and no warning
    act(() => { result.current.switchToBuilder(); });
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
  });

  it('dismissDecompositionWarning clears the warning', () => {
    const complexRules: readonly MappingRule[] = [
      makeRule('{"id": "x"}'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    // Auto-hydration sets warning on mount
    expect(result.current.decompositionWarning).not.toBeNull();

    act(() => { result.current.dismissDecompositionWarning(); });
    expect(result.current.decompositionWarning).toBeNull();
    expect(result.current.mode).toBe('editor');
  });

  it('forceBuilder clears warning and switches to builder mode', () => {
    const complexRules: readonly MappingRule[] = [
      makeRule('{"id": "x"}'),
    ];
    const { result } = renderHook(() =>
      useExpressionBuilder({
        selectedRuleIndex: 0,
        rules: complexRules,
        updateRule: vi.fn(),
        parsedSourceSchema: null,
      }),
    );

    // Auto-hydration sets warning on mount
    expect(result.current.decompositionWarning).not.toBeNull();

    act(() => { result.current.forceBuilder(); });
    expect(result.current.mode).toBe('builder');
    expect(result.current.decompositionWarning).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // loadExpression (AE-01 through AE-05, AE-13)
  // ---------------------------------------------------------------------------

  describe('loadExpression', () => {
    it('AE-01: Value mode — decomposes source+transforms into builder state', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      act(() => {
        result.current.loadExpression('lower(trim(source("email")))');
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.decompositionWarning).toBeNull();
      expect(result.current.expression).toBe('lower(trim(source("email")))');
      expect(result.current.initialUnifiedBuilderState).not.toBeNull();
      expect(result.current.initialUnifiedBuilderState?.mode).toBe('value');
      if (result.current.initialUnifiedBuilderState?.mode === 'value') {
        expect(result.current.initialUnifiedBuilderState.sources).toHaveLength(1);
        expect(result.current.initialUnifiedBuilderState.sources[0].path).toBe('email');
        expect(result.current.initialUnifiedBuilderState.transforms).toHaveLength(2);
        expect(result.current.initialUnifiedBuilderState.transforms[0].functionName).toBe('trim');
        expect(result.current.initialUnifiedBuilderState.transforms[1].functionName).toBe('lower');
      }
    });

    it('AE-02: Conditional mode — decomposes if() into conditional state', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      act(() => {
        result.current.loadExpression('if(gt(source("amount"), 100), "high", "low")');
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.decompositionWarning).toBeNull();
      expect(result.current.initialUnifiedBuilderState?.mode).toBe('conditional');
    });

    it('AE-03: Value Map mode — decomposes valueMap() into value map state', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      act(() => {
        result.current.loadExpression('valueMap(source("status"), {"active": "Active", "inactive": "Inactive"}, null)');
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.decompositionWarning).toBeNull();
      expect(result.current.initialUnifiedBuilderState?.mode).toBe('valueMap');
    });

    it('AE-04: null/empty expression resets to default empty builder state', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      // First load something
      act(() => {
        result.current.loadExpression('source("name")');
      });
      expect(result.current.mode).toBe('builder');

      // Now reset with null
      act(() => {
        result.current.loadExpression(null);
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.expression).toBe('');
      expect(result.current.decompositionWarning).toBeNull();
      expect(result.current.initialUnifiedBuilderState).toBeNull();
    });

    it('AE-04: empty string resets to default empty builder state', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      act(() => {
        result.current.loadExpression('');
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.expression).toBe('');
      expect(result.current.decompositionWarning).toBeNull();
    });

    it('AE-05: unsupported expression falls back to Editor mode with warning', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      // object root is unsupported across all decomposers
      act(() => {
        result.current.loadExpression('{"id": "x"}');
      });

      expect(result.current.mode).toBe('editor');
      expect(result.current.decompositionWarning).not.toBeNull();
      expect(result.current.expression).toBe('{"id": "x"}');
    });

    it('loads concat expression into builder mode (no false complexity fallback)', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      act(() => {
        result.current.loadExpression('concat(source("first"), source("last"))');
      });

      expect(result.current.mode).toBe('builder');
      expect(result.current.decompositionWarning).toBeNull();
      expect(result.current.expression).toBe('concat(source("first"), source("last"))');
    });

    it('AE-13: Editor mode receives the loaded expression text', () => {
      const { result } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex: null,
          rules,
          updateRule: vi.fn(),
          parsedSourceSchema: null,
        }),
      );

      // Load an undecomposable expression → falls back to editor
      act(() => {
        result.current.loadExpression('{"id": "x"}');
      });

      expect(result.current.mode).toBe('editor');
      // expression string must be populated so RawDslEditor shows it
      expect(result.current.expression).toBe('{"id": "x"}');
    });

    it('auto-hydrates when selectedRuleIndex changes to a mapped rule', () => {
      const updateRule = vi.fn();
      let selectedRuleIndex = 2; // empty rule

      const { result, rerender } = renderHook(() =>
        useExpressionBuilder({
          selectedRuleIndex,
          rules,
          updateRule,
          parsedSourceSchema: null,
        }),
      );

      expect(result.current.mode).toBe('builder'); // empty → default builder

      selectedRuleIndex = 1; // upper(source("code")) — decomposable
      rerender();

      expect(result.current.mode).toBe('builder');
      expect(result.current.initialUnifiedBuilderState).not.toBeNull();
      expect(result.current.initialUnifiedBuilderState?.mode).toBe('value');
    });
  });
});
