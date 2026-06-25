import { describe, expect, it } from 'vitest';

import { buildRenderableOutput } from './renderable-output';

describe('buildRenderableOutput', () => {
  it('builds JSON renderable output with serialized text and metadata', () => {
    const output = {
      name: 'Alice',
      active: true,
      tags: ['vip', 'beta'],
      profile: {
        age: 30,
      },
    };

    const renderable = buildRenderableOutput(output);

    expect(renderable.format).toBe('json');
    expect(renderable.value).toEqual(output);
    expect(renderable.serializedText).toBe(JSON.stringify(output, null, 2));
    expect(renderable.nodeCount).toBeGreaterThan(0);
    expect(renderable.serializedSizeBytes).toBeGreaterThan(0);
  });

  it('builds path index entries for properties and array items', () => {
    const output = {
      order: {
        id: 'o-1',
        lines: [{ sku: 'A' }, { sku: 'B' }],
      },
    };

    const renderable = buildRenderableOutput(output);

    expect(renderable.pathIndex['order']).toEqual({
      runtimePath: 'order',
      targetSchemaPath: 'order',
      owningRuleTargetPath: 'order',
      nodeKind: 'property',
    });

    expect(renderable.pathIndex['order.id']).toEqual({
      runtimePath: 'order.id',
      targetSchemaPath: 'order.id',
      owningRuleTargetPath: 'order.id',
      nodeKind: 'property',
    });

    expect(renderable.pathIndex['order.lines[0]']).toEqual({
      runtimePath: 'order.lines[0]',
      targetSchemaPath: 'order.lines[0]',
      owningRuleTargetPath: 'order.lines',
      nodeKind: 'array-item',
    });

    expect(renderable.pathIndex['order.lines[1].sku']).toEqual({
      runtimePath: 'order.lines[1].sku',
      targetSchemaPath: 'order.lines[1].sku',
      owningRuleTargetPath: 'order.lines[1].sku',
      nodeKind: 'property',
    });
  });
});
