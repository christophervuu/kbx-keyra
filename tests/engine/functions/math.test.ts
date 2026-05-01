import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerMathFunctions } from '../../../src/engine/functions/math.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerMathFunctions(registry);

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

describe('math functions', () => {
  it('add() works with integers, floats, and negatives', () => {
    const context = createContext();

    const ints = evaluate(
      call('add', [
        { type: 'NumberLiteral', value: 2, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 3, start: 0, end: 0 },
      ]),
      context,
    );

    const floats = evaluate(
      call('add', [
        { type: 'NumberLiteral', value: 89.99, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 6.88, start: 0, end: 0 },
      ]),
      context,
    );

    const negatives = evaluate(
      call('add', [
        { type: 'NumberLiteral', value: -5, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 3, start: 0, end: 0 },
      ]),
      context,
    );

    expect(ints.value).toBe(5);
    expect(floats.value).toBeCloseTo(96.87, 10);
    expect(negatives.value).toBe(-2);
  });

  it('subtract() works with integers and floats', () => {
    const context = createContext();

    const basic = evaluate(
      call('subtract', [
        { type: 'NumberLiteral', value: 89.99, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 9, start: 0, end: 0 },
      ]),
      context,
    );

    const negative = evaluate(
      call('subtract', [
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 5, start: 0, end: 0 },
      ]),
      context,
    );

    expect(basic.value).toBeCloseTo(80.99, 10);
    expect(negative.value).toBe(-5);
  });

  it('multiply() works with integers, floats, and sign combinations', () => {
    const context = createContext();

    const basic = evaluate(
      call('multiply', [
        { type: 'NumberLiteral', value: 29.99, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 2, start: 0, end: 0 },
      ]),
      context,
    );

    const zero = evaluate(
      call('multiply', [
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 100, start: 0, end: 0 },
      ]),
      context,
    );

    const negatives = evaluate(
      call('multiply', [
        { type: 'NumberLiteral', value: -3, start: 0, end: 0 },
        { type: 'NumberLiteral', value: -4, start: 0, end: 0 },
      ]),
      context,
    );

    expect(basic.value).toBeCloseTo(59.98, 10);
    expect(zero.value).toBe(0);
    expect(negatives.value).toBe(12);
  });

  it('AE-19: divide() emits E050 for division by zero', () => {
    const context = createContext();

    const result = evaluate(
      call('divide', [
        { type: 'NumberLiteral', value: 100, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E050')).toBe(true);
  });

  it('divide() works for non-zero divisor values', () => {
    const context = createContext();

    const integer = evaluate(
      call('divide', [
        { type: 'NumberLiteral', value: 100, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 4, start: 0, end: 0 },
      ]),
      context,
    );

    const fraction = evaluate(
      call('divide', [
        { type: 'NumberLiteral', value: 10, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 3, start: 0, end: 0 },
      ]),
      context,
    );

    const negative = evaluate(
      call('divide', [
        { type: 'NumberLiteral', value: -10, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 2, start: 0, end: 0 },
      ]),
      context,
    );

    expect(integer.value).toBe(25);
    expect(fraction.value).toBeCloseTo(10 / 3, 10);
    expect(negative.value).toBe(-5);
    expect(integer.diagnostics).toEqual([]);
    expect(fraction.diagnostics).toEqual([]);
    expect(negative.diagnostics).toEqual([]);
  });

  it('AE-20: round() uses round-half-up semantics', () => {
    const context = createContext();

    const twoDecimals = evaluate(
      call('round', [
        { type: 'NumberLiteral', value: 3.145, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 2, start: 0, end: 0 },
      ]),
      context,
    );

    const defaultDecimals = evaluate(
      call('round', [{ type: 'NumberLiteral', value: 3.7, start: 0, end: 0 }]),
      context,
    );

    const positiveHalf = evaluate(
      call('round', [{ type: 'NumberLiteral', value: 2.5, start: 0, end: 0 }]),
      context,
    );

    const negativeHalf = evaluate(
      call('round', [{ type: 'NumberLiteral', value: -2.5, start: 0, end: 0 }]),
      context,
    );

    expect(twoDecimals.value).toBe(3.15);
    expect(defaultDecimals.value).toBe(4);
    expect(positiveHalf.value).toBe(3);
    expect(negativeHalf.value).toBe(-2);
  });

  it('round() supports explicit decimals values', () => {
    const context = createContext();

    const zeroDecimals = evaluate(
      call('round', [
        { type: 'NumberLiteral', value: 3.14159, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
      ]),
      context,
    );

    const fourDecimals = evaluate(
      call('round', [
        { type: 'NumberLiteral', value: 3.14159, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 4, start: 0, end: 0 },
      ]),
      context,
    );

    expect(zeroDecimals.value).toBe(3);
    expect(fourDecimals.value).toBeCloseTo(3.1416, 10);
  });

  it('abs() returns absolute value for positive, negative, and zero', () => {
    const context = createContext();

    const negative = evaluate(
      call('abs', [{ type: 'NumberLiteral', value: -42, start: 0, end: 0 }]),
      context,
    );

    const positive = evaluate(
      call('abs', [{ type: 'NumberLiteral', value: 42, start: 0, end: 0 }]),
      context,
    );

    const zero = evaluate(
      call('abs', [{ type: 'NumberLiteral', value: 0, start: 0, end: 0 }]),
      context,
    );

    const floatNegative = evaluate(
      call('abs', [{ type: 'NumberLiteral', value: -3.14, start: 0, end: 0 }]),
      context,
    );

    expect(negative.value).toBe(42);
    expect(positive.value).toBe(42);
    expect(zero.value).toBe(0);
    expect(floatNegative.value).toBeCloseTo(3.14, 10);
  });
});
