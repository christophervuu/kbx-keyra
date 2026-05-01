import { describe, expect, it } from 'vitest';

import { parse } from '../../../src/engine/dsl/index.js';
import { defaultRegistry } from '../../../src/engine/registry/function-registry.js';
import type { MappingRule } from '../../../src/engine/types/index.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import { validateSourcePaths, type ParsedRuleAst } from '../../../src/engine/validate/source-paths.js';

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

describe('validateSourcePaths', () => {
  const sourceSchema = buildSchemaTree({
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
      a: { type: 'string' },
    },
  });

  it('produces no diagnostic for valid source path', () => {
    const rule = createRule('output.name', 'source("customer.firstName")');

    const diagnostics = validateSourcePaths([parseRule(rule, 0)], sourceSchema);

    expect(diagnostics).toEqual([]);
  });

  it('produces E030 for invalid source path with correct metadata', () => {
    const rule = createRule('output.middle', 'source("customer.middleName")');

    const diagnostics = validateSourcePaths([parseRule(rule, 2)], sourceSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E030',
      severity: 'error',
      ruleIndex: 2,
      targetPath: 'output.middle',
      expression: 'source("customer.middleName")',
    });
    expect(diagnostics[0]?.message).toContain('customer.middleName');
  });

  it('handles multiple source() calls in one expression independently', () => {
    const rule = createRule(
      'output.full',
      'concat(source("customer.firstName"), source("customer.middleName"))',
    );

    const diagnostics = validateSourcePaths([parseRule(rule, 0)], sourceSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('KEYRA-E030');
    expect(diagnostics[0]?.message).toContain('customer.middleName');
  });

  it('treats source("") as valid root path', () => {
    const rule = createRule('output.root', 'source("")');

    const diagnostics = validateSourcePaths([parseRule(rule, 0)], sourceSchema);

    expect(diagnostics).toEqual([]);
  });

  it('skips non-literal source argument checks', () => {
    const rule = createRule('output.dynamic', 'source(concat("customer.", "firstName"))');

    const diagnostics = validateSourcePaths([parseRule(rule, 0)], sourceSchema);

    expect(diagnostics).toEqual([]);
  });

  it('checks nested source() calls under object templates and function arguments', () => {
    const rule = createRule(
      'output.obj',
      '{"name": source("customer.firstName"), "missing": source("customer.missing")}',
    );

    const diagnostics = validateSourcePaths([parseRule(rule, 1)], sourceSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('KEYRA-E030');
    expect(diagnostics[0]?.ruleIndex).toBe(1);
    expect(diagnostics[0]?.targetPath).toBe('output.obj');
  });

  it('skips rules with null AST (parse failure)', () => {
    const goodRule = createRule('output.good', 'source("customer.firstName")');
    const badRule = createRule('output.bad', 'source("customer.firstName"');

    const parsedRules: ParsedRuleAst[] = [parseRule(goodRule, 0), parseRule(badRule, 1)];

    const diagnostics = validateSourcePaths(parsedRules, sourceSchema);

    expect(parsedRules[1]?.ast).toBeNull();
    expect(diagnostics).toEqual([]);
  });
});
