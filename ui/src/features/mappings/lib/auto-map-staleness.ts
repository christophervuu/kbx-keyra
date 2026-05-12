import type { MappingRule } from '@/lib/types/domain';

import type { SuggestionWorkspaceItem } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Optional draft-expression accessor.
 * When provided, staleness detection also considers in-flight draft expressions
 * (i.e. unsaved edits the user has made since the suggestions were generated).
 */
export type GetDraftExpression = (targetPath: string) => string | null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses that are terminal — never marked stale. */
const TERMINAL_STATUSES = new Set(['accepted', 'edited']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect which workspace suggestion items have become stale relative to the
 * current mapping rules (and optional draft expressions).
 *
 * Staleness conditions (per spec AE-03):
 * 1. The saved rule expression for the target path differs from
 *    `existingExpressionAtGeneration` (rule was manually edited after generation).
 * 2. A draft expression exists for the target path and differs from
 *    `existingExpressionAtGeneration` (user is mid-edit).
 * 3. The item was `isNew === true` at generation time (no rule existed) but a
 *    rule now exists for that target path (rule was manually added).
 *
 * Terminal states (`accepted`, `edited`) are never marked stale.
 * Already-stale items are idempotently included in the result (no double-marking).
 *
 * @param items        Current workspace suggestion items.
 * @param currentRules Current saved mapping rules.
 * @param getDraft     Optional accessor for in-flight draft expressions.
 * @returns            Array of `targetPath` values that should be marked stale.
 */
export function detectStaleSuggestions(
  items: readonly SuggestionWorkspaceItem[],
  currentRules: readonly MappingRule[],
  getDraft?: GetDraftExpression,
): readonly string[] {
  const ruleByTarget = new Map<string, string>();
  for (const rule of currentRules) {
    ruleByTarget.set(rule.target, rule.expression);
  }

  const stalePaths: string[] = [];

  for (const item of items) {
    // Terminal states are never stale
    if (TERMINAL_STATUSES.has(item.status)) continue;

    const { targetPath, existingExpressionAtGeneration, isNew } = item;

    const savedExpression = ruleByTarget.get(targetPath) ?? null;
    const draftExpression = getDraft ? getDraft(targetPath) : null;

    // Condition 3: was unmapped at generation, now has a rule
    if (isNew && savedExpression !== null) {
      stalePaths.push(targetPath);
      continue;
    }

    // Condition 1: saved rule expression changed since generation
    if (savedExpression !== null && savedExpression !== existingExpressionAtGeneration) {
      stalePaths.push(targetPath);
      continue;
    }

    // Condition 2: draft expression differs from what was at generation
    if (
      draftExpression !== null &&
      draftExpression !== existingExpressionAtGeneration
    ) {
      stalePaths.push(targetPath);
      continue;
    }
  }

  return stalePaths;
}
