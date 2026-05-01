import { describe, expect, it } from 'vitest';

import { evaluate, resolvePath } from '../../../src/engine/dsl/index.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';
import type { EngineOptions, FunctionSignature } from '../../../src/engine/types/index.js';

function createContext(options?: EngineOptions, scopeStack: unknown[] = []): EvaluationContext {
  const registry = createRegistry();

  const context: EvaluationContext = {
    sourceData: { sourceRoot: true },
    scopeStack,
    constants: {},
    externalSources: {},
    registry,
    options: options ?? {},
    evaluate,
    addDiagnostic: () => {
      // Overridden by evaluator root context; test context provides a valid default.
    },
    pushScope: (scope) => {
      context.scopeStack.push(scope);
    },
    popScope: () => context.scopeStack.pop(),
  };

  return context;
}

function nestedFunctionAst(levels: number, leaf: AstNode): AstNode {
  let node: AstNode = leaf;

  for (let index = 0; index < levels; index += 1) {
    node = {
      type: 'FunctionCall',
      name: 'identity',
      arguments: [node],
      start: 0,
      end: 8,
    };
  }

  return node;
}

function register(
  context: EvaluationContext,
  name: string,
  signature: FunctionSignature,
  implementation: (args: readonly unknown[], ctx: EvaluationContext) => unknown,
): void {
  context.registry.registerFunction(name, signature, implementation);
}

