import { describe, expect, it } from 'vitest';

import type { ExpressionBuilderState } from '../expression-builder-state';
import { generateExpressionFromState } from '../pipeline-expression-generator';

describe('generateExpressionFromState (value mode)', () => {
  it('AE-01: direct copy -> source("email")', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'source',
      sources: [{ path: 'email' }],
      transforms: [],
    };

    expect(generateExpressionFromState(state)).toBe('source("email")');
  });

  it('AE-02: 2-step pipeline trim -> lower', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'source',
      sources: [{ path: 'email' }],
      transforms: [
        { functionName: 'trim', parameters: [] },
        { functionName: 'lower', parameters: [] },
      ],
    };

    expect(generateExpressionFromState(state)).toBe('lower(trim(source("email")))');
  });

  it('AE-03: substring with additional parameters', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'source',
      sources: [{ path: 'code' }],
      transforms: [
        {
          functionName: 'substring',
          parameters: [
            { name: 'start', value: 0, type: 'number' },
            { name: 'end', value: 3, type: 'number' },
          ],
        },
      ],
    };

    expect(generateExpressionFromState(state)).toBe('substring(source("code"), 0, 3)');
  });

  it('AE-14: static string value emits bare literal (T-06)', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'default@example.com' },
    };

    expect(generateExpressionFromState(state)).toBe('"default@example.com"');
  });

  it('uses first source as primary source in multi-source edge case', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'source',
      sources: [{ path: 'firstName' }, { path: 'lastName' }],
      transforms: [{ functionName: 'upper', parameters: [] }],
    };

    expect(generateExpressionFromState(state)).toBe('upper(source("firstName"))');
  });

  it('escapes special chars in source path and static value', () => {
    const sourceState: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'source',
      sources: [{ path: 'a"b\\c' }],
      transforms: [],
    };

    const staticState: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'x"y\\z' },
    };

    expect(generateExpressionFromState(sourceState)).toBe('source("a\\"b\\\\c")');
    expect(generateExpressionFromState(staticState)).toBe('"x\\"y\\\\z"');
  });
});

