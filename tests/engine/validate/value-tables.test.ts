import { describe, expect, it } from 'vitest';

import type { MappingConfig, MappingRuleProjectValueTableRef } from '../../../src/engine/types/index.js';
import { validate } from '../../../src/engine/validate.js';

function createRef(overrides?: Partial<MappingRuleProjectValueTableRef>): MappingRuleProjectValueTableRef {
  return {
    scope: 'project',
    valueTableId: 'vt_123',
    tableKey: 'order-status',
    revision: 2,
    inputSideKey: 'oms-status',
    outputSideKey: 'cdm-status',
    inputType: 'string',
    outputType: 'string',
    resolvedEntries: [
      { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
      { in: 'shipped', out: 'COMPLETE', rowId: 'r2' },
    ],
    ...overrides,
  };
}

function createConfig(refOverrides?: Partial<MappingRuleProjectValueTableRef>): MappingConfig {
  return {
    name: 'Value Table Test',
    version: 1,
    engineVersion: '1.1.0',
    sourceSchemaRef: { schemaId: 'src', type: 'local' },
    targetSchemaRef: { schemaId: 'tgt', type: 'local' },
    config: {
      unmappedTargets: 'omit',
      nullSubtrees: [],
      constants: {},
      externalSources: [],
    },
    rules: [
      {
        target: 'output.status',
        type: 'string',
        expression:
          'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN")',
        valueTableRef: createRef(refOverrides),
      },
    ],
  };
}

const sourceSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
  },
};

const targetSchema = {
  type: 'object',
  properties: {
    output: {
      type: 'object',
      properties: {
        status: { type: 'string' },
      },
    },
  },
};

describe('validate() value table semantics', () => {
  it('accepts valueMap(..., valueTable(...), fallback) with valid pinned ref', () => {
    const result = validate(createConfig(), sourceSchema, targetSchema);

    const valueTableDiagnostics = result.diagnostics.filter((d) => d.code.startsWith('KEYRA-E06'));
    expect(valueTableDiagnostics).toEqual([]);
  });

  it('emits E061 for invalid table key format', () => {
    const result = validate(createConfig({ tableKey: 'Order Status' }), sourceSchema, targetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E061')).toBe(true);
  });

  it('emits E062 when resolved entries are missing', () => {
    const result = validate(createConfig({ resolvedEntries: [] }), sourceSchema, targetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E062')).toBe(true);
  });

  it('emits E063 when same side is used for input/output', () => {
    const result = validate(
      createConfig({ inputSideKey: 'same', outputSideKey: 'same' }),
      sourceSchema,
      targetSchema,
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E063')).toBe(true);
  });

  it('emits E065 when duplicate input-side values exist', () => {
    const result = validate(
      createConfig({
        resolvedEntries: [
          { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
          { in: 'confirmed', out: 'COMPLETE', rowId: 'r2' },
        ],
      }),
      sourceSchema,
      targetSchema,
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E065')).toBe(true);
  });

  it('emits E065 when ignore-case mode causes normalized collisions', () => {
    const result = validate(
      createConfig({
        matchMode: 'ignore-case',
        resolvedEntries: [
          { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
          { in: 'CONFIRMED', out: 'COMPLETE', rowId: 'r2' },
        ],
      }),
      sourceSchema,
      targetSchema,
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E065')).toBe(true);
  });

  it('does not emit E065 for case-only differences under exact mode', () => {
    const result = validate(
      createConfig({
        matchMode: 'exact',
        resolvedEntries: [
          { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
          { in: 'CONFIRMED', out: 'COMPLETE', rowId: 'r2' },
        ],
      }),
      sourceSchema,
      targetSchema,
    );

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E065')).toBe(false);
  });

  it('emits E068 when valueMap match mode argument is invalid', () => {
    const base = createConfig();
    const [firstRule] = base.rules;
    if (!firstRule) {
      throw new Error('Expected one rule in base config');
    }

    const config: MappingConfig = {
      ...base,
      rules: [
        {
          ...firstRule,
          expression:
            'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN", "fuzzy")',
        },
      ],
    };

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E068')).toBe(true);
  });

  it('accepts valueMap match mode argument when valid', () => {
    const base = createConfig();
    const [firstRule] = base.rules;
    if (!firstRule) {
      throw new Error('Expected one rule in base config');
    }

    const config: MappingConfig = {
      ...base,
      rules: [
        {
          ...firstRule,
          expression:
            'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN", "ignore-case")',
        },
      ],
    };

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E068')).toBe(false);
  });

  it('emits E067 for fallback_value type mismatch', () => {
    const base = createConfig();
    const [firstRule] = base.rules;
    if (!firstRule) {
      throw new Error('Expected one rule in base config');
    }

    const config: MappingConfig = {
      ...base,
      rules: [
        {
          ...firstRule,
          noMatchBehavior: {
            mode: 'fallback_value',
            fallbackValue: 123,
          },
        },
      ],
    };

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E067')).toBe(true);
  });

  it('emits diagnostics with stable rule/path/expression context for project table errors', () => {
    const result = validate(
      createConfig({
        inputSideKey: 'same',
        outputSideKey: 'same',
      }),
      sourceSchema,
      targetSchema,
    );

    const diagnostic = result.diagnostics.find((entry) => entry.code === 'KEYRA-E063');
    expect(diagnostic).toEqual(
      expect.objectContaining({
        code: 'KEYRA-E063',
        ruleIndex: 0,
        targetPath: 'output.status',
        expression:
          'valueMap(source("status"), valueTable("order-status", "oms-status", "cdm-status"), "UNKNOWN")',
        location: expect.objectContaining({ function: 'valueTable' }),
      }),
    );
  });
});
