import { describe, expect, it } from 'vitest';

import { parse } from '../../../src/engine/dsl/index.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { defaultRegistry } from '../../../src/engine/registry/function-registry.js';
import type { MappingConfigBlock, MappingRule } from '../../../src/engine/types/index.js';
import type { ParsedRuleAst } from '../../../src/engine/validate/source-paths.js';
import { validateConstantsAndExternals } from '../../../src/engine/validate/constants-externals.js';

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

function createConfig(overrides?: Partial<MappingConfigBlock>): MappingConfigBlock {
  return {
    unmappedTargets: 'omit',
    nullSubtrees: [],
    constants: {},
    externalSources: [],
    ...overrides,
  };
}

describe('validateConstantsAndExternals', () => {
  registerAllFunctions(defaultRegistry);

  it('constant("EXISTING") with declared key produces no diagnostic', () => {
    const config = createConfig({
      constants: {
        EXISTING: 'value',
      },
    });

    const rules = [parseRule(createRule('output.a', 'constant("EXISTING")'), 0)];
    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toEqual([]);
  });

  it('constant("MISSING") emits E011 error', () => {
    const config = createConfig({ constants: {} });
    const rules = [parseRule(createRule('output.a', 'constant("MISSING")'), 1)];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E011',
      severity: 'error',
      ruleIndex: 1,
      targetPath: 'output.a',
    });
    expect(diagnostics[0]?.message).toContain('MISSING');
  });

  it('constant with zero/null/empty-string values are treated as declared', () => {
    const config = createConfig({
      constants: {
        ZERO_VALUE: 0,
        NULL_VALUE: null,
        EMPTY_VALUE: '',
        FALSE_VALUE: false,
      },
    });

    const rules = [
      parseRule(createRule('output.zero', 'constant("ZERO_VALUE")'), 0),
      parseRule(createRule('output.null', 'constant("NULL_VALUE")'), 1),
      parseRule(createRule('output.empty', 'constant("EMPTY_VALUE")'), 2),
      parseRule(createRule('output.false', 'constant("FALSE_VALUE")'), 3),
    ];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toEqual([]);
  });

  it('external("declared") in externalSources produces no diagnostic', () => {
    const config = createConfig({ externalSources: ['pricing'] });
    const rules = [parseRule(createRule('output.p', 'external("pricing")'), 0)];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toEqual([]);
  });

  it('external("undeclared") emits E012 warning', () => {
    const config = createConfig({ externalSources: ['pricing'] });
    const rules = [parseRule(createRule('output.p', 'external("inventory")'), 2)];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E012',
      severity: 'warning',
      ruleIndex: 2,
      targetPath: 'output.p',
    });
    expect(diagnostics[0]?.message).toContain('inventory');
  });

  it('mixes valid and invalid constant/external calls and reports each invalid one', () => {
    const config = createConfig({
      constants: { TAX_RATE: 0.1 },
      externalSources: ['pricing'],
    });

    const rules = [
      parseRule(
        createRule(
          'output.mix',
          'concat(cast(constant("TAX_RATE"), "string"), cast(constant("MISSING"), "string"), cast(external("inventory"), "string"), cast(external("pricing"), "string"))',
        ),
        4,
      ),
    ];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.code).sort()).toEqual(['KEYRA-E011', 'KEYRA-E012']);
  });

  it('skips non-literal constant/external arguments', () => {
    const config = createConfig({ constants: {}, externalSources: [] });

    const rules = [
      parseRule(createRule('output.c', 'constant(concat("A", "B"))'), 0),
      parseRule(createRule('output.e', 'external(concat("x", "y"))'), 1),
    ];

    const diagnostics = validateConstantsAndExternals(rules, config);

    expect(diagnostics).toEqual([]);
  });

  it('skips rules with null AST (parse failure)', () => {
    const config = createConfig({ constants: {}, externalSources: [] });

    const validRule = parseRule(createRule('output.ok', 'constant("EXISTING")'), 0);
    const brokenRule = parseRule(createRule('output.bad', 'constant("BROKEN"'), 1);

    const diagnostics = validateConstantsAndExternals([validRule, brokenRule], config);

    expect(brokenRule.ast).toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('KEYRA-E011');
  });
});
