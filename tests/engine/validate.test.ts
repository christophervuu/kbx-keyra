import { describe, expect, it } from 'vitest';

import {
  validate,
  type CoverageResult,
  type MappingConfig,
  type ValidationResult,
} from '../../src/engine/index.js';
import { buildSchemaTree, getOrBuildSchemaTree } from '../../src/engine/validate/index.js';

function createMinimalConfig(overrides?: Partial<MappingConfig>): MappingConfig {
  return {
    name: 'Minimal Mapping',
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

describe('validate', () => {
  it('returns coverage for empty rules and no required fields', () => {
    const result = validate(createMinimalConfig(), {}, {});

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.coverage).toEqual({
      total: 0,
      mapped: 0,
      percentage: 100,
      unmappedFields: undefined,
    });
  });

  it('marks result invalid when parse error exists and continues processing', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'output.name',
          type: 'string',
          expression: 'source("ok")',
        },
        {
          target: 'output.bad',
          type: 'string',
          expression: 'source("unterminated)',
        },
      ],
    });

    const schema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            bad: { type: 'string' },
          },
          required: ['name', 'bad'],
        },
      },
      required: ['output'],
    };

    const result = validate(config, schema, schema);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleIndex === 1)).toBe(true);
    expect(result.coverage).toEqual({
      total: 2,
      mapped: 2,
      percentage: 100,
      unmappedFields: undefined,
    });
  });

  it('returns valid=true for warning-only diagnostics', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'output.externalValue',
          type: 'string',
          expression: 'external("undeclared")',
        },
      ],
      config: {
        unmappedTargets: 'omit',
        nullSubtrees: [],
        constants: {},
        externalSources: [],
      },
    });

    const schema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            externalValue: { type: 'string' },
          },
        },
      },
    };

    const result = validate(config, schema, schema);

    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E012')).toBe(true);
    expect(result.diagnostics.every((diagnostic) => diagnostic.severity !== 'error')).toBe(true);
    expect(result.valid).toBe(true);
  });

  it('handles null source schema by skipping schema-dependent source checks', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'output.name',
          type: 'string',
          expression: 'source("customer.missing")',
        },
      ],
    });

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

    const result = validate(config, null, targetSchema);

    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E030')).toBeUndefined();
  });

  it('handles null target schema by skipping target path checks and coverage', () => {
    const config = createMinimalConfig({
      rules: [
        {
          target: 'output.missing',
          type: 'string',
          expression: 'source("customer.name")',
        },
      ],
    });

    const sourceSchema = {
      type: 'object',
      properties: {
        customer: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const result = validate(config, sourceSchema, null);

    expect(result.diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E031')).toBeUndefined();
    expect(result.coverage).toBeUndefined();
  });
});

describe('validate/schema-tree exports', () => {
  it('exports buildSchemaTree and getOrBuildSchemaTree', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } };

    const built = buildSchemaTree(schema);
    const cached = getOrBuildSchemaTree(schema);

    expect(built.getTypeAtPath('id')).toBe('string');
    expect(cached.getTypeAtPath('id')).toBe('string');
  });
});

describe('validation result coverage type', () => {
  it('exports CoverageResult from types barrel and allows structured coverage on ValidationResult', () => {
    const coverage: CoverageResult = {
      total: 3,
      mapped: 2,
      percentage: 67,
      unmappedFields: ['output.c'],
    };

    const result: ValidationResult = {
      valid: true,
      diagnostics: [],
      coverage,
    };

    expect(result.coverage).toEqual(coverage);
  });
});