describe('generateExpressionFromState (conditional mode)', () => {
  it('AE-04: basic if/then/else with eq', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'status' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'active' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'Yes' },
      elseBranch: { kind: 'static', value: 'No' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(eq(source("status"), "active"), "Yes", "No")',
    );
  });

  it('emits boolean literals for typed static conditional branches', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'notes' },
            comparison: 'isNotNull',
            rightOperand: { kind: 'static', value: '' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'true', valueType: 'boolean' },
      elseBranch: { kind: 'static', value: 'false', valueType: 'boolean' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(not(isNull(source("notes"))), true, false)',
    );
  });

  it('emits numeric literal when comparing static value against typed number source', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'stats.unmappedFields', sourceType: 'number' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: '0' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'true', valueType: 'boolean' },
      elseBranch: { kind: 'static', value: 'false', valueType: 'boolean' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(eq(source("stats.unmappedFields"), 0), true, false)',
    );
  });

  it('AE-05: nested else-if chain', () => {
    const nested: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'priority' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'medium' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: '2' },
      elseBranch: { kind: 'static', value: '3' },
    };

    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'priority' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'high' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: '1' },
      elseBranch: { kind: 'conditional', value: nested },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(eq(source("priority"), "high"), "1", if(eq(source("priority"), "medium"), "2", "3"))',
    );
  });

  it('AE-15: nested condition groups (AND containing OR)', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'amount' },
            comparison: 'gt',
            rightOperand: { kind: 'expression', value: '1000' },
          },
          {
            operator: 'or',
            conditions: [
              {
                leftOperand: { kind: 'source', value: 'channel' },
                comparison: 'eq',
                rightOperand: { kind: 'static', value: 'web' },
              },
              {
                leftOperand: { kind: 'source', value: 'channel' },
                comparison: 'eq',
                rightOperand: { kind: 'static', value: 'mobile' },
              },
            ],
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'approved' },
      elseBranch: { kind: 'static', value: 'pending' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(and(gt(source("amount"), 1000), or(eq(source("channel"), "web"), eq(source("channel"), "mobile"))), "approved", "pending")',
    );
  });

  it('folds 3-condition AND group into nested binary and() calls', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'lastRun.status' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'success' },
          },
          {
            leftOperand: { kind: 'source', value: 'lastRun.errorCount' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: '0' },
          },
          {
            leftOperand: { kind: 'source', value: 'settings.archived' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'false' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'HEALTHY' },
      elseBranch: { kind: 'static', value: '' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(and(and(eq(source("lastRun.status"), "success"), eq(source("lastRun.errorCount"), "0")), eq(source("settings.archived"), "false")), "HEALTHY", "")',
    );
  });

  it('folds 4-condition OR group into nested binary or() calls', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'or',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'flags.a' },
            comparison: 'isTruthy',
            rightOperand: { kind: 'static', value: '' },
          },
          {
            leftOperand: { kind: 'source', value: 'flags.b' },
            comparison: 'isTruthy',
            rightOperand: { kind: 'static', value: '' },
          },
          {
            leftOperand: { kind: 'source', value: 'flags.c' },
            comparison: 'isTruthy',
            rightOperand: { kind: 'static', value: '' },
          },
          {
            leftOperand: { kind: 'source', value: 'flags.d' },
            comparison: 'isTruthy',
            rightOperand: { kind: 'static', value: '' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'yes' },
      elseBranch: { kind: 'static', value: 'no' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(or(or(or(source("flags.a"), source("flags.b")), source("flags.c")), source("flags.d")), "yes", "no")',
    );
  });

  it.each([
    ['isTruthy', 'source("x")'],
    ['isFalsy', 'not(source("x"))'],
    ['eq', 'eq(source("x"), "y")'],
    ['neq', 'neq(source("x"), "y")'],
    ['gt', 'gt(source("x"), "y")'],
    ['gte', 'gte(source("x"), "y")'],
    ['lt', 'lt(source("x"), "y")'],
    ['lte', 'lte(source("x"), "y")'],
    ['contains', 'contains(source("x"), "y")'],
    ['isNull', 'isNull(source("x"))'],
    ['isNotNull', 'not(isNull(source("x")))'],
  ] as const)('maps comparison operator %s correctly', (comparison, expectedCondition) => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'x' },
            comparison,
            rightOperand: { kind: 'static', value: 'y' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'yes' },
      elseBranch: { kind: 'static', value: 'no' },
    };

    expect(generateExpressionFromState(state)).toBe(`if(${expectedCondition}, "yes", "no")`);
  });
});

// ---------------------------------------------------------------------------
// T-03: pipeline kind in branch values and operands
// ---------------------------------------------------------------------------

describe('generateExpressionFromState — pipeline branch values (T-03)', () => {
  it('T-03-GEN-01: then branch kind=pipeline generates transform expression', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'status' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'active' },
          },
        ],
      },
      thenBranch: {
        kind: 'pipeline',
        state: {
          mode: 'value',
          inputType: 'source',
          sources: [{ path: 'tier' }],
          transforms: [{ functionName: 'upper', parameters: [] }],
        },
      },
      elseBranch: { kind: 'static', value: 'inactive' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(eq(source("status"), "active"), upper(source("tier")), "inactive")',
    );
  });

  it('T-03-GEN-02: else branch kind=pipeline generates transform expression', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'flag' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'yes' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'ok' },
      elseBranch: {
        kind: 'pipeline',
        state: {
          mode: 'value',
          inputType: 'source',
          sources: [{ path: 'fallback_label' }],
          transforms: [{ functionName: 'lower', parameters: [] }],
        },
      },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(eq(source("flag"), "yes"), "ok", lower(source("fallback_label")))',
    );
  });

  it('T-03-GEN-03: left operand kind=pipeline generates transform expression in condition', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: {
              kind: 'pipeline',
              value: '',
              pipelineState: {
                mode: 'value',
                inputType: 'source',
                sources: [{ path: 'name' }],
                transforms: [{ functionName: 'length', parameters: [] }],
              },
            },
            comparison: 'gt',
            rightOperand: { kind: 'expression', value: '5' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'long' },
      elseBranch: { kind: 'static', value: 'short' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'if(gt(length(source("name")), 5), "long", "short")',
    );
  });

  it('T-03-GEN-04: pipeline branch with empty state returns empty string (no crash)', () => {
    const state: ExpressionBuilderState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'x' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'y' },
          },
        ],
      },
      thenBranch: {
        kind: 'pipeline',
        state: { mode: 'value', inputType: 'source', sources: [], transforms: [] },
      },
      elseBranch: { kind: 'static', value: 'no' },
    };

    // Empty pipeline state → empty string for then branch
    const result = generateExpressionFromState(state);
    expect(result).toBe('if(eq(source("x"), "y"), , "no")');
  });
});

