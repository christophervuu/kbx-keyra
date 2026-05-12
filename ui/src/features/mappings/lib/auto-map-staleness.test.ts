import { describe, expect, it } from 'vitest';

import type { SuggestionWorkspaceItem } from '../types';
import { detectStaleSuggestions } from './auto-map-staleness';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<SuggestionWorkspaceItem> & { targetPath: string },
): SuggestionWorkspaceItem {
  return {
    targetPath: overrides.targetPath,
    suggestedExpression: overrides.suggestedExpression ?? 'source.field',
    explanation: overrides.explanation ?? 'Maps field',
    confidence: overrides.confidence ?? 'high',
    validation: overrides.validation,
    status: overrides.status ?? 'suggested',
    isNew: overrides.isNew ?? false,
    existingExpressionAtGeneration: overrides.existingExpressionAtGeneration ?? null,
  };
}

const RULE = (target: string, expression: string) => ({ target, expression });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectStaleSuggestions', () => {
  // -------------------------------------------------------------------------
  // No staleness when rules unchanged
  // -------------------------------------------------------------------------

  it('returns empty array when no rules have changed', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id' }),
      makeItem({ targetPath: 'Order.Amount', existingExpressionAtGeneration: 'source.total' }),
    ];
    const rules = [RULE('Order.Id', 'source.id'), RULE('Order.Amount', 'source.total')];

    expect(detectStaleSuggestions(items, rules)).toEqual([]);
  });

  it('returns empty array when items are new (isNew=true) and no rules exist', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', isNew: true, existingExpressionAtGeneration: null }),
    ];
    const rules: ReturnType<typeof RULE>[] = [];

    expect(detectStaleSuggestions(items, rules)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Stale when existing expression changed
  // -------------------------------------------------------------------------

  it('detects stale when saved rule expression differs from existingExpressionAtGeneration', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id' }),
    ];
    const rules = [RULE('Order.Id', 'source.orderId')]; // changed

    expect(detectStaleSuggestions(items, rules)).toEqual(['Order.Id']);
  });

  it('detects multiple stale items', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id' }),
      makeItem({ targetPath: 'Order.Amount', existingExpressionAtGeneration: 'source.total' }),
      makeItem({ targetPath: 'Order.Status', existingExpressionAtGeneration: 'source.status' }),
    ];
    const rules = [
      RULE('Order.Id', 'source.orderId'),    // changed
      RULE('Order.Amount', 'source.total'),  // unchanged
      RULE('Order.Status', 'source.state'),  // changed
    ];

    const result = detectStaleSuggestions(items, rules);
    expect(result).toContain('Order.Id');
    expect(result).toContain('Order.Status');
    expect(result).not.toContain('Order.Amount');
    expect(result).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Stale when new rule added for previously unmapped target
  // -------------------------------------------------------------------------

  it('detects stale when isNew=true and a rule now exists for that target', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', isNew: true, existingExpressionAtGeneration: null }),
    ];
    const rules = [RULE('Order.Id', 'source.id')]; // rule added after generation

    expect(detectStaleSuggestions(items, rules)).toEqual(['Order.Id']);
  });

  // -------------------------------------------------------------------------
  // Draft expression staleness
  // -------------------------------------------------------------------------

  it('detects stale when draft expression differs from existingExpressionAtGeneration', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id' }),
    ];
    const rules = [RULE('Order.Id', 'source.id')]; // saved rule unchanged
    const getDraft = (path: string) => (path === 'Order.Id' ? 'source.orderId' : null);

    expect(detectStaleSuggestions(items, rules, getDraft)).toEqual(['Order.Id']);
  });

  it('does not mark stale when draft matches existingExpressionAtGeneration', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id' }),
    ];
    const rules = [RULE('Order.Id', 'source.id')];
    const getDraft = (path: string) => (path === 'Order.Id' ? 'source.id' : null);

    expect(detectStaleSuggestions(items, rules, getDraft)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Terminal states are never stale
  // -------------------------------------------------------------------------

  it('does not mark accepted items as stale even when rule changed', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id', status: 'accepted' }),
    ];
    const rules = [RULE('Order.Id', 'source.orderId')]; // changed

    expect(detectStaleSuggestions(items, rules)).toEqual([]);
  });

  it('does not mark edited items as stale even when rule changed', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id', status: 'edited' }),
    ];
    const rules = [RULE('Order.Id', 'source.orderId')]; // changed

    expect(detectStaleSuggestions(items, rules)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Dismissed items can be stale
  // -------------------------------------------------------------------------

  it('marks dismissed items as stale when rule changed', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id', status: 'dismissed' }),
    ];
    const rules = [RULE('Order.Id', 'source.orderId')];

    expect(detectStaleSuggestions(items, rules)).toEqual(['Order.Id']);
  });

  // -------------------------------------------------------------------------
  // Idempotency — already-stale items included in result
  // -------------------------------------------------------------------------

  it('includes already-stale items in result (idempotent)', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', existingExpressionAtGeneration: 'source.id', status: 'stale' }),
    ];
    const rules = [RULE('Order.Id', 'source.orderId')]; // still changed

    expect(detectStaleSuggestions(items, rules)).toEqual(['Order.Id']);
  });

  // -------------------------------------------------------------------------
  // Empty inputs
  // -------------------------------------------------------------------------

  it('returns empty array for empty items', () => {
    expect(detectStaleSuggestions([], [RULE('Order.Id', 'source.id')])).toEqual([]);
  });

  it('returns empty array for empty rules when all items are new', () => {
    const items = [
      makeItem({ targetPath: 'Order.Id', isNew: true, existingExpressionAtGeneration: null }),
    ];
    expect(detectStaleSuggestions(items, [])).toEqual([]);
  });
});
