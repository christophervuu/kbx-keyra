import { describe, expect, it } from 'vitest';

import type { MappingRule } from '../../../src/engine/types/index.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import { computeCoverage } from '../../../src/engine/validate/coverage.js';

function createRule(target: string, expression = 'source("x")'): MappingRule {
  return {
    target,
    type: 'string',
    expression,
  };
}

describe('computeCoverage', () => {
  it('all required fields mapped -> 100% and no unmapped list', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            c: { type: 'string' },
          },
          required: ['a', 'b', 'c'],
        },
      },
      required: ['output'],
    });

    const rules = [createRule('output.a'), createRule('output.b'), createRule('output.c')];

    const coverage = computeCoverage(rules, schema);

    expect(coverage).toEqual({
      total: 3,
      mapped: 3,
      percentage: 100,
      unmappedFields: undefined,
    });
  });

  it('partial mapping -> correct percentage and unmapped list', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            c: { type: 'string' },
            d: { type: 'string' },
          },
          required: ['a', 'b', 'c', 'd'],
        },
      },
      required: ['output'],
    });

    const rules = [createRule('output.a'), createRule('output.c')];

    const coverage = computeCoverage(rules, schema);

    expect(coverage.total).toBe(4);
    expect(coverage.mapped).toBe(2);
    expect(coverage.percentage).toBe(50);
    expect(coverage.unmappedFields).toEqual(['output.b', 'output.d']);
  });

  it('no required fields -> vacuous 100%', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: {
            optionalField: { type: 'string' },
          },
        },
      },
    });

    const coverage = computeCoverage([], schema);

    expect(coverage).toEqual({
      total: 0,
      mapped: 0,
      percentage: 100,
      unmappedFields: undefined,
    });
  });

  it('empty rules with required fields -> 0% and full unmapped list', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        out: {
          type: 'object',
          properties: {
            x: { type: 'string' },
            y: { type: 'string' },
          },
          required: ['x', 'y'],
        },
      },
      required: ['out'],
    });

    const coverage = computeCoverage([], schema);

    expect(coverage.total).toBe(2);
    expect(coverage.mapped).toBe(0);
    expect(coverage.percentage).toBe(0);
    expect(coverage.unmappedFields).toEqual(['out.x', 'out.y']);
  });

  it('rules targeting non-required or non-existent fields do not count for required coverage', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        out: {
          type: 'object',
          properties: {
            requiredA: { type: 'string' },
            optionalB: { type: 'string' },
          },
          required: ['requiredA'],
        },
      },
      required: ['out'],
    });

    const rules = [createRule('out.optionalB'), createRule('out.nonexistent')];

    const coverage = computeCoverage(rules, schema);

    expect(coverage.total).toBe(1);
    expect(coverage.mapped).toBe(0);
    expect(coverage.percentage).toBe(0);
    expect(coverage.unmappedFields).toEqual(['out.requiredA']);
  });

  it('rounds percentage to nearest integer', () => {
    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        out: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            c: { type: 'string' },
          },
          required: ['a', 'b', 'c'],
        },
      },
      required: ['out'],
    });

    const rules = [createRule('out.a'), createRule('out.b')];

    const coverage = computeCoverage(rules, schema);

    // 2 / 3 = 66.666... => rounded 67
    expect(coverage.percentage).toBe(67);
  });

  it('large schema computes correctly', () => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const rules: MappingRule[] = [];

    for (let i = 1; i <= 120; i += 1) {
      const field = `f${i}`;
      properties[field] = { type: 'string' };
      required.push(field);

      if (i % 3 === 0) {
        rules.push(createRule(`out.${field}`));
      }
    }

    const schema = buildSchemaTree({
      type: 'object',
      properties: {
        out: {
          type: 'object',
          properties,
          required,
        },
      },
      required: ['out'],
    });

    const coverage = computeCoverage(rules, schema);

    expect(coverage.total).toBe(120);
    expect(coverage.mapped).toBe(40);
    expect(coverage.percentage).toBe(33);
    expect(coverage.unmappedFields?.length).toBe(80);
  });
});