describe('evaluate() comprehensive coverage', () => {
  it('AE-01: evaluates all literal node types directly', () => {
    const context = createContext();

    const stringResult = evaluate({ type: 'StringLiteral', value: 'hello', start: 0, end: 7 }, context);
    const numberResult = evaluate({ type: 'NumberLiteral', value: 42, start: 0, end: 2 }, context);
    const booleanResult = evaluate({ type: 'BooleanLiteral', value: true, start: 0, end: 4 }, context);
    const nullResult = evaluate({ type: 'NullLiteral', start: 0, end: 4 }, context);

    expect(stringResult.value).toBe('hello');
    expect(numberResult.value).toBe(42);
    expect(booleanResult.value).toBe(true);
    expect(nullResult.value).toBeNull();
    expect(stringResult.diagnostics).toEqual([]);
  });

  it('AE-02: dispatches registered function correctly', () => {
    const context = createContext();

    register(
      context,
      'concat',
      {
        parameters: [
          { name: 'a', type: 'string', required: true },
          { name: 'b', type: 'string', required: true },
        ],
        returnType: 'string',
      },
      (args) => `${String(args[0])}${String(args[1])}`,
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'concat',
        arguments: [
          { type: 'StringLiteral', value: 'a', start: 0, end: 3 },
          { type: 'StringLiteral', value: 'b', start: 0, end: 3 },
        ],
        start: 0,
        end: 14,
      },
      context,
    );

    expect(result.value).toBe('ab');
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-03: returns E002 for unknown function', () => {
    const context = createContext();

    const result = evaluate(
      { type: 'FunctionCall', name: 'missing', arguments: [], start: 0, end: 8 },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E002')).toBe(true);
  });

  it('emits diagnostics from function implementations via context.addDiagnostic', () => {
    const context = createContext();

    register(
      context,
      'emitDiagnostic',
      { parameters: [], returnType: 'null' },
      (_args, ctx) => {
        ctx.addDiagnostic({
          code: 'KEYRA-W999',
          severity: 'warning',
          message: 'Implementation warning',
          location: { function: 'emitDiagnostic' },
        });

        return null;
      },
    );

    const result = evaluate(
      { type: 'FunctionCall', name: 'emitDiagnostic', arguments: [], start: 0, end: 14 },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-W999',
        severity: 'warning',
        message: 'Implementation warning',
      }),
    );
  });

  it('AE-04: returns E003 for arity mismatch', () => {
    const context = createContext();

    register(
      context,
      'concat',
      {
        parameters: [
          { name: 'a', type: 'string', required: true },
          { name: 'b', type: 'string', required: true },
        ],
        returnType: 'string',
      },
      () => 'ignored',
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'concat',
        arguments: [{ type: 'StringLiteral', value: 'a', start: 0, end: 3 }],
        start: 0,
        end: 10,
      },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E003')).toBe(true);
  });

  it('AE-05: null propagation short-circuits standard function with W001', () => {
    const context = createContext();
    let called = false;

    register(
      context,
      'upper',
      {
        parameters: [{ name: 'value', type: 'string', required: true }],
        returnType: 'string',
      },
      () => {
        called = true;
        return 'UNEXPECTED';
      },
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'upper',
        arguments: [{ type: 'NullLiteral', start: 0, end: 4 }],
        start: 0,
        end: 9,
      },
      context,
    );

    expect(result.value).toBeNull();
    expect(called).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W001')).toBe(true);
  });

  it('AE-06: handlesNull bypass passes null args to implementation', () => {
    const context = createContext();

    register(
      context,
      'default',
      {
        parameters: [
          { name: 'value', type: 'string', required: true },
          { name: 'fallback', type: 'string', required: true },
        ],
        returnType: 'string',
        handlesNull: true,
      },
      (args) => (args[0] === null ? args[1] : args[0]),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'default',
        arguments: [
          { type: 'NullLiteral', start: 0, end: 4 },
          { type: 'StringLiteral', value: 'fallback', start: 0, end: 10 },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    expect(result.value).toBe('fallback');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W001')).toBe(false);
  });

  it('AE-07: item reads stack top via currentItem', () => {
    const context = createContext({}, [{ name: 'Alice' }]);

    register(
      context,
      'item',
      {
        parameters: [{ name: 'path', type: 'string', required: true }],
        returnType: 'string',
      },
      (args, ctx) => resolvePath(ctx.currentItem, String(args[0])),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'name', start: 0, end: 6 }],
        start: 0,
        end: 12,
      },
      context,
    );

    expect(result.value).toBe('Alice');
  });

  it('AE-08: item outside context emits E010', () => {
    const context = createContext({}, []);

    register(
      context,
      'item',
      {
        parameters: [{ name: 'path', type: 'string', required: true }],
        returnType: 'string',
      },
      () => 'UNEXPECTED',
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'name', start: 0, end: 6 }],
        start: 0,
        end: 12,
      },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });

  it('AE-12: recursion limit boundary (32 passes, 33 fails)', () => {
    const context = createContext({ maxRecursionDepth: 32 });

    register(
      context,
      'identity',
      {
        parameters: [{ name: 'value', type: 'null', required: true }],
        returnType: 'null',
        handlesNull: true,
      },
      (args) => args[0],
    );

    const atLimit = evaluate(nestedFunctionAst(31, { type: 'NullLiteral', start: 0, end: 4 }), context);
    const beyondLimit = evaluate(nestedFunctionAst(33, { type: 'NullLiteral', start: 0, end: 4 }), context);

    expect(atLimit.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E004')).toBe(false);
    expect(beyondLimit.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E004')).toBe(true);
    expect(beyondLimit.value).toBeNull();
  });

  it('AE-13: evaluates object template values', () => {
    const context = createContext();

    const result = evaluate(
      {
        type: 'ObjectTemplate',
        properties: [
          {
            key: 'greeting',
            value: { type: 'StringLiteral', value: 'hello', start: 0, end: 7 },
            start: 0,
            end: 7,
          },
          {
            key: 'count',
            value: { type: 'NumberLiteral', value: 42, start: 0, end: 2 },
            start: 0,
            end: 2,
          },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    expect(result.value).toEqual({ greeting: 'hello', count: 42 });
  });

  it('AE-14: evaluates nested function calls inside-out (3+ levels)', () => {
    const context = createContext();

    register(
      context,
      'upper',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      (args) => String(args[0]).toUpperCase(),
    );
    register(
      context,
      'lower',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      (args) => String(args[0]).toLowerCase(),
    );
    register(
      context,
      'concat',
      {
        parameters: [
          { name: 'a', type: 'string', required: true },
          { name: 'b', type: 'string', required: true },
        ],
        returnType: 'string',
      },
      (args) => `${String(args[0])}${String(args[1])}`,
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'concat',
        arguments: [
          {
            type: 'FunctionCall',
            name: 'upper',
            arguments: [{ type: 'StringLiteral', value: 'a', start: 0, end: 3 }],
            start: 0,
            end: 9,
          },
          {
            type: 'FunctionCall',
            name: 'lower',
            arguments: [{ type: 'StringLiteral', value: 'B', start: 0, end: 3 }],
            start: 0,
            end: 9,
          },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    expect(result.value).toBe('Ab');
  });

  it('AE-15: default trace verbosity records function calls only', () => {
    const context = createContext({ trace: true });

    register(
      context,
      'upper',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      (args) => String(args[0]).toUpperCase(),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'upper',
        arguments: [{ type: 'StringLiteral', value: 'hello', start: 0, end: 7 }],
        start: 0,
        end: 13,
      },
      context,
    );

    expect(result.trace).toHaveLength(1);
    expect(result.trace?.[0]?.nodeType).toBe('FunctionCall');
  });

  it('AE-16: accumulates multiple diagnostics in single evaluation', () => {
    const context = createContext();

    register(
      context,
      'concat',
      {
        parameters: [
          { name: 'a', type: 'string', required: true },
          { name: 'b', type: 'string', required: true },
        ],
        returnType: 'string',
      },
      (args) => `${String(args[0])}${String(args[1])}`,
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'concat',
        arguments: [
          { type: 'FunctionCall', name: 'unknown1', arguments: [], start: 0, end: 9 },
          { type: 'FunctionCall', name: 'unknown2', arguments: [], start: 0, end: 9 },
        ],
        start: 0,
        end: 25,
      },
      context,
    );

    const e002Count = result.diagnostics.filter((diagnostic) => diagnostic.code === 'KEYRA-E002').length;
    expect(e002Count).toBeGreaterThanOrEqual(2);
  });

  it('AE-17: type mismatch halts function call and implementation is not called', () => {
    const context = createContext();
    let called = false;

    register(
      context,
      'upper',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      () => {
        called = true;
        return 'UNEXPECTED';
      },
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'upper',
        arguments: [{ type: 'NumberLiteral', value: 42, start: 0, end: 2 }],
        start: 0,
        end: 9,
      },
      context,
    );

    expect(result.value).toBeNull();
    expect(called).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E005')).toBe(true);
  });

  it('AE-18: traceVerbosity=all includes literals and function calls', () => {
    const context = createContext({ trace: true, traceVerbosity: 'all' });

    register(
      context,
      'upper',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      (args) => String(args[0]).toUpperCase(),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'upper',
        arguments: [{ type: 'StringLiteral', value: 'hello', start: 0, end: 7 }],
        start: 0,
        end: 13,
      },
      context,
    );

    expect(result.trace?.some((entry) => entry.nodeType === 'StringLiteral')).toBe(true);
    expect(result.trace?.some((entry) => entry.nodeType === 'FunctionCall')).toBe(true);
  });

  it('passes lazy arguments as raw AstNode while evaluating non-lazy args', () => {
    const context = createContext();
    let capturedArgs: readonly unknown[] = [];

    register(
      context,
      'captureLazy',
      {
        parameters: [
          { name: 'value', type: 'string', required: true },
          { name: 'template', type: 'any', required: true },
        ],
        returnType: 'string',
        lazyArgs: [1],
      },
      (args) => {
        capturedArgs = args;
        return String(args[0]);
      },
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'captureLazy',
        arguments: [
          { type: 'StringLiteral', value: 'value', start: 0, end: 7 },
          {
            type: 'FunctionCall',
            name: 'unknownFn',
            arguments: [],
            start: 0,
            end: 9,
          },
        ],
        start: 0,
        end: 30,
      },
      context,
    );

    expect(result.value).toBe('value');
    expect(capturedArgs[0]).toBe('value');
    expect(capturedArgs[1]).toEqual(
      expect.objectContaining({
        type: 'FunctionCall',
        name: 'unknownFn',
      }),
    );
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E002')).toBe(false);
  });

  it('keeps eager argument evaluation behavior when lazyArgs is not defined', () => {
    const context = createContext();
    let capturedArg: unknown;

    register(
      context,
      'capture',
      {
        parameters: [{ name: 'value', type: 'string', required: true }],
        returnType: 'string',
      },
      (args) => {
        capturedArg = args[0];
        return String(args[0]);
      },
    );

    register(
      context,
      'upper',
      {
        parameters: [{ name: 'value', type: 'string', required: true }],
        returnType: 'string',
      },
      (args) => String(args[0]).toUpperCase(),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'capture',
        arguments: [
          {
            type: 'FunctionCall',
            name: 'upper',
            arguments: [{ type: 'StringLiteral', value: 'abc', start: 0, end: 5 }],
            start: 0,
            end: 9,
          },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    expect(result.value).toBe('ABC');
    expect(capturedArg).toBe('ABC');
  });

  it('supports pushScope/popScope and derives currentItem/parentItem correctly', () => {
    const context = createContext();

    register(
      context,
      'item',
      {
        parameters: [{ name: 'path', type: 'string', required: true }],
        returnType: 'any',
      },
      (args, ctx) => resolvePath(ctx.currentItem, String(args[0])),
    );

    context.pushScope({ id: 'outer' });
    let result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 8,
      },
      context,
    );
    expect(result.value).toBe('outer');

    context.pushScope({ id: 'inner' });
    result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 8,
      },
      context,
    );
    expect(result.value).toBe('inner');

    context.popScope();
    result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 8,
      },
      context,
    );
    expect(result.value).toBe('outer');

    context.popScope();
    result = evaluate(
      {
        type: 'FunctionCall',
        name: 'item',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 8,
      },
      context,
    );
    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });

  it('edge: variadic arity allows 2+ arguments and rejects too few', () => {
    const context = createContext();

    register(
      context,
      'concatVariadic',
      {
        parameters: [
          { name: 'a', type: 'string', required: true },
          { name: 'b', type: 'string', required: true },
          { name: 'rest', type: 'string', required: false, variadic: true },
        ],
        returnType: 'string',
      },
      (args) => args.join(''),
    );

    const ok = evaluate(
      {
        type: 'FunctionCall',
        name: 'concatVariadic',
        arguments: [
          { type: 'StringLiteral', value: 'a', start: 0, end: 3 },
          { type: 'StringLiteral', value: 'b', start: 0, end: 3 },
          { type: 'StringLiteral', value: 'c', start: 0, end: 3 },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    const tooFew = evaluate(
      {
        type: 'FunctionCall',
        name: 'concatVariadic',
        arguments: [{ type: 'StringLiteral', value: 'a', start: 0, end: 3 }],
        start: 0,
        end: 10,
      },
      context,
    );

    expect(ok.value).toBe('abc');
    expect(tooFew.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E003')).toBe(true);
  });

  it('edge: zero-parameter function works with empty args', () => {
    const context = createContext();

    register(
      context,
      'zero',
      { parameters: [], returnType: 'string' },
      () => 'ok',
    );

    const result = evaluate(
      { type: 'FunctionCall', name: 'zero', arguments: [], start: 0, end: 6 },
      context,
    );

    expect(result.value).toBe('ok');
    expect(result.diagnostics).toEqual([]);
  });

  it('edge: parent() uses second-to-top scope entry', () => {
    const context = createContext({}, [{ id: 'parent' }, { id: 'child' }]);

    register(
      context,
      'parent',
      { parameters: [{ name: 'path', type: 'string', required: true }], returnType: 'string' },
      (args, ctx) => resolvePath(ctx.parentItem, String(args[0])),
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'parent',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 12,
      },
      context,
    );

    expect(result.value).toBe('parent');
  });

  it('edge: parent() outside nested context emits E013', () => {
    const context = createContext({}, [{ id: 'only' }]);

    register(
      context,
      'parent',
      { parameters: [{ name: 'path', type: 'string', required: true }], returnType: 'string' },
      () => 'UNEXPECTED',
    );

    const result = evaluate(
      {
        type: 'FunctionCall',
        name: 'parent',
        arguments: [{ type: 'StringLiteral', value: 'id', start: 0, end: 4 }],
        start: 0,
        end: 12,
      },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E013')).toBe(true);
  });

  it('edge: object template with nested function values', () => {
    const context = createContext();

    register(
      context,
      'upper',
      { parameters: [{ name: 'value', type: 'string', required: true }], returnType: 'string' },
      (args) => String(args[0]).toUpperCase(),
    );

    const result = evaluate(
      {
        type: 'ObjectTemplate',
        properties: [
          {
            key: 'name',
            value: {
              type: 'FunctionCall',
              name: 'upper',
              arguments: [{ type: 'StringLiteral', value: 'ada', start: 0, end: 5 }],
              start: 0,
              end: 11,
            },
            start: 0,
            end: 11,
          },
        ],
        start: 0,
        end: 20,
      },
      context,
    );

    expect(result.value).toEqual({ name: 'ADA' });
  });

  it('edge: implementation throws and evaluator returns null + diagnostic', () => {
    const context = createContext();

    register(
      context,
      'explode',
      { parameters: [], returnType: 'string' },
      () => {
        throw new Error('boom');
      },
    );

    const result = evaluate(
      { type: 'FunctionCall', name: 'explode', arguments: [], start: 0, end: 9 },
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E002')).toBe(true);
  });
});
