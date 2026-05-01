import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerConditionalFunctions } from '../../../src/engine/functions/conditional.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerConditionalFunctions(registry);

  return {
    sourceData: {},
    scopeStack: [],
    constants: {},
    externalSources: {},
    registry,
    options: {},
    evaluate,
    addDiagnostic: () => {
      // Overridden by evaluator root context.
    },
  };
}

function call(name: string, args: readonly AstNode[]): AstNode {
  return {
    type: 'FunctionCall',
    name,
    arguments: args,
    start: 0,
    end: 1,
  };
}

describe('conditional functions', () => {
  it('AE-09: if() treats null condition as false', () => {
    const context = createContext();

    const nullCondition = evaluate(
      call('if', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'yes', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'no', start: 0, end: 0 },
      ]),
      context,
    );

    const trueCondition = evaluate(
      call('if', [
        { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'yes', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'no', start: 0, end: 0 },
      ]),
      context,
    );

    const falseCondition = evaluate(
      call('if', [
        { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'yes', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'no', start: 0, end: 0 },
      ]),
      context,
    );

    expect(nullCondition.value).toBe('no');
    expect(trueCondition.value).toBe('yes');
    expect(falseCondition.value).toBe('no');
  });

  it('AE-10 and AE-11: eq() null and strict equality behavior', () => {
    const context = createContext();

    const nullNull = evaluate(
      call('eq', [{ type: 'NullLiteral', start: 0, end: 0 }, { type: 'NullLiteral', start: 0, end: 0 }]),
      context,
    );

    const nullValue = evaluate(
      call('eq', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
      ]),
      context,
    );

    const sameTypeEqual = evaluate(
      call('eq', [
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
      ]),
      context,
    );

    const sameTypeDifferent = evaluate(
      call('eq', [
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'store', start: 0, end: 0 },
      ]),
      context,
    );

    const typeMismatch = evaluate(
      call('eq', [
        { type: 'NumberLiteral', value: 42, start: 0, end: 0 },
        { type: 'StringLiteral', value: '42', start: 0, end: 0 },
      ]),
      context,
    );

    expect(nullNull.value).toBe(true);
    expect(nullValue.value).toBe(false);
    expect(sameTypeEqual.value).toBe(true);
    expect(sameTypeDifferent.value).toBe(false);
    expect(typeMismatch.value).toBe(false);
  });

  it('neq() mirrors eq() inversely including null rules', () => {
    const context = createContext();

    const nullNull = evaluate(
      call('neq', [{ type: 'NullLiteral', start: 0, end: 0 }, { type: 'NullLiteral', start: 0, end: 0 }]),
      context,
    );

    const nullValue = evaluate(
      call('neq', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
      ]),
      context,
    );

    const sameTypeEqual = evaluate(
      call('neq', [
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
      ]),
      context,
    );

    const sameTypeDifferent = evaluate(
      call('neq', [
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'store', start: 0, end: 0 },
      ]),
      context,
    );

    expect(nullNull.value).toBe(false);
    expect(nullValue.value).toBe(true);
    expect(sameTypeEqual.value).toBe(false);
    expect(sameTypeDifferent.value).toBe(true);
  });

  it('gt/gte/lt/lte numeric comparisons work for integers and floats', () => {
    const context = createContext();

    const gt = evaluate(
      call('gt', [
        { type: 'NumberLiteral', value: 10, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 5, start: 0, end: 0 },
      ]),
      context,
    );

    const gteEqual = evaluate(
      call('gte', [
        { type: 'NumberLiteral', value: 10, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 10, start: 0, end: 0 },
      ]),
      context,
    );

    const ltFloat = evaluate(
      call('lt', [
        { type: 'NumberLiteral', value: 89.99, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 100, start: 0, end: 0 },
      ]),
      context,
    );

    const lteEqual = evaluate(
      call('lte', [
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
      ]),
      context,
    );

    expect(gt.value).toBe(true);
    expect(gteEqual.value).toBe(true);
    expect(ltFloat.value).toBe(true);
    expect(lteEqual.value).toBe(true);
  });

  it('AE-12: and() null short-circuit behavior', () => {
    const context = createContext();

    const cases: Array<{ args: readonly AstNode[]; expected: boolean | null }> = [
      {
        args: [
          { type: 'NullLiteral', start: 0, end: 0 },
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
        ],
        expected: null,
      },
      {
        args: [
          { type: 'NullLiteral', start: 0, end: 0 },
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
        ],
        expected: false,
      },
      {
        args: [
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
          { type: 'NullLiteral', start: 0, end: 0 },
        ],
        expected: null,
      },
      {
        args: [
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
          { type: 'NullLiteral', start: 0, end: 0 },
        ],
        expected: false,
      },
    ];

    for (const testCase of cases) {
      const result = evaluate(call('and', testCase.args), context);
      expect(result.value).toBe(testCase.expected);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('and() full 3x3 truth table', () => {
    const context = createContext();
    const values: Array<boolean | null> = [true, false, null];

    const expected = new Map<string, boolean | null>([
      ['true,true', true],
      ['true,false', false],
      ['true,null', null],
      ['false,true', false],
      ['false,false', false],
      ['false,null', false],
      ['null,true', null],
      ['null,false', false],
      ['null,null', null],
    ]);

    for (const a of values) {
      for (const b of values) {
        const aNode: AstNode = a === null ? { type: 'NullLiteral', start: 0, end: 0 } : { type: 'BooleanLiteral', value: a, start: 0, end: 0 };
        const bNode: AstNode = b === null ? { type: 'NullLiteral', start: 0, end: 0 } : { type: 'BooleanLiteral', value: b, start: 0, end: 0 };

        const result = evaluate(call('and', [aNode, bNode]), context);

        expect(result.value).toBe(expected.get(`${String(a)},${String(b)}`));
      }
    }
  });

  it('AE-13: or() null short-circuit behavior', () => {
    const context = createContext();

    const cases: Array<{ args: readonly AstNode[]; expected: boolean | null }> = [
      {
        args: [
          { type: 'NullLiteral', start: 0, end: 0 },
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
        ],
        expected: null,
      },
      {
        args: [
          { type: 'NullLiteral', start: 0, end: 0 },
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
        ],
        expected: true,
      },
      {
        args: [
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
          { type: 'NullLiteral', start: 0, end: 0 },
        ],
        expected: true,
      },
      {
        args: [
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
          { type: 'NullLiteral', start: 0, end: 0 },
        ],
        expected: null,
      },
    ];

    for (const testCase of cases) {
      const result = evaluate(call('or', testCase.args), context);
      expect(result.value).toBe(testCase.expected);
      expect(result.diagnostics).toEqual([]);
    }
  });

  it('or() full 3x3 truth table', () => {
    const context = createContext();
    const values: Array<boolean | null> = [true, false, null];

    const expected = new Map<string, boolean | null>([
      ['true,true', true],
      ['true,false', true],
      ['true,null', true],
      ['false,true', true],
      ['false,false', false],
      ['false,null', null],
      ['null,true', true],
      ['null,false', null],
      ['null,null', null],
    ]);

    for (const a of values) {
      for (const b of values) {
        const aNode: AstNode = a === null ? { type: 'NullLiteral', start: 0, end: 0 } : { type: 'BooleanLiteral', value: a, start: 0, end: 0 };
        const bNode: AstNode = b === null ? { type: 'NullLiteral', start: 0, end: 0 } : { type: 'BooleanLiteral', value: b, start: 0, end: 0 };

        const result = evaluate(call('or', [aNode, bNode]), context);

        expect(result.value).toBe(expected.get(`${String(a)},${String(b)}`));
      }
    }
  });

  it('not() inverts boolean values', () => {
    const context = createContext();

    const trueResult = evaluate(
      call('not', [{ type: 'BooleanLiteral', value: true, start: 0, end: 0 }]),
      context,
    );
    const falseResult = evaluate(
      call('not', [{ type: 'BooleanLiteral', value: false, start: 0, end: 0 }]),
      context,
    );

    expect(trueResult.value).toBe(false);
    expect(falseResult.value).toBe(true);
    expect(trueResult.diagnostics).toEqual([]);
    expect(falseResult.diagnostics).toEqual([]);
  });
});
