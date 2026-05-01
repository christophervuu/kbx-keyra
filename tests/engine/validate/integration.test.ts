import { describe, expect, it } from 'vitest';

import { validate, type MappingConfig } from '../../../src/engine/index.js';

function createConfig(overrides?: Partial<MappingConfig>): MappingConfig {
  return {
    name: 'Integration Config',
    version: 1,
    engineVersion: '1.1.0',
    sourceSchemaRef: {
      schemaId: 'source',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target',
      type: 'local',
    },
    config: {
      unmappedTargets: 'omit',
      nullSubtrees: [],
      constants: {
        TAX_RATE: 0.1,
      },
      externalSources: ['pricing'],
      ...(overrides?.config ?? {}),
    },
    rules: overrides?.rules ?? [],
    ...overrides,
  };
}

const sourceSchema = {
  type: 'object',
  properties: {
    customer: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        age: { type: 'number' },
        id: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            nested: { type: 'string' },
          },
        },
      },
      required: ['firstName', 'age', 'id'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          id: { type: 'string' },
        },
      },
    },
    departments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          deptName: { type: 'string' },
          employees: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const targetSchema = {
  type: 'object',
  properties: {
    output: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        ageLabel: { type: 'string' },
        names: { type: 'array', items: { type: 'string' } },
        filteredItems: { type: 'array', items: { type: 'object' } },
        parentNames: { type: 'array', items: { type: 'string' } },
        payload: { type: 'object' },
        taxRate: { type: 'number' },
        externalValue: { type: 'string' },
      },
      required: ['name', 'ageLabel', 'names'],
    },
  },
  required: ['output'],
};

