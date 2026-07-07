import { describe, expect, it } from 'vitest';

import { applySchemaPatches, SchemaPatchError } from '../../../src/lib/schema/patch-engine.js';

describe('schema patch engine', () => {
  it('preserves untouched unsupported subtrees when applying unrelated set patch', () => {
    const original = {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      allOf: [
        {
          properties: {
            legacy: { type: 'string' },
          },
        },
      ],
    } as const;

    const result = applySchemaPatches({
      content: original as unknown as Record<string, unknown>,
      patches: [
        {
          op: 'set',
          pointer: '/properties/id/description',
          value: 'Primary identifier',
        },
      ],
    });

    expect(result.content).toMatchObject({
      allOf: original.allOf,
      properties: {
        id: {
          type: 'string',
          description: 'Primary identifier',
        },
      },
    });
  });

  it('throws deterministic unsupported error for restricted keyword targets', () => {
    expect(() => applySchemaPatches({
      content: {
        type: 'object',
        allOf: [],
      },
      patches: [
        {
          op: 'set',
          pointer: '/allOf/0',
          value: { type: 'string' },
        },
      ],
    })).toThrowError(SchemaPatchError);

    expect(() => applySchemaPatches({
      content: {
        type: 'object',
        allOf: [],
      },
      patches: [
        {
          op: 'set',
          pointer: '/allOf/0',
          value: { type: 'string' },
        },
      ],
    })).toThrow(/Unsupported schema patch operation/);
  });

  it('blocks addField invalid input before mutation', () => {
    expect(() => applySchemaPatches({
      content: {
        type: 'object',
        properties: {},
      },
      patches: [
        {
          op: 'addField',
          parentPointer: '',
          fieldName: '1-invalid',
          fieldSchema: { type: 'string' },
        },
      ],
    })).toThrow(/Invalid fieldName/);
  });

  it('requires changeSummary for destructive remove operations', () => {
    expect(() => applySchemaPatches({
      content: {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
      },
      patches: [
        {
          op: 'remove',
          pointer: '/properties/status',
        },
      ],
    })).toThrow(/require non-empty changeSummary/i);
  });
});
