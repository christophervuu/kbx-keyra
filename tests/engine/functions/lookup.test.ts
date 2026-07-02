import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerLookupFunctions } from '../../../src/engine/functions/lookup.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(currentRule?: EvaluationContext['currentRule']): EvaluationContext {
  const registry = createRegistry();
  registerLookupFunctions(registry);

  const context: EvaluationContext = {
    sourceData: {},
    scopeStack: [],
    constants: {},
    externalSources: {},
    registry,
    options: {},
    currentRule,
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

  it('keeps default exact matching when match mode is omitted', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'WEB', start: 0, end: 0 },
        objectNode([{ key: 'web', value: { type: 'StringLiteral', value: 'WEB_PORTAL', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('UNKNOWN');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });

  it('supports ignore-case explicit match mode for inline mappings', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'CONFIRMED', start: 0, end: 0 },
        objectNode([
          { key: 'confirmed', value: { type: 'StringLiteral', value: 'In_Progress', start: 0, end: 0 } },
        ]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignore-case', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('In_Progress');
    expect(result.diagnostics).toEqual([]);
  });

  it('emits E068 for invalid valueMap match mode and returns null', () => {
    const context = createContext();

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'confirmed', start: 0, end: 0 },
        objectNode([{ key: 'confirmed', value: { type: 'StringLiteral', value: 'OPEN', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'fuzzy', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-E068',
        location: expect.objectContaining({ function: 'valueMap', argumentIndex: 3 }),
      }),
    );
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

  it('supports valueTable(...) accessor against current rule resolved entries', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [
          { in: 'confirmed', out: 'OPEN', rowId: 'r1' },
          { in: 'shipped', out: 'COMPLETED', rowId: 'r2' },
        ],
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'confirmed', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('OPEN');
    expect(result.diagnostics).toEqual([]);
  });

  it('uses reusable value table matchMode metadata when valueMap argument is omitted', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        matchMode: 'ignore-case',
        resolvedEntries: [{ in: 'confirmed', out: 'In_Progress', rowId: 'r1' }],
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'CONFIRMED', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('In_Progress');
    expect(result.diagnostics).toEqual([]);
  });

  it('allows explicit valueMap match mode to override reusable value table metadata', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression:
        'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN", "exact")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        matchMode: 'ignore-case',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'CONFIRMED', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'exact', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('UNKNOWN');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });

  it('uses locale-independent ignore-case normalization fixtures for accented, Turkish I/İ, and ß behavior', () => {
    const context = createContext();

    const accented = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'ÄPFEL', start: 0, end: 0 },
        objectNode([{ key: 'äpfel', value: { type: 'StringLiteral', value: 'accented-ok', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignore-case', start: 0, end: 0 },
      ]),
      context,
    );

    const turkishCapitalDottedI = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'İ', start: 0, end: 0 },
        objectNode([{ key: 'i̇', value: { type: 'StringLiteral', value: 'turkish-i-dot', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignore-case', start: 0, end: 0 },
      ]),
      context,
    );

    const turkishDotlessI = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'I', start: 0, end: 0 },
        objectNode([{ key: 'ı', value: { type: 'StringLiteral', value: 'dotless', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignore-case', start: 0, end: 0 },
      ]),
      context,
    );

    const sharpS = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'STRASSE', start: 0, end: 0 },
        objectNode([{ key: 'straße', value: { type: 'StringLiteral', value: 'eszett', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        { type: 'StringLiteral', value: 'ignore-case', start: 0, end: 0 },
      ]),
      context,
    );

    expect(accented.value).toBe('accented-ok');
    expect(turkishCapitalDottedI.value).toBe('turkish-i-dot');
    expect(turkishDotlessI.value).toBe('missing');
    expect(sharpS.value).toBe('missing');
  });

  it('respects noMatchBehavior return_input for project value table refs', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
      noMatchBehavior: {
        mode: 'return_input',
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('missing');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });

  it('respects noMatchBehavior return_null for project value table refs and keeps diagnostic context', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
      noMatchBehavior: {
        mode: 'return_null',
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-W003',
        location: expect.objectContaining({ function: 'valueMap', argumentIndex: 0 }),
      }),
    );
  });

  it('respects noMatchBehavior fallback_value for project value table refs', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), valueTable("order-status", "oms", "cdm"), "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
      noMatchBehavior: {
        mode: 'fallback_value',
        fallbackValue: 'NOT_MAPPED',
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'missing', start: 0, end: 0 },
        {
          type: 'FunctionCall',
          name: 'valueTable',
          arguments: [
            { type: 'StringLiteral', value: 'order-status', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'oms', start: 0, end: 0 },
            { type: 'StringLiteral', value: 'cdm', start: 0, end: 0 },
          ],
          start: 0,
          end: 0,
        },
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('NOT_MAPPED');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W003')).toBe(true);
  });

  it('keeps inline object-literal valueMap behavior even when rule has project value-table metadata', () => {
    const context = createContext({
      target: 'Order.status',
      type: 'string',
      expression: 'valueMap(source("status"), {"A":"ACTIVE"}, "UNKNOWN")',
      valueTableRef: {
        scope: 'project',
        valueTableId: 'vt_123',
        tableKey: 'order-status',
        revision: 4,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'r1' }],
      },
    });

    const result = evaluate(
      callValueMap([
        { type: 'StringLiteral', value: 'A', start: 0, end: 0 },
        objectNode([{ key: 'A', value: { type: 'StringLiteral', value: 'ACTIVE', start: 0, end: 0 } }]),
        { type: 'StringLiteral', value: 'UNKNOWN', start: 0, end: 0 },
      ]),
      context,
    );

    expect(result.value).toBe('ACTIVE');
    expect(result.diagnostics).toEqual([]);
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
