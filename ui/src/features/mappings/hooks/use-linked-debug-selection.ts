import { useCallback, useEffect, useState } from 'react';

import type { DebugSelection } from '../types';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseLinkedDebugSelectionResult {
  /** The currently active linked selection, or null if nothing is selected. */
  readonly selection: DebugSelection | null;
  /**
   * Set the active selection. Replaces any previous selection.
   * Typically called from a display component's click handler.
   */
  readonly select: (selection: DebugSelection) => void;
  /** Clear the active selection. */
  readonly clear: () => void;
  /**
   * Returns true if the given targetPath matches the current selection's
   * targetPath. Used by display components to determine highlight state.
   */
  readonly isPathSelected: (path: string) => boolean;
  /**
   * Returns true if the given ruleIndex matches the current selection's
   * ruleIndex. Used by display components to determine highlight state.
   */
  readonly isRuleSelected: (ruleIndex: number) => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages linked debug selection state for the Test Lab cross-panel
 * debugging workflow (FS-036).
 *
 * Instantiate at the page/orchestration level (AdvancedTestingPage or
 * InlinePreviewStrip) and pass `selection`, `select`, `isPathSelected`, and
 * `isRuleSelected` as props to each display component.
 *
 * @param executionStatus - The current execution status string from
 *   `PreviewExecutionState`. When this transitions to `'executing'`, the
 *   selection is automatically cleared so stale highlights from a previous
 *   run do not persist into the new result.
 */
export function useLinkedDebugSelection(
  executionStatus?: string,
): UseLinkedDebugSelectionResult {
  const [selection, setSelection] = useState<DebugSelection | null>(null);

  // Auto-clear when a new execution starts.
  useEffect(() => {
    if (executionStatus === 'executing') {
      setSelection(null);
    }
  }, [executionStatus]);

  const select = useCallback((sel: DebugSelection) => {
    setSelection(sel);
  }, []);

  const clear = useCallback(() => {
    setSelection(null);
  }, []);

  const isPathSelected = useCallback(
    (path: string): boolean => {
      return selection !== null && selection.targetPath === path;
    },
    [selection],
  );

  const isRuleSelected = useCallback(
    (ruleIndex: number): boolean => {
      return (
        selection !== null &&
        selection.ruleIndex !== undefined &&
        selection.ruleIndex === ruleIndex
      );
    },
    [selection],
  );

  return { selection, select, clear, isPathSelected, isRuleSelected };
}