describe('validate() full integration', () => {
  it('happy path: valid rules produce valid=true and 100% coverage', () => {
    const config = createConfig({
      rules: [
        { target: 'output.name', type: 'string', expression: 'source("customer.firstName")' },
        {
          target: 'output.ageLabel',
          type: 'string',
          expression: 'cast(source("customer.age"), "string")',
        },
        { target: 'output.names', type: 'array', expression: 'map(source("items"), item("name"))' },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.coverage).toEqual({
      total: 3,
      mapped: 3,
      percentage: 100,
      unmappedFields: undefined,
    });
  });

  it('path validation integration: invalid source and target both produce diagnostics', () => {
    const config = createConfig({
      rules: [
        { target: 'output.missingTarget', type: 'string', expression: 'source("customer.firstName")' },
        { target: 'output.name', type: 'string', expression: 'source("customer.middleName")' },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E030')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E031')).toBe(true);
  });

  it('type compatibility integration: mismatch emits E005, cast avoids it', () => {
    const badConfig = createConfig({
      rules: [
        { target: 'output.ageLabel', type: 'number', expression: 'source("customer.age")' },
      ],
    });

    const goodConfig = createConfig({
      rules: [
        {
          target: 'output.ageLabel',
          type: 'string',
          expression: 'cast(source("customer.age"), "string")',
        },
      ],
    });

    const badResult = validate(badConfig, sourceSchema, targetSchema);
    const goodResult = validate(goodConfig, sourceSchema, targetSchema);

    expect(badResult.diagnostics.some((d) => d.code === 'KEYRA-E005')).toBe(true);
    expect(goodResult.diagnostics.some((d) => d.code === 'KEYRA-E005')).toBe(false);
  });

  it('array context integration: E010/E013/E017 emitted correctly', () => {
    const config = createConfig({
      rules: [
        { target: 'output.name', type: 'string', expression: 'item("name")' },
        { target: 'output.names', type: 'array', expression: 'map(source("items"), parent("name"))' },
        {
          target: 'output.filteredItems',
          type: 'array',
          expression: 'filter(source("items"), item("name"))',
        },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E010')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E013')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E017')).toBe(true);
  });

  it('array context integration: valid nested parent and boolean conditions produce no E013/E017', () => {
    const config = createConfig({
      rules: [
        {
          target: 'output.parentNames',
          type: 'array',
          expression:
            'map(source("departments"), map(item("employees"), parent("deptName")))',
        },
        {
          target: 'output.filteredItems',
          type: 'array',
          expression: 'filter(source("items"), gt(item("price"), 100))',
        },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E013')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E017')).toBe(false);
  });

  it('reference validation integration: missing constant is error, missing external is warning', () => {
    const config = createConfig({
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: { TAX_RATE: 0.1 },
        externalSources: ['pricing'],
      },
      rules: [
        { target: 'output.taxRate', type: 'number', expression: 'constant("MISSING")' },
        { target: 'output.externalValue', type: 'string', expression: 'external("inventory")' },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E011')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E012')).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('coverage integration: partial mapping and empty rules cases', () => {
    const partialConfig = createConfig({
      rules: [{ target: 'output.name', type: 'string', expression: 'source("customer.firstName")' }],
    });

    const emptyConfig = createConfig({ rules: [] });

    const partialResult = validate(partialConfig, sourceSchema, targetSchema);
    const emptyResult = validate(emptyConfig, sourceSchema, targetSchema);

    expect(partialResult.coverage).toEqual({
      total: 3,
      mapped: 1,
      percentage: 33,
      unmappedFields: ['output.ageLabel', 'output.names'],
    });

    expect(emptyResult.coverage).toEqual({
      total: 3,
      mapped: 0,
      percentage: 0,
      unmappedFields: ['output.name', 'output.ageLabel', 'output.names'],
    });
  });

  it('duplicate target integration: warning only keeps valid true', () => {
    const config = createConfig({
      rules: [
        { target: 'output.name', type: 'string', expression: 'source("customer.firstName")' },
        { target: 'output.name', type: 'string', expression: 'source("customer.id")' },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((d) => d.code === 'KEYRA-W006')).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('mixed config integration: parse errors do not halt remaining rules', () => {
    const config = createConfig({
      rules: [
        { target: 'output.name', type: 'string', expression: 'source("customer.firstName")' },
        { target: 'output.ageLabel', type: 'string', expression: 'source("customer.age"' }, // parse error
        { target: 'output.names', type: 'array', expression: 'map(source("items"), item("name"))' },
      ],
    });

    const result = validate(config, sourceSchema, targetSchema);

    expect(result.diagnostics.some((d) => d.code === 'KEYRA-E001' && d.ruleIndex === 1)).toBe(true);
    expect(result.coverage).toEqual({
      total: 3,
      mapped: 3,
      percentage: 100,
      unmappedFields: undefined,
    });
    expect(result.valid).toBe(false);
  });

  it('public API import path works and validate is callable from engine index', () => {
    const config = createConfig({ rules: [] });
    const result = validate(config, sourceSchema, targetSchema);

    expect(typeof validate).toBe('function');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('diagnostics');
  });

  it('performance: validates 500 rules against 1000+ fields in under 2 seconds', () => {
    const largeSourceProperties: Record<string, unknown> = {};
    const largeTargetProperties: Record<string, unknown> = {};
    const required: string[] = [];

    for (let i = 0; i < 1000; i += 1) {
      const field = `f${i}`;
      largeSourceProperties[field] = { type: 'string' };
      largeTargetProperties[field] = { type: 'string' };
      if (i < 500) {
        required.push(field);
      }
    }

    const largeSourceSchema = {
      type: 'object',
      properties: {
        src: {
          type: 'object',
          properties: largeSourceProperties,
        },
      },
    };

    const largeTargetSchema = {
      type: 'object',
      properties: {
        out: {
          type: 'object',
          properties: largeTargetProperties,
          required,
        },
      },
      required: ['out'],
    };

    const rules = Array.from({ length: 500 }, (_, index) => ({
      target: `out.f${index}`,
      type: 'string' as const,
      expression: index % 3 === 0 ? `source("src.f${index}")` : `cast(source("src.f${index}"), "string")`,
    }));

    const config = createConfig({ rules });

    const startedAt = performance.now();
    const result = validate(config, largeSourceSchema, largeTargetSchema);
    const elapsedMs = performance.now() - startedAt;

    expect(result.coverage?.total).toBe(500);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
