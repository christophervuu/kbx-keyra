/**
 * useUnsavedDiff — per-target-property unsaved diff state (FS-040 T-05).
 *
 * Compares the current draft expression for a target field against the
 * last-saved rule baseline from `useMappingEditor`. Returns a diff state
 * that drives the `UnsavedDiffPanel` component.
 *
 * Status semantics:
 *   'no-mapping'  — no saved rule and no current expression (field is untouched)
 *   'new'         — no saved rule but current expression exists (new mapping being authored)
 *   'unchanged'   — saved rule exists and expressions are identical
 *   'modified'    — saved rule exists and expressions differ
 *   'removed'     — saved rule exists but current expression is empty (mapping being deleted)
 */

import { useMemo } from 'react';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnsavedDiffStatus = 'new' | 'modified' | 'removed' | 'unchanged' | 'no-mapping';

export interface UnsavedDiffState {
  /** Diff classification for the current target field */
  readonly status: UnsavedDiffStatus;
  /** The expression from the last-saved rule, or null if no saved rule exists */
  readonly savedExpression: string | null;
  /** The current draft expression (may be empty) */
  readonly currentExpression: string;
  /**
   * True when the current state differs from the saved baseline.
   * True for 'new', 'modified', 'removed'. False for 'unchanged' and 'no-mapping'.
   */
  readonly hasUnsavedChanges: boolean;
}

export interface UseUnsavedDiffInput {
  /** The target field path being authored */
  readonly targetPath: string;
  /** The current draft expression (from ScalarFieldBuilder local state) */
  readonly currentExpression: string;
  /** Last-saved rules from useMappingEditor.savedRules */
  readonly savedRules: readonly MappingRule[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives the unsaved diff state for a single target field.
 *
 * Pure derivation — no side effects, no async. Memoized on inputs.
 */
export function useUnsavedDiff({
  targetPath,
  currentExpression,
  savedRules,
}: UseUnsavedDiffInput): UnsavedDiffState {
  return useMemo((): UnsavedDiffState => {
    const trimmedCurrent = currentExpression.trim();
    const savedRule = savedRules.find((r) => r.target === targetPath) ?? null;
    const savedExpression = savedRule?.expression?.trim() ?? null;

    if (savedRule === null) {
      // No saved rule for this target
      if (trimmedCurrent === '') {
        return {
          status: 'no-mapping',
          savedExpression: null,
          currentExpression,
          hasUnsavedChanges: false,
        };
      }
      return {
        status: 'new',
        savedExpression: null,
        currentExpression,
        hasUnsavedChanges: true,
      };
    }

    // Saved rule exists
    if (trimmedCurrent === '') {
      return {
        status: 'removed',
        savedExpression,
        currentExpression,
        hasUnsavedChanges: true,
      };
    }

    if (trimmedCurrent === (savedExpression ?? '')) {
      return {
        status: 'unchanged',
        savedExpression,
        currentExpression,
        hasUnsavedChanges: false,
      };
    }

    return {
      status: 'modified',
      savedExpression,
      currentExpression,
      hasUnsavedChanges: true,
    };
  }, [targetPath, currentExpression, savedRules]);
}
