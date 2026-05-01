import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerSourceAccessFunctions } from '../../../src/engine/functions/source-access.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';
import type { EngineOptions } from '../../../src/engine/types/index.js';

function createContext(params?: {
  sourceData?: unknown;
  constants?: Readonly<Record<string, unknown>>;
  externalSources?: Readonly<Record<string, unknown>>;
  scopeStack?: unknown[];
  options?: EngineOptions;
}): EvaluationContext {
  const registry = createRegistry();
  registerSourceAccessFunctions(registry);

  const context: EvaluationContext = {
    sourceData: params?.sourceData ?? {},
    scopeStack: params?.scopeStack ?? [],
    constants: params?.constants ?? {},
    externalSources: params?.externalSources ?? {},
    registry,
    options: params?.options ?? {},
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

describe('source access functions', () => {
  it('AE-01: source() reads nested path from source data', () => {
    const context = createContext({
      sourceData: {
        customer: {
          firstName: 'Christopher',
        },
      },
    });

    const result = evaluate(
      call('source', [{ type: 'StringLiteral', value: 'customer.firstName', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBe('Christopher');
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-02: source() emits W002 when resolved value is null', () => {
    const context = createContext({
      sourceData: {
        customer: {
          firstName: 'Christopher',
          middleName: null,
        },
      },
    });

    const result = evaluate(
      call('source', [{ type: 'StringLiteral', value: 'customer.middleName', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-W002',
        severity: 'warning',
      }),
    );
  });

  it('source() returns root object for empty path', () => {
    const sourceData = {
      customer: {
        firstName: 'Christopher',
      },
    };
    const context = createContext({ sourceData });

    const result = evaluate(
      call('source', [{ type: 'StringLiteral', value: '', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toEqual(sourceData);
    expect(result.diagnostics).toEqual([]);
  });

  it('item() resolves path from current item', () => {
    const context = createContext({
      scopeStack: [
        {
          sku: 'ABC-123',
          details: {
            quantity: 2,
          },
        },
      ],
    });

    const result = evaluate(
      call('item', [{ type: 'StringLiteral', value: 'details.quantity', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBe(2);
    expect(result.diagnostics).toEqual([]);
  });

  it('parent() resolves path from parent item', () => {
    const context = createContext({
      scopeStack: [
        {
          orderId: 'ORD-1',
        },
        {
          line: 1,
        },
      ],
    });

    const result = evaluate(
      call('parent', [{ type: 'StringLiteral', value: 'orderId', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBe('ORD-1');
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-03: constant() returns configured value', () => {
    const context = createContext({
      constants: {
        COMPANY_CODE: 'ACME',
      },
    });

    const result = evaluate(
      call('constant', [{ type: 'StringLiteral', value: 'COMPANY_CODE', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBe('ACME');
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-04: constant() emits E011 for undefined constant', () => {
    const context = createContext({
      constants: {
        COMPANY_CODE: 'ACME',
      },
    });

    const result = evaluate(
      call('constant', [{ type: 'StringLiteral', value: 'UNDEFINED_KEY', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-E011',
        severity: 'error',
      }),
    );
  });

  it('constant() returns null when constant exists with null value', () => {
    const context = createContext({
      constants: {
        NULLABLE_KEY: null,
      },
    });

    const result = evaluate(
      call('constant', [{ type: 'StringLiteral', value: 'NULLABLE_KEY', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it('external() returns available external source', () => {
    const carrierLookup = { UPS: 'United Parcel Service' };
    const context = createContext({
      externalSources: {
        carrierLookup,
      },
    });

    const result = evaluate(
      call('external', [{ type: 'StringLiteral', value: 'carrierLookup', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toEqual(carrierLookup);
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-23: external() emits E012 for unavailable source', () => {
    const context = createContext({ externalSources: {} });

    const result = evaluate(
      call('external', [{ type: 'StringLiteral', value: 'carrierLookup', start: 0, end: 0 }]),
      context,
    );

    expect(result.value).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'KEYRA-E012',
        severity: 'warning',
      }),
    );
  });

  it('AE-24: static() returns value unchanged for all value types', () => {
    const context = createContext();

    const stringResult = evaluate(
      call('static', [{ type: 'StringLiteral', value: 'KEYRA_DEMO', start: 0, end: 0 }]),
      context,
    );
    const numberResult = evaluate(
      call('static', [{ type: 'NumberLiteral', value: 42, start: 0, end: 0 }]),
      context,
    );
    const booleanResult = evaluate(
      call('static', [{ type: 'BooleanLiteral', value: true, start: 0, end: 0 }]),
      context,
    );
    const nullResult = evaluate(call('static', [{ type: 'NullLiteral', start: 0, end: 0 }]), context);

    expect(stringResult.value).toBe('KEYRA_DEMO');
    expect(numberResult.value).toBe(42);
    expect(booleanResult.value).toBe(true);
    expect(nullResult.value).toBeNull();

    expect(stringResult.diagnostics).toEqual([]);
    expect(numberResult.diagnostics).toEqual([]);
    expect(booleanResult.diagnostics).toEqual([]);
    expect(nullResult.diagnostics).toEqual([]);
  });
});
