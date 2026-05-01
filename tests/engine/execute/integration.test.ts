import { describe, expect, it } from 'vitest';

import { execute, type MappingConfig } from '../../../src/engine/index.js';

function createConfig(overrides?: Partial<MappingConfig>): MappingConfig {
  return {
    name: 'Execute Integration',
    version: 1,
    engineVersion: '1.1.0',
    sourceSchemaRef: {
      schemaId: 'source-schema',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target-schema',
      type: 'local',
    },
    config: {
      unmappedTargets: 'omit',
      nullSubtrees: [],
      constants: {},
      externalSources: [],
      ...(overrides?.config ?? {}),
    },
    rules: overrides?.rules ?? [],
    ...overrides,
  };
}

const orderTargetSchema = {
  type: 'object',
  properties: {
    Order: {
      type: 'object',
      properties: {
        Type: { type: 'string' },
        Status: { type: 'string' },
        Priority: { type: 'string' },
      },
      required: ['Type', 'Status', 'Priority'],
    },
  },
  required: ['Order'],
};

describe('execute integration', () => {
  it('AE-06: unmappedTargets="null" sets unmapped required fields to null', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'null',
        nullSubtrees: [],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Type',
          type: 'string',
          expression: 'static("PO")',
        },
      ],
    });

    const result = execute(config, {}, {}, orderTargetSchema);

    expect(result.output).toEqual({
      Order: {
        Type: 'PO',
        Status: null,
        Priority: null,
      },
    });
  });

  it('AE-07: unmappedTargets="omit" leaves unmapped fields absent', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Type',
          type: 'string',
          expression: 'static("PO")',
        },
      ],
    });

    const result = execute(config, {}, {}, orderTargetSchema);

    expect(result.output).toEqual({
      Order: {
        Type: 'PO',
      },
    });
    expect((result.output as { Order: Record<string, unknown> }).Order).not.toHaveProperty('Status');
  });

  it('AE-08: unmappedTargets="error" emits W005 for unmapped required fields', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'error',
        nullSubtrees: [],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Type',
          type: 'string',
          expression: 'static("PO")',
        },
      ],
    });

    const result = execute(config, {}, {}, orderTargetSchema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W005')).toBe(true);
    expect(result.output).toEqual({
      Order: {
        Type: 'PO',
      },
    });
  });

  it('AE-09: nullSubtrees overrides rule values', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: ['Order.Header'],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Header.Type',
          type: 'string',
          expression: 'static("PO")',
        },
        {
          target: 'Order.Total',
          type: 'number',
          expression: 'static(100)',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toEqual({
      Order: {
        Header: null,
        Total: 100,
      },
    });
  });

  it('applies nullSubtrees after unmappedTargets', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'null',
        nullSubtrees: ['Order'],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Type',
          type: 'string',
          expression: 'static("PO")',
        },
      ],
    });

    const result = execute(config, {}, {}, orderTargetSchema);

    expect(result.output).toEqual({
      Order: null,
    });
  });

  it('handles nullSubtrees on non-existent paths without diagnostics', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: ['Order.Missing.Path'],
        constants: {},
        externalSources: [],
      },
      rules: [
        {
          target: 'Order.Type',
          type: 'string',
          expression: 'static("PO")',
        },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.output).toMatchObject({
      Order: {
        Type: 'PO',
      },
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-10: trace mode records entries per rule and includes failed rules', () => {
    const config = createConfig({
      rules: [
        {
          target: 'A',
          type: 'string',
          expression: 'static("ok")',
        },
        {
          target: 'B',
          type: 'string',
          expression: 'invalid!!!syntax',
        },
      ],
    });

    const result = execute(config, {}, {}, {}, { trace: true });

    expect(result.trace).toBeDefined();
    expect(result.trace).toHaveLength(2);
    expect(result.trace?.[0]).toMatchObject({
      ruleIndex: 0,
      targetPath: 'A',
      expression: 'static("ok")',
      outputValue: 'ok',
    });
    expect(result.trace?.[1]).toMatchObject({
      ruleIndex: 1,
      targetPath: 'B',
      expression: 'invalid!!!syntax',
      outputValue: null,
    });
    expect(result.trace?.[1]?.diagnostics?.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(
      true,
    );
  });

  it('AE-16: stats match rule outcomes', () => {
    const config = createConfig({
      rules: [
        { target: 'A', type: 'string', expression: 'static("a")' },
        { target: 'B', type: 'string', expression: 'static("b")' },
        { target: 'C', type: 'string', expression: 'invalid!!!syntax' },
        { target: 'D', type: 'string', expression: 'static("d")' },
        { target: 'E', type: 'string', expression: 'static("e")' },
      ],
    });

    const result = execute(config, {}, {}, {});

    expect(result.stats?.rulesEvaluated).toBe(5);
    expect(result.stats?.rulesSucceeded).toBe(4);
    expect(result.stats?.rulesFailed).toBe(1);
    expect(result.stats?.rulesSucceeded).toBe(
      (result.stats?.rulesEvaluated ?? 0) - (result.stats?.rulesFailed ?? 0),
    );
    expect(result.stats?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('AE-17: validateBeforeExecute aborts on validation errors', () => {
    const config = createConfig({
      rules: [
        {
          target: 'output.name',
          type: 'string',
          expression: 'source("nonexistent")',
        },
      ],
    });

    const sourceSchema = {
      type: 'object',
      properties: {
        existing: { type: 'string' },
      },
    };

    const targetSchema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const result = execute(config, {}, sourceSchema, targetSchema, { validateBeforeExecute: true });

    expect(result.output).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E030')).toBe(true);
    expect(result.stats?.rulesEvaluated).toBe(0);
  });

  it('validateBeforeExecute with valid config proceeds normally', () => {
    const config = createConfig({
      rules: [
        {
          target: 'output.name',
          type: 'string',
          expression: 'source("existing")',
        },
      ],
    });

    const sourceSchema = {
      type: 'object',
      properties: {
        existing: { type: 'string' },
      },
    };

    const targetSchema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const result = execute(config, { existing: 'Ada' }, sourceSchema, targetSchema, {
      validateBeforeExecute: true,
    });

    expect(result.output).toEqual({
      output: {
        name: 'Ada',
      },
    });
    expect(result.stats?.rulesEvaluated).toBe(1);
    expect(result.stats?.rulesSucceeded).toBe(1);
  });

  it('AE-18: supports map() and filter()+map() composition', () => {
    const config = createConfig({
      rules: [
        {
          target: 'Names',
          type: 'array',
          expression: 'map(source("items"), item("name"))',
        },
        {
          target: 'ActiveNames',
          type: 'array',
          expression:
            'map(filter(source("items"), eq(item("active"), true)), item("name"))',
        },
      ],
    });

    const sourceData = {
      items: [
        { name: 'A', active: true },
        { name: 'B', active: false },
        { name: 'C', active: true },
      ],
    };

    const result = execute(config, sourceData, {}, {});

    expect(result.output).toEqual({
      Names: ['A', 'B', 'C'],
      ActiveNames: ['A', 'C'],
    });
  });

  it('supports nested map() producing nested arrays', () => {
    const config = createConfig({
      rules: [
        {
          target: 'NestedIds',
          type: 'array',
          expression: 'map(source("groups"), map(item("members"), item("id")))',
        },
      ],
    });

    const sourceData = {
      groups: [
        { members: [{ id: 'a1' }, { id: 'a2' }] },
        { members: [{ id: 'b1' }] },
      ],
    };

    const result = execute(config, sourceData, {}, {});

    expect(result.output).toEqual({
      NestedIds: [
        ['a1', 'a2'],
        ['b1'],
      ],
    });
  });

  it(
    'AE-19: executes 500 simple rules within 2 seconds',
    () => {
      const rules = Array.from({ length: 500 }, (_, index) => ({
        target: `target_${index}`,
        type: 'string' as const,
        expression: `source("field_${index}")`,
      }));

      const config = createConfig({ rules });
      const sourceData: Record<string, unknown> = {};
      for (let index = 0; index < 1000; index += 1) {
        sourceData[`field_${index}`] = `value_${index}`;
      }

      const startedAt = Date.now();
      const result = execute(config, sourceData, {}, {});
      const durationMs = Date.now() - startedAt;

      expect(result.stats?.rulesEvaluated).toBe(500);
      expect(result.stats?.rulesSucceeded).toBe(500);
      expect(result.stats?.rulesFailed).toBe(0);
      expect(durationMs).toBeLessThan(2000);
    },
    10_000,
  );
});
