import { describe, expect, it } from 'vitest';

import type { MappingRule } from '../../../src/engine/types/index.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import {
  detectDuplicateTargets,
  validateTargetPaths,
} from '../../../src/engine/validate/target-paths.js';

function createRule(target: string, expression = 'source("customer.name")'): MappingRule {
  return {
    target,
    type: 'string',
    expression,
  };
}

describe('validateTargetPaths', () => {
  const targetSchema = buildSchemaTree({
    type: 'object',
    properties: {
      output: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      },
    },
  });

  it('produces no diagnostics for valid target paths', () => {
    const rules = [
      createRule('output.name'),
      createRule('output.age', 'source("customer.age")'),
    ];

    const diagnostics = validateTargetPaths(rules, targetSchema);

    expect(diagnostics).toEqual([]);
  });

  it('produces E031 for invalid target path with correct metadata', () => {
    const rules = [createRule('output.nonexistent')];

    const diagnostics = validateTargetPaths(rules, targetSchema);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-E031',
      severity: 'error',
      ruleIndex: 0,
      targetPath: 'output.nonexistent',
      expression: 'source("customer.name")',
    });
    expect(diagnostics[0]?.message).toContain('output.nonexistent');
  });

  it('produces one E031 per invalid rule', () => {
    const rules = [
      createRule('output.missingA'),
      createRule('output.name'),
      createRule('output.missingB'),
    ];

    const diagnostics = validateTargetPaths(rules, targetSchema);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.code)).toEqual(['KEYRA-E031', 'KEYRA-E031']);
    expect(diagnostics.map((d) => d.ruleIndex)).toEqual([0, 2]);
  });

  it('returns empty diagnostics for empty rules array', () => {
    expect(validateTargetPaths([], targetSchema)).toEqual([]);
  });
});

describe('detectDuplicateTargets', () => {
  it('returns no diagnostics when there are no duplicates', () => {
    const rules = [createRule('output.name'), createRule('output.age')];

    expect(detectDuplicateTargets(rules)).toEqual([]);
  });

  it('returns KEYRA-W006 warning for second rule when target duplicated twice', () => {
    const rules = [
      createRule('output.name', 'source("customer.firstName")'),
      createRule('output.name', 'source("customer.lastName")'),
    ];

    const diagnostics = detectDuplicateTargets(rules);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      code: 'KEYRA-W006',
      severity: 'warning',
      ruleIndex: 1,
      targetPath: 'output.name',
      expression: 'source("customer.lastName")',
    });
    expect(diagnostics[0]?.message).toContain('output.name');
    expect(diagnostics[0]?.message).toContain('0, 1');
  });

  it('returns KEYRA-W006 warnings for each duplicate after the first', () => {
    const rules = [
      createRule('output.name', 'source("customer.firstName")'),
      createRule('output.name', 'source("customer.lastName")'),
      createRule('output.name', 'source("customer.nickName")'),
    ];

    const diagnostics = detectDuplicateTargets(rules);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.code)).toEqual(['KEYRA-W006', 'KEYRA-W006']);
    expect(diagnostics.map((d) => d.ruleIndex)).toEqual([1, 2]);
    expect(diagnostics[0]?.message).toContain('0, 1, 2');
    expect(diagnostics[1]?.message).toContain('0, 1, 2');
  });
});
