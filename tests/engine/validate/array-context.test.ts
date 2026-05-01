import { describe, expect, it } from 'vitest';

import { parse } from '../../../src/engine/dsl/index.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { defaultRegistry } from '../../../src/engine/registry/function-registry.js';
import type { MappingRule } from '../../../src/engine/types/index.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import { validateArrayContext } from '../../../src/engine/validate/array-context.js';
import type { ParsedRuleAst } from '../../../src/engine/validate/source-paths.js';

function createRule(target: string, expression: string): MappingRule {
  return {
    target,
    type: 'string',
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

describe('validateArrayContext', () => {
  registerAllFunctions(defaultRegistry);

  const sourceSchema = buildSchemaTree({
    type: 'object',
    properties: {
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
  });

  it('item() at top level emits E010', () => {
    const rules = [parseRule(createRule('output.name', 'item("name")'), 0)];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E010',
      severity: 'error',
      ruleIndex: 0,
      targetPath: 'output.name',
    });
  });

  it('item() inside map() template is valid', () => {
    const rules = [
      parseRule(createRule('output.names', 'map(source("items"), item("name"))'), 0),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBeUndefined();
  });

  it('parent() at top level emits E013', () => {
    const rules = [parseRule(createRule('output.p', 'parent("x")'), 0)];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('KEYRA-E013');
  });

  it('parent() inside single-level map emits E013', () => {
    const rules = [
      parseRule(createRule('output.values', 'map(source("items"), parent("name"))'), 0),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E013')).toBe(true);
  });

  it('parent() inside nested map is valid', () => {
    const rules = [
      parseRule(
        createRule(
          'output.nested',
          'map(source("departments"), map(item("employees"), parent("deptName")))',
        ),
        0,
      ),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E013')).toBeUndefined();
  });

  it('filter condition with non-boolean inferred type emits E017', () => {
    const rules = [
      parseRule(createRule('output.filtered', 'filter(source("items"), item("name"))'), 0),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBe(true);
  });

  it('filter condition with boolean inferred type is valid', () => {
    const rules = [
      parseRule(
        createRule('output.filtered', 'filter(source("items"), gt(item("price"), 100))'),
        0,
      ),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBeUndefined();
  });

  it('find condition with boolean inferred type is valid', () => {
    const rules = [
      parseRule(createRule('output.found', 'find(source("items"), eq(item("id"), "x"))'), 0),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    expect(diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBeUndefined();
  });

  it('reports multiple violations from one expression', () => {
    const rules = [
      parseRule(
        createRule('output.multi', 'concat(item("name"), parent("x"), filter(source("items"), item("name")))'),
        2,
      ),
    ];

    const diagnostics = validateArrayContext(rules, defaultRegistry, sourceSchema);

    const codes = diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes.filter((code) => code === 'KEYRA-E010').length).toBeGreaterThanOrEqual(1);
    expect(codes.filter((code) => code === 'KEYRA-E013').length).toBeGreaterThanOrEqual(1);
    expect(codes.filter((code) => code === 'KEYRA-E017').length).toBeGreaterThanOrEqual(1);
  });

  it('skips rule with null AST', () => {
    const validRule = parseRule(createRule('output.name', 'source("items")'), 0);
    const badRule = parseRule(createRule('output.bad', 'map(source("items"), item("name")'), 1);

    const diagnostics = validateArrayContext([validRule, badRule], defaultRegistry, sourceSchema);

    expect(badRule.ast).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});
