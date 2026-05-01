import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerNullHandlingFunctions } from '../../../src/engine/functions/null-handling.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerNullHandlingFunctions(registry);

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

describe('null handling functions', () => {
  it('AE-07: default(value, fallback) returns fallback when value is null', () => {
    const context = createContext();

    const result = evaluate(
      call('default', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fallback', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('fallback');
    expect(result.diagnostics).toEqual([]);
  });

  it('default(value, fallback) returns value when non-null', () => {
    const context = createContext();

    const valueString = evaluate(
      call('default', [
        { type: 'StringLiteral', value: 'present', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fallback', start: 0, end: 0 },
      ]),
      context,
    );

    const valueNumber = evaluate(
      call('default', [
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fallback', start: 0, end: 0 },
      ]),
      context,
    );

    const valueBoolean = evaluate(
      call('default', [
        { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fallback', start: 0, end: 0 },
      ]),
      context,
    );

    expect(valueString.value).toBe('present');
    expect(valueNumber.value).toBe(0);
    expect(valueBoolean.value).toBe(false);
  });

  it('default handles null fallback and empty string value', () => {
    const context = createContext();

    const nullFallback = evaluate(
      call('default', [{ type: 'NullLiteral', start: 0, end: 0 }, { type: 'NullLiteral', start: 0, end: 0 }]),
      context,
    );

    const emptyStringValue = evaluate(
      call('default', [
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fallback', start: 0, end: 0 },
      ]),
      context,
    );

    expect(nullFallback.value).toBeNull();
    expect(emptyStringValue.value).toBe('');
    expect(nullFallback.diagnostics).toEqual([]);
    expect(emptyStringValue.diagnostics).toEqual([]);
  });

  it('AE-08: coalesce returns first non-null value', () => {
    const context = createContext();

    const result = evaluate(
      call('coalesce', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'found', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignored', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('found');
    expect(result.diagnostics).toEqual([]);
  });

  it('coalesce handles single arg and all-null input', () => {
    const context = createContext();

    const singleNonNull = evaluate(
      call('coalesce', [{ type: 'StringLiteral', value: 'only', start: 0, end: 0 }]),
      context,
    );

    const singleNull = evaluate(call('coalesce', [{ type: 'NullLiteral', start: 0, end: 0 }]), context);

    const allNull = evaluate(
      call('coalesce', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'NullLiteral', start: 0, end: 0 },
      ]),
      context,
    );

    expect(singleNonNull.value).toBe('only');
    expect(singleNull.value).toBeNull();
    expect(allNull.value).toBeNull();
    expect(singleNonNull.diagnostics).toEqual([]);
    expect(singleNull.diagnostics).toEqual([]);
    expect(allNull.diagnostics).toEqual([]);
  });

  it('coalesce treats 0, false, and empty string as non-null values', () => {
    const context = createContext();

    const zeroFirst = evaluate(
      call('coalesce', [
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'other', start: 0, end: 0 },
      ]),
      context,
    );

    const falseFirst = evaluate(
      call('coalesce', [
        { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'other', start: 0, end: 0 },
      ]),
      context,
    );

    const emptyFirst = evaluate(
      call('coalesce', [
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'other', start: 0, end: 0 },
      ]),
      context,
    );

    expect(zeroFirst.value).toBe(0);
    expect(falseFirst.value).toBe(false);
    expect(emptyFirst.value).toBe('');
  });

  it('isNull(value) returns true only for null', () => {
    const context = createContext();

    const isNullValue = evaluate(call('isNull', [{ type: 'NullLiteral', start: 0, end: 0 }]), context);

    const isStringValue = evaluate(
      call('isNull', [{ type: 'StringLiteral', value: 'hello', start: 0, end: 0 }]),
      context,
    );

    const isZeroValue = evaluate(
      call('isNull', [{ type: 'NumberLiteral', value: 0, start: 0, end: 0 }]),
      context,
    );

    const isEmptyStringValue = evaluate(
      call('isNull', [{ type: 'StringLiteral', value: '', start: 0, end: 0 }]),
      context,
    );

    const isFalseValue = evaluate(
      call('isNull', [{ type: 'BooleanLiteral', value: false, start: 0, end: 0 }]),
      context,
    );

    expect(isNullValue.value).toBe(true);
    expect(isStringValue.value).toBe(false);
    expect(isZeroValue.value).toBe(false);
    expect(isEmptyStringValue.value).toBe(false);
    expect(isFalseValue.value).toBe(false);

    expect(isNullValue.diagnostics).toEqual([]);
    expect(isStringValue.diagnostics).toEqual([]);
    expect(isZeroValue.diagnostics).toEqual([]);
    expect(isEmptyStringValue.diagnostics).toEqual([]);
    expect(isFalseValue.diagnostics).toEqual([]);
  });
});
