import { describe, expect, it } from 'vitest';

import type { ExpressionBuilderState } from '../expression-builder-state';
import { generateExpressionFromState } from '../pipeline-expression-generator';

describe('generateExpressionFromState (value mode)', () => {
  it('AE-01: direct copy -> source("email")', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      sources: [{ path: 'email' }],
      transforms: [],
    };

    expect(generateExpressionFromState(state)).toBe('source("email")');
  });

  it('AE-02: 2-step pipeline trim -> lower', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
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

  it('AE-14: static string value', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'default@example.com' },
    };

    expect(generateExpressionFromState(state)).toBe('static("default@example.com")');
  });

  it('uses first source as primary source in multi-source edge case', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      sources: [{ path: 'firstName' }, { path: 'lastName' }],
      transforms: [{ functionName: 'upper', parameters: [] }],
    };

    expect(generateExpressionFromState(state)).toBe('upper(source("firstName"))');
  });

  it('escapes special chars in source path and static value', () => {
    const sourceState: ExpressionBuilderState = {
      mode: 'value',
      sources: [{ path: 'a"b\\c' }],
      transforms: [],
    };

    const staticState: ExpressionBuilderState = {
      mode: 'value',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'x"y\\z' },
    };

    expect(generateExpressionFromState(sourceState)).toBe('source("a\\"b\\\\c")');
    expect(generateExpressionFromState(staticState)).toBe('static("x\\"y\\\\z")');
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

  it.each([
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
        state: { mode: 'value', sources: [], transforms: [] },
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
