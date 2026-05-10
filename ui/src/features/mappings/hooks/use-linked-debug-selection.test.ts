import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DebugSelection } from '../types';
import { useLinkedDebugSelection } from './use-linked-debug-selection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SELECTION_A: DebugSelection = {
  targetPath: 'Order.Status',
  ruleIndex: 2,
  source: 'diagnostics',
};

const SELECTION_B: DebugSelection = {
  targetPath: 'Order.Id',
  ruleIndex: 5,
  source: 'trace',
};

const SELECTION_NO_RULE: DebugSelection = {
  targetPath: 'Order.Total',
  ruleIndex: undefined,
  source: 'diff',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useLinkedDebugSelection', () => {
  describe('initial state', () => {
    it('starts with selection null', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());
      expect(result.current.selection).toBeNull();
    });
  });

  describe('select()', () => {
    it('sets the selection', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.selection).toEqual(SELECTION_A);
    });

    it('replaces a previous selection with a new one', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });
      act(() => {
        result.current.select(SELECTION_B);
      });

      expect(result.current.selection).toEqual(SELECTION_B);
    });

    it('accepts a selection with undefined ruleIndex', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_NO_RULE);
      });

      expect(result.current.selection).toEqual(SELECTION_NO_RULE);
      expect(result.current.selection?.ruleIndex).toBeUndefined();
    });
  });

  describe('clear()', () => {
    it('resets selection to null', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });
      act(() => {
        result.current.clear();
      });

      expect(result.current.selection).toBeNull();
    });

    it('is a no-op when selection is already null', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.clear();
      });

      expect(result.current.selection).toBeNull();
    });
  });

  describe('isPathSelected()', () => {
    it('returns true when targetPath matches the current selection', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.isPathSelected('Order.Status')).toBe(true);
    });

    it('returns false when targetPath does not match', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.isPathSelected('Order.Id')).toBe(false);
    });

    it('returns false when selection is null', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      expect(result.current.isPathSelected('Order.Status')).toBe(false);
    });

    it('is case-sensitive', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.isPathSelected('order.status')).toBe(false);
    });
  });

  describe('isRuleSelected()', () => {
    it('returns true when ruleIndex matches the current selection', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.isRuleSelected(2)).toBe(true);
    });

    it('returns false when ruleIndex does not match', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.isRuleSelected(99)).toBe(false);
    });

    it('returns false when selection is null', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      expect(result.current.isRuleSelected(2)).toBe(false);
    });

    it('returns false when selection has undefined ruleIndex', () => {
      const { result } = renderHook(() => useLinkedDebugSelection());

      act(() => {
        result.current.select(SELECTION_NO_RULE);
      });

      // ruleIndex is undefined — no rule match is possible
      expect(result.current.isRuleSelected(0)).toBe(false);
    });
  });

  describe('auto-clear on executionStatus', () => {
    it('clears selection when executionStatus transitions to "executing"', () => {
      const { result, rerender } = renderHook(
        ({ status }: { status: string | undefined }) =>
          useLinkedDebugSelection(status),
        { initialProps: { status: 'idle' } },
      );

      act(() => {
        result.current.select(SELECTION_A);
      });
      expect(result.current.selection).toEqual(SELECTION_A);

      rerender({ status: 'executing' });

      expect(result.current.selection).toBeNull();
    });

    it('does not clear selection when executionStatus is "success"', () => {
      const { result, rerender } = renderHook(
        ({ status }: { status: string | undefined }) =>
          useLinkedDebugSelection(status),
        { initialProps: { status: 'idle' } },
      );

      act(() => {
        result.current.select(SELECTION_A);
      });

      rerender({ status: 'success' });

      expect(result.current.selection).toEqual(SELECTION_A);
    });

    it('does not clear selection when executionStatus is "error"', () => {
      const { result, rerender } = renderHook(
        ({ status }: { status: string | undefined }) =>
          useLinkedDebugSelection(status),
        { initialProps: { status: 'idle' } },
      );

      act(() => {
        result.current.select(SELECTION_A);
      });

      rerender({ status: 'error' });

      expect(result.current.selection).toEqual(SELECTION_A);
    });

    it('works correctly when executionStatus is undefined', () => {
      const { result } = renderHook(() => useLinkedDebugSelection(undefined));

      act(() => {
        result.current.select(SELECTION_A);
      });

      expect(result.current.selection).toEqual(SELECTION_A);
    });

    it('clears selection each time status transitions to "executing"', () => {
      const { result, rerender } = renderHook(
        ({ status }: { status: string }) =>
          useLinkedDebugSelection(status),
        { initialProps: { status: 'idle' } },
      );

      // First run
      act(() => { result.current.select(SELECTION_A); });
      rerender({ status: 'executing' });
      expect(result.current.selection).toBeNull();

      // Second run — select again, then execute again
      rerender({ status: 'success' });
      act(() => { result.current.select(SELECTION_B); });
      expect(result.current.selection).toEqual(SELECTION_B);

      rerender({ status: 'executing' });
      expect(result.current.selection).toBeNull();
    });
  });
});
