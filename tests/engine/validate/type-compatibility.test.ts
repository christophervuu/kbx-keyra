import { describe, expect, it } from 'vitest';

import { parse } from '../../../src/engine/dsl/index.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { defaultRegistry } from '../../../src/engine/registry/function-registry.js';
import type { MappingRule } from '../../../src/engine/types/index.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import type { ParsedRuleAst } from '../../../src/engine/validate/source-paths.js';
import { validateTypeCompatibility } from '../../../src/engine/validate/type-compatibility.js';

function createRule(
  target: string,
  expression: string,
  type: MappingRule['type'] = 'string',
): MappingRule {
  return {
    target,
    type,
    expression,
  };
}

function parseRule(rule: MappingRule, ruleIndex: number): ParsedRuleAst {
  const parsed = parse(rule.expression, { registry: defaultRegistry });

  return {
    ruleIndex,
    rule,
    ast: parsed.ast,
  };
}

describe('validateTypeCompatibility', () => {
  registerAllFunctions(defaultRegistry);

  const sourceSchema = buildSchemaTree({
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          maybe: { type: 'null' },
          opaque: { type: 'object' },
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    },
  });

  const targetSchema = buildSchemaTree({
    type: 'object',
    properties: {
      output: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ageLabel: { type: 'string' },
          names: { type: 'array', items: { type: 'string' } },
          payload: { type: 'object' },
          maybeAnything: { type: 'string' },
        },
      },
    },
  });

  it('no diagnostic when inferred and target types match (string -> string)', () => {
    const parsedRules = [parseRule(createRule('output.name', 'source("customer.name")', 'string'), 0)];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('emits E005 when inferred output type mismatches target type', () => {
    const parsedRules = [
      parseRule(createRule('output.ageLabel', 'source("customer.age")', 'number'), 1),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E005',
      severity: 'error',
      ruleIndex: 1,
      targetPath: 'output.ageLabel',
    });
    expect(diagnostics[0]?.message).toContain('number');
    expect(diagnostics[0]?.message).toContain('string');
  });

  it('no diagnostic when cast() produces compatible type', () => {
    const parsedRules = [
      parseRule(
        createRule('output.ageLabel', 'cast(source("customer.age"), "string")', 'string'),
        0,
      ),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('skips gracefully when target type is unknown (path missing in schema)', () => {
    const parsedRules = [
      parseRule(createRule('output.missing', 'source("customer.name")', 'string'), 0),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('no diagnostic when both sides are unknown/any (inference cannot determine)', () => {
    const parsedRules = [
      parseRule(createRule('output.payload', 'default(source("customer.opaque"), null)', 'object'), 0),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('no diagnostic for array-producing rule targeting array field', () => {
    const parsedRules = [
      parseRule(
        createRule('output.names', 'map(source("items"), item("name"))', 'array'),
        0,
      ),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('emits E005 when scalar rule targets array field', () => {
    const parsedRules = [
      parseRule(createRule('output.names', 'source("customer.name")', 'string'), 2),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E005',
      ruleIndex: 2,
      targetPath: 'output.names',
    });
    expect(diagnostics[0]?.message).toContain('string');
    expect(diagnostics[0]?.message).toContain('array');
  });

  it('treats null output as universally compatible', () => {
    const parsedRules = [
      parseRule(createRule('output.maybeAnything', 'null', 'string'), 0),
      parseRule(createRule('output.names', 'null', 'array'), 1),
    ];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(diagnostics).toEqual([]);
  });

  it('skips rules with null AST', () => {
    const goodRule = createRule('output.name', 'source("customer.name")', 'string');
    const badRule = createRule('output.ageLabel', 'source("customer.age"', 'number');
    const parsedRules: ParsedRuleAst[] = [parseRule(goodRule, 0), parseRule(badRule, 1)];

    const diagnostics = validateTypeCompatibility(
      parsedRules,
      sourceSchema,
      targetSchema,
      defaultRegistry,
    );

    expect(parsedRules[1]?.ast).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});
