import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerTypeConversionFunctions } from '../../../src/engine/functions/type-conversion.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerTypeConversionFunctions(registry);

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

function callCast(args: readonly AstNode[]): AstNode {
  return {
    type: 'FunctionCall',
    name: 'cast',
    arguments: args,
    start: 0,
    end: 1,
  };
}

describe('cast()', () => {
  it('AE-05: supports representative matrix conversions', () => {
    const context = createContext();

    expect(
      evaluate(
        callCast([
          { type: 'NumberLiteral', value: 42, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe('42');

    expect(
      evaluate(
        callCast([
          { type: 'StringLiteral', value: '3.14', start: 0, end: 0 },
          { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(3.14);

    expect(
      evaluate(
        callCast([
          { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(false);

    expect(
      evaluate(
        callCast([
          { type: 'StringLiteral', value: 'true', start: 0, end: 0 },
          { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(true);

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(1);

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe('false');

    expect(
      evaluate(
        callCast([
          { type: 'NullLiteral', start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBeNull();
  });

  it('string -> number supports valid numerics and rejects invalid values', () => {
    const context = createContext();

    const validInt = evaluate(
      callCast([
        { type: 'StringLiteral', value: '42', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );
    const validFloat = evaluate(
      callCast([
        { type: 'StringLiteral', value: '3.14', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );
    const invalidAlpha = evaluate(
      callCast([
        { type: 'StringLiteral', value: 'abc', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );
    const invalidEmpty = evaluate(
      callCast([
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );
    const invalidPartial = evaluate(
      callCast([
        { type: 'StringLiteral', value: '123abc', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );

    expect(validInt.value).toBe(42);
    expect(validFloat.value).toBe(3.14);

    expect(invalidAlpha.value).toBeNull();
    expect(invalidAlpha.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E020')).toBe(true);

    expect(invalidEmpty.value).toBeNull();
    expect(invalidEmpty.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E020')).toBe(true);

    expect(invalidPartial.value).toBeNull();
    expect(invalidPartial.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E020')).toBe(true);
  });

  it('string -> boolean follows spec rules', () => {
    const context = createContext();

    const asTrue = evaluate(
      callCast([
        { type: 'StringLiteral', value: 'true', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
      ]),
      context,
    );
    const asFalseLiteral = evaluate(
      callCast([
        { type: 'StringLiteral', value: 'false', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
      ]),
      context,
    );
    const asFalseEmpty = evaluate(
      callCast([
        { type: 'StringLiteral', value: '', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
      ]),
      context,
    );
    const asTrueOther = evaluate(
      callCast([
        { type: 'StringLiteral', value: 'anything', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
      ]),
      context,
    );

    expect(asTrue.value).toBe(true);
    expect(asFalseLiteral.value).toBe(false);
    expect(asFalseEmpty.value).toBe(false);
    expect(asTrueOther.value).toBe(true);
  });

  it('number conversions work for string and boolean targets', () => {
    const context = createContext();

    expect(
      evaluate(
        callCast([
          { type: 'NumberLiteral', value: 3.14, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe('3.14');

    expect(
      evaluate(
        callCast([
          { type: 'NumberLiteral', value: 0, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(false);

    expect(
      evaluate(
        callCast([
          { type: 'NumberLiteral', value: -1, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(true);
  });

  it('boolean conversions work for string and number targets', () => {
    const context = createContext();

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe('true');

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe('false');

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(1);

    expect(
      evaluate(
        callCast([
          { type: 'BooleanLiteral', value: false, start: 0, end: 0 },
          { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
        ]),
        context,
      ).value,
    ).toBe(0);
  });

  it('null passthrough for all target types has no diagnostics', () => {
    const context = createContext();

    const asString = evaluate(
      callCast([
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
      ]),
      context,
    );
    const asNumber = evaluate(
      callCast([
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );
    const asBoolean = evaluate(
      callCast([
        { type: 'NullLiteral', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'boolean', start: 0, end: 0 },
      ]),
      context,
    );

    expect(asString.value).toBeNull();
    expect(asNumber.value).toBeNull();
    expect(asBoolean.value).toBeNull();
    expect(asString.diagnostics).toEqual([]);
    expect(asNumber.diagnostics).toEqual([]);
    expect(asBoolean.diagnostics).toEqual([]);
  });

  it('AE-06: emits E020 for unsupported casts (array/object)', () => {
    const context = createContext();

    const arrayInput = evaluate(
      callCast([
        {
          type: 'FunctionCall',
          name: 'static',
          arguments: [],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
      ]),
      {
        ...context,
        registry: (() => {
          const registry = createRegistry();
          registerTypeConversionFunctions(registry);
          registry.registerFunction(
            'static',
            {
              parameters: [],
              returnType: 'array',
            },
            () => [1, 2, 3],
          );
          return registry;
        })(),
      },
    );

    const objectInput = evaluate(
      callCast([
        {
          type: 'FunctionCall',
          name: 'staticObject',
          arguments: [],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      {
        ...context,
        registry: (() => {
          const registry = createRegistry();
          registerTypeConversionFunctions(registry);
          registry.registerFunction(
            'staticObject',
            {
              parameters: [],
              returnType: 'object',
            },
            () => ({ a: 1 }),
          );
          return registry;
        })(),
      },
    );

    expect(arrayInput.value).toBeNull();
    expect(arrayInput.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E020')).toBe(true);

    expect(objectInput.value).toBeNull();
    expect(objectInput.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E020')).toBe(true);
  });

  it('no-op when from type equals target type', () => {
    const context = createContext();

    const sameNumber = evaluate(
      callCast([
        { type: 'NumberLiteral', value: 42, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'number', start: 0, end: 0 },
      ]),
      context,
    );

    const sameString = evaluate(
      callCast([
        { type: 'StringLiteral', value: 'hello', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'string', start: 0, end: 0 },
      ]),
      context,
    );

    expect(sameNumber.value).toBe(42);
    expect(sameString.value).toBe('hello');
    expect(sameNumber.diagnostics).toEqual([]);
    expect(sameString.diagnostics).toEqual([]);
  });

  it('emits E021 for unknown target type', () => {
    const context = createContext();

    const result = evaluate(
      callCast([
        { type: 'NumberLiteral', value: 42, start: 0, end: 0 },
        { type: 'StringLiteral', value: 'invalid', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E021')).toBe(true);
  });
});
