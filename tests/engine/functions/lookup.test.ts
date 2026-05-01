import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerLookupFunctions } from '../../../src/engine/functions/lookup.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerLookupFunctions(registry);

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

function callValueMap(args: readonly AstNode[]): AstNode {
  return {
    type: 'FunctionCall',
    name: 'valueMap',
    arguments: args,
    start: 0,
    end: 1,
  };
}

function objectNode(properties: Array<{ key: string; value: AstNode }>): AstNode {
  return {
    type: 'ObjectTemplate',
    properties: properties.map((property) => ({
      key: property.key,
      value: property.value,
      start: 0,
      end: 0,
    })),
    start: 0,
    end: 1,
  };
}

describe('valueMap()', () => {
  it('AE-14: returns matching mapped value', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'web', start: 0, end: 0 },
        objectNode([
          { key: 'web', value: { type: 'StringLiteral', value: 'WEB_PORTAL', start: 0, end: 0 } },
          { key: 'store', value: { type: 'StringLiteral', value: 'RETAIL', start: 0, end: 0 } },
        ]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('WEB_PORTAL');
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-15: emits W003 and returns fallback when no match', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'mobile', start: 0, end: 0 },
        objectNode([
          { key: 'web', value: { type: 'StringLiteral', value: 'WEB_PORTAL', start: 0, end: 0 } },
        ]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('UNKNOWN');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-W003',
        severity: 'warning',
      }),
    );
  });

  it('returns null and W003 when no match and no fallback', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        objectNode([{ key: 'a', value: { type: 'StringLiteral', value: 'b', start: 0, end: 0 } }]),
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });

  it('returns fallback for null value and null when no fallback', () => {
    const context = createContext();

    const withFallback = evaluate(
      callValueMap([
        { type: 'NullLiteral', start: 0, end: 0 },
        objectNode([{ key: 'a', value: { type: 'StringLiteral', value: 'b', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'default', start: 0, end: 0 },
      ]),
      context,
    );

    const noFallback = evaluate(
      callValueMap([
        { type: 'NullLiteral', start: 0, end: 0 },
        objectNode([{ key: 'a', value: { type: 'StringLiteral', value: 'b', start: 0, end: 0 } }]),
      ]),
      context,
    );

    expect(withFallback.value).toBe('default');
    expect(withFallback.diagnostics).toEqual([]);
    expect(noFallback.value).toBeNull();
    expect(noFallback.diagnostics).toEqual([]);
  });

  it('emits E060 when mappings is not an object', () => {
    const context = createContext();

    const notObject = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'x', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'not-an-object', start: 0, end: 0 },
      ]),
      context,
    );

    const arrayMappings = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'x', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'makeArray',
          arguments: [],
          start: 0,
          end: 0,
        },
      ]),
      {
        ...context,
        registry: (() => {
          const registry = createRegistry();
          registerLookupFunctions(registry);
          registry.registerFunction(
            'makeArray',
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

    const nullMappings = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'x', start: 0, end: 0 },
        { type: 'NullLiteral', start: 0, end: 0 },
      ]),
      context,
    );

    expect(notObject.value).toBeNull();
    expect(notObject.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E060')).toBe(true);

    expect(arrayMappings.value).toBeNull();
    expect(arrayMappings.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E060')).toBe(true);

    expect(nullMappings.value).toBeNull();
    expect(nullMappings.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E060')).toBe(true);
  });

  it('converts input value to string for key lookup', () => {
    const context = createContext();

    const numericLookup = evaluate(
      callValueMap([
        { type: 'NumberLiteral', value: 42, start: 0, end: 0 },
        objectNode([{ key: '42', value: { type: 'StringLiteral', value: 'found', start: 0, end: 0 } }]),
      ]),
      context,
    );

    const booleanLookup = evaluate(
      callValueMap([
        { type: 'BooleanLiteral', value: true, start: 0, end: 0 },
        objectNode([{ key: 'true', value: { type: 'StringLiteral', value: 'yes', start: 0, end: 0 } }]),
      ]),
      context,
    );

    expect(numericLookup.value).toBe('found');
    expect(booleanLookup.value).toBe('yes');
    expect(numericLookup.diagnostics).toEqual([]);
    expect(booleanLookup.diagnostics).toEqual([]);
  });

  it('empty mappings object returns null and emits W003', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'x', start: 0, end: 0 },
        objectNode([]),
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });
});
