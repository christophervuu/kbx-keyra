import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerStringFunctions } from '../../../src/engine/functions/string.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerStringFunctions(registry);

  const context: EvaluationContext = {
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
    pushScope: (scope) => {
      context.scopeStack.push(scope);
    },
    popScope: () => context.scopeStack.pop(),
  };

  return context;
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

describe('string functions', () => {
  it('AE-16: concat() concatenates multiple strings', () => {
    const context = createContext();

    const result = evaluate(
      call('concat', [
        { type: 'StringLiteral', value: 'Hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: ' ', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'World', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('Hello World');
    expect(result.diagnostics).toEqual([]);
  });

  it('concat() handles 2 args, single arg, and empty strings', () => {
    const context = createContext();

    const twoArgs = evaluate(
      call('concat', [
        { type: 'StringLiteral', value: 'a', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'b', start: 0, end: 0 },
      ]),
      context,
    );

    const singleArg = evaluate(
      call('concat', [{ type: 'StringLiteral', value: 'only', start: 0, end: 0 }]),
      context,
    );

    const emptyMix = evaluate(
      call('concat', [
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'a', start: 0, end: 0 },
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
      ]),
      context,
    );

    expect(twoArgs.value).toBe('ab');
    expect(singleArg.value).toBe('only');
    expect(emptyMix.value).toBe('a');
  });

  it('substring() handles basic and negative index cases', () => {
    const context = createContext();

    const basic = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hello World', start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 5, start: 0, end: 0 },
      ]),
      context,
    );

    const toEnd = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hello World', start: 0, end: 0 },
        { type: 'NumberLiteral', value: 6, start: 0, end: 0 },
      ]),
      context,
    );

    const negativeStart = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hello', start: 0, end: 0 },
        { type: 'NumberLiteral', value: -3, start: 0, end: 0 },
      ]),
      context,
    );

    const negativeEnd = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hello World', start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: -6, start: 0, end: 0 },
      ]),
      context,
    );

    const outOfBounds = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hi', start: 0, end: 0 },
        { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
        { type: 'NumberLiteral', value: 100, start: 0, end: 0 },
      ]),
      context,
    );

    expect(basic.value).toBe('Hello');
    expect(toEnd.value).toBe('World');
    expect(negativeStart.value).toBe('llo');
    expect(negativeEnd.value).toBe('Hello');
    expect(outOfBounds.value).toBe('Hi');
  });

  it('AE-22: substring("Hello", -3) returns "llo"', () => {
    const context = createContext();

    const result = evaluate(
      call('substring', [
        { type: 'StringLiteral', value: 'Hello', start: 0, end: 0 },
        { type: 'NumberLiteral', value: -3, start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('llo');
  });

  it('upper/lower/trim transform strings correctly', () => {
    const context = createContext();

    const upper = evaluate(
      call('upper', [{ type: 'StringLiteral', value: 'hello', start: 0, end: 0 }]),
      context,
    );
    const lower = evaluate(
      call('lower', [{ type: 'StringLiteral', value: 'HELLO', start: 0, end: 0 }]),
      context,
    );
    const trim = evaluate(
      call('trim', [{ type: 'StringLiteral', value: '  hello  ', start: 0, end: 0 }]),
      context,
    );

    expect(upper.value).toBe('HELLO');
    expect(lower.value).toBe('hello');
    expect(trim.value).toBe('hello');
  });

  it('replace() and replaceAll() use literal string replacement semantics', () => {
    const context = createContext();

    const replaceFirst = evaluate(
      call('replace', [
        { type: 'StringLiteral', value: 'aaa', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'a', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'b', start: 0, end: 0 },
      ]),
      context,
    );

    const replaceNoMatch = evaluate(
      call('replace', [
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'xyz', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'abc', start: 0, end: 0 },
      ]),
      context,
    );

    const replaceAll = evaluate(
      call('replaceAll', [
        { type: 'StringLiteral', value: 'aaa', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'a', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'b', start: 0, end: 0 },
      ]),
      context,
    );

    const replaceAllNoMatch = evaluate(
      call('replaceAll', [
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'xyz', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'abc', start: 0, end: 0 },
      ]),
      context,
    );

    expect(replaceFirst.value).toBe('baa');
    expect(replaceNoMatch.value).toBe('hello');
    expect(replaceAll.value).toBe('bbb');
    expect(replaceAllNoMatch.value).toBe('hello');
  });

  it('AE-21: contains() returns false for null arguments', () => {
    const context = createContext();

    const nullHaystack = evaluate(
      call('contains', [
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'test', start: 0, end: 0 },
      ]),
      context,
    );

    const nullNeedle = evaluate(
      call('contains', [
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
        { type: 'NullLiteral', start: 0, end: 0 },
      ]),
      context,
    );

    const found = evaluate(
      call('contains', [
        { type: 'StringLiteral', value: 'Hello World', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'World', start: 0, end: 0 },
      ]),
      context,
    );

    const notFound = evaluate(
      call('contains', [
        { type: 'StringLiteral', value: 'Hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'xyz', start: 0, end: 0 },
      ]),
      context,
    );

    const caseSensitive = evaluate(
      call('contains', [
        { type: 'StringLiteral', value: 'Hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
      ]),
      context,
    );

    expect(nullHaystack.value).toBe(false);
    expect(nullNeedle.value).toBe(false);
    expect(found.value).toBe(true);
    expect(notFound.value).toBe(false);
    expect(caseSensitive.value).toBe(false);
  });

  it('length() returns character count', () => {
    const context = createContext();

    const hello = evaluate(
      call('length', [{ type: 'StringLiteral', value: 'hello', start: 0, end: 0 }]),
      context,
    );

    const empty = evaluate(
      call('length', [{ type: 'StringLiteral', value: '', start: 0, end: 0 }]),
      context,
    );

    const unicode = evaluate(
      call('length', [{ type: 'StringLiteral', value: 'café', start: 0, end: 0 }]),
      context,
    );

    expect(hello.value).toBe(5);
    expect(empty.value).toBe(0);
    expect(unicode.value).toBe(4);
  });

  it('split() splits a string by separator and preserves empty tokens', () => {
    const context = createContext();

    const csv = evaluate(
      call('split', [
        { type: 'StringLiteral', value: 'a,b,c', start: 0, end: 0 },
        { type: 'StringLiteral', value: ',', start: 0, end: 0 },
      ]),
      context,
    );

    const withSpaces = evaluate(
      call('split', [
        { type: 'StringLiteral', value: 'a, b, c', start: 0, end: 0 },
        { type: 'StringLiteral', value: ',', start: 0, end: 0 },
      ]),
      context,
    );

    const emptyTokens = evaluate(
      call('split', [
        { type: 'StringLiteral', value: 'a,,c,', start: 0, end: 0 },
        { type: 'StringLiteral', value: ',', start: 0, end: 0 },
      ]),
      context,
    );

    expect(csv.value).toEqual(['a', 'b', 'c']);
    expect(withSpaces.value).toEqual(['a', ' b', ' c']);
    expect(emptyTokens.value).toEqual(['a', '', 'c', '']);
  });
});
