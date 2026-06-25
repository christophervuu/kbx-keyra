import { describe, expect, it } from 'vitest';

import { resolveOutputNodeSelection } from './output-node-resolver';

import type { MappingRule, OutputPathEntry } from '@/lib/types/domain';

const RULES: readonly MappingRule[] = [
  {
    target: 'Order.Header.Currency',
    type: 'string',
    expression: 'source("currency")',
  },
  {
    target: 'Order.Items',
    type: 'array',
    expression: 'source("items")',
  },
] as const;

const TARGET_PATHS = new Set([
  'Order.Header.Currency',
  'Order.Header.Total',
  'Order.Items',
  'Order.Items.Sku',
]);

function entry(overrides: Partial<OutputPathEntry>): OutputPathEntry {
  return {
    runtimePath: 'Order.Header.Currency',
    nodeKind: 'property',
    ...overrides,
  };
}

describe('resolveOutputNodeSelection', () => {
  it('resolves metadata owning rule first', () => {
    const result = resolveOutputNodeSelection({
      runtimePath: 'Order.Header.Currency',
      pathEntry: entry({ owningRuleTargetPath: 'Order.Header.Currency' }),
      rules: RULES,
      targetSchemaPaths: TARGET_PATHS,
    });

    expect(result).toEqual({
      kind: 'rule',
      targetPath: 'Order.Header.Currency',
      ruleIndex: 0,
      resolution: 'metadata-owning-rule',
    });
  });

  it('falls back to normalized exact rule match for runtime path with array indexes', () => {
    const result = resolveOutputNodeSelection({
      runtimePath: 'Order.Items[2]',
      pathEntry: entry({
        runtimePath: 'Order.Items[2]',
        targetSchemaPath: 'Order.Items[2]',
      }),
      rules: RULES,
      targetSchemaPaths: TARGET_PATHS,
    });

    expect(result).toEqual({
      kind: 'rule',
      targetPath: 'Order.Items',
      ruleIndex: 1,
      resolution: 'normalized-exact-rule',
    });
  });

  it('uses longest ancestor rule when no exact rule exists', () => {
    const result = resolveOutputNodeSelection({
      runtimePath: 'Order.Items[0].Sku',
      pathEntry: entry({
        runtimePath: 'Order.Items[0].Sku',
        targetSchemaPath: 'Order.Items[0].Sku',
      }),
      rules: RULES,
      targetSchemaPaths: TARGET_PATHS,
    });

    expect(result).toEqual({
      kind: 'rule',
      targetPath: 'Order.Items',
      ruleIndex: 1,
      resolution: 'ancestor-rule',
    });
  });

  it('returns schema fallback when target exists but no rule exists', () => {
    const result = resolveOutputNodeSelection({
      runtimePath: 'Order.Header.Total',
      pathEntry: entry({
        runtimePath: 'Order.Header.Total',
        targetSchemaPath: 'Order.Header.Total',
      }),
      rules: RULES,
      targetSchemaPaths: TARGET_PATHS,
    });

    expect(result).toEqual({
      kind: 'target-field',
      targetPath: 'Order.Header.Total',
      resolution: 'schema-fallback',
    });
  });

  it('returns unresolvable only when no schema field or rule can be resolved', () => {
    const result = resolveOutputNodeSelection({
      runtimePath: 'Order.Unknown.Path',
      pathEntry: entry({
        runtimePath: 'Order.Unknown.Path',
        targetSchemaPath: 'Order.Unknown.Path',
      }),
      rules: RULES,
      targetSchemaPaths: TARGET_PATHS,
    });

    expect(result).toEqual({
      kind: 'unresolvable',
      reason: 'no-editable-target',
    });
  });
});