describe('generateExpressionFromState (valueMap mode)', () => {
  it('AE-06: valueMap with fallback value', () => {
    const state: ExpressionBuilderState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [
        { whenValue: 'US', mapTo: 'United States' },
        { whenValue: 'GB', mapTo: 'United Kingdom' },
      ],
      fallback: { kind: 'value', value: 'Unknown' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'valueMap(source("country"), {"US": "United States", "GB": "United Kingdom"}, "Unknown")',
    );
  });

  it('fallback null', () => {
    const state: ExpressionBuilderState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [{ whenValue: 'US', mapTo: 'United States' }],
      fallback: { kind: 'null' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'valueMap(source("country"), {"US": "United States"}, null)',
    );
  });

  it('emits boolean map values and boolean fallback when typed', () => {
    const state: ExpressionBuilderState = {
      mode: 'valueMap',
      inputSource: 'notes',
      mappings: [
        { whenValue: '', mapTo: 'false', mapToType: 'boolean' },
        { whenValue: 'present', mapTo: 'true', mapToType: 'boolean' },
      ],
      fallback: { kind: 'value', value: 'false', valueType: 'boolean' },
    };

    expect(generateExpressionFromState(state)).toBe(
      'valueMap(source("notes"), {"present": true}, false)',
    );
  });

  it('omits empty whenValue entries and handles empty mappings', () => {
    const withEmptyEntry: ExpressionBuilderState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [
        { whenValue: '', mapTo: 'Unknown' },
        { whenValue: 'GB', mapTo: 'United Kingdom' },
      ],
      fallback: { kind: 'value', value: 'Other' },
    };

    const emptyMappings: ExpressionBuilderState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [],
      fallback: { kind: 'value', value: 'Other' },
    };

    expect(generateExpressionFromState(withEmptyEntry)).toBe(
      'valueMap(source("country"), {"GB": "United Kingdom"}, "Other")',
    );
    expect(generateExpressionFromState(emptyMappings)).toBe(
      'valueMap(source("country"), {}, "Other")',
    );
  });
});

// ---------------------------------------------------------------------------
// T-06: bare literal emission for static inputType
// ---------------------------------------------------------------------------

describe('generateExpressionFromState — T-06 bare literals (inputType=static)', () => {
  it('T-06-GEN-01: static string emits bare quoted string', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'hello' },
    };
    expect(generateExpressionFromState(state)).toBe('"hello"');
  });

  it('T-06-GEN-02: static number emits bare number', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'number', value: 42 },
    };
    expect(generateExpressionFromState(state)).toBe('42');
  });

  it('T-06-GEN-03: static boolean true emits bare true', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'boolean', value: true },
    };
    expect(generateExpressionFromState(state)).toBe('true');
  });

  it('T-06-GEN-04: static boolean false emits bare false', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'boolean', value: false },
    };
    expect(generateExpressionFromState(state)).toBe('false');
  });

  it('T-06-GEN-05: static null emits bare null', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'null' },
    };
    expect(generateExpressionFromState(state)).toBe('null');
  });

  it('T-06-GEN-06: static string with transform emits transform(literal)', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [{ functionName: 'upper', parameters: [] }],
      staticValue: { type: 'string', value: 'hello' },
    };
    expect(generateExpressionFromState(state)).toBe('upper("hello")');
  });
});
