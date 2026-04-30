import { describe, expect, it } from 'vitest';

import {
  createRegistry,
  parse,
  type FunctionImplementation,
  type FunctionSignature,
} from '../../../src/engine/index.js';

function registerFunction(
  registry: ReturnType<typeof createRegistry>,
  name: string,
  signature: FunctionSignature,
): void {
  const implementation: FunctionImplementation = (args) => args[0];
  registry.registerFunction(name, signature, implementation);
}

function nestedExpression(levels: number): string {
  let expression = '"x"';
  for (let index = 0; index < levels; index += 1) {
    expression = `f(${expression})`;
  }

  return expression;
}

describe('parse()', () => {
  it('AE-01: parses a simple string literal', () => {
    const result = parse('"hello world"');

    expect(result).toEqual({
      success: true,
      ast: {
        type: 'StringLiteral',
        value: 'hello world',
        start: 0,
        end: 13,
      },
      diagnostics: [],
    });
  });

  it('AE-02: parses a simple function call with path argument', () => {
    const result = parse('source("customer.firstName")');

    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toEqual({
      type: 'FunctionCall',
      name: 'source',
      arguments: [
        {
          type: 'StringLiteral',
          value: 'customer.firstName',
          start: 7,
          end: 27,
        },
      ],
      start: 0,
      end: 28,
    });
  });

  it('AE-03: parses nested function calls (3+ levels)', () => {
    const result = parse('default(upper(source("customer.loyaltyTier")), "STANDARD")');

    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      type: 'FunctionCall',
      name: 'default',
      arguments: [
        {
          type: 'FunctionCall',
          name: 'upper',
          arguments: [
            {
              type: 'FunctionCall',
              name: 'source',
              arguments: [
                {
                  type: 'StringLiteral',
                  value: 'customer.loyaltyTier',
                },
              ],
            },
          ],
        },
        {
          type: 'StringLiteral',
          value: 'STANDARD',
        },
      ],
    });
  });

  it('AE-04: parses object templates with mixed values', () => {
    const result = parse('map(source("items"), { "sku": item("sku"), "price": item("unitPrice") })');

    expect(result.success).toBe(true);
    expect(result.ast).toMatchObject({
      type: 'FunctionCall',
      name: 'map',
      arguments: [
        {
          type: 'FunctionCall',
          name: 'source',
        },
        {
          type: 'ObjectTemplate',
          properties: [
            {
              key: 'sku',
              value: {
                type: 'FunctionCall',
                name: 'item',
              },
            },
            {
              key: 'price',
              value: {
                type: 'FunctionCall',
                name: 'item',
              },
            },
          ],
        },
      ],
    });
  });

  it('AE-05: parses all literal types', () => {
    expect(parse('"USD"').ast).toMatchObject({ type: 'StringLiteral', value: 'USD' });
    expect(parse('42').ast).toMatchObject({ type: 'NumberLiteral', value: 42 });
    expect(parse('3.14').ast).toMatchObject({ type: 'NumberLiteral', value: 3.14 });
    expect(parse('-100').ast).toMatchObject({ type: 'NumberLiteral', value: -100 });
    expect(parse('true').ast).toMatchObject({ type: 'BooleanLiteral', value: true });
    expect(parse('false').ast).toMatchObject({ type: 'BooleanLiteral', value: false });
    expect(parse('null').ast).toMatchObject({ type: 'NullLiteral' });
  });

  it('AE-06: resolves escape sequences in string literals', () => {
    const result = parse('"line1\\nline2\\ttab\\\\slash\\\"quote"');

    expect(result.success).toBe(true);
    expect(result.ast).toEqual({
      type: 'StringLiteral',
      value: 'line1\nline2\ttab\\slash"quote',
      start: 0,
      end: 33,
    });
  });

  it('AE-07: emits E001 for unclosed parenthesis', () => {
    const result = parse('source("customer.name"');

    expect(result.success).toBe(false);
    expect(result.ast).toBeNull();
    expect(result.diagnostics[0]?.code).toBe('KEYRA-E001');
    expect(result.diagnostics[0]?.message).toContain("expected ')'");
  });

  it('AE-08: emits E002 for unknown function with registry but keeps success', () => {
    const registry = createRegistry();
    const result = parse('unknownFunc("x")', { registry });

    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('FunctionCall');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E002')).toBe(true);
  });

  it('AE-09: emits E003 for wrong arity with registry but keeps success', () => {
    const registry = createRegistry();
    registerFunction(registry, 'concat', {
      parameters: [
        { name: 'a', type: 'string', required: true },
        { name: 'b', type: 'string', required: true },
      ],
      returnType: 'string',
    });

    const result = parse('concat("a")', { registry });

    expect(result.success).toBe(true);
    expect(result.ast?.type).toBe('FunctionCall');
    const arityDiagnostic = result.diagnostics.find((diagnostic) => diagnostic.code === 'KEYRA-E003');
    expect(arityDiagnostic?.message).toContain('expected 2, got 1');
  });

  it('AE-10: emits E004 when max depth is exceeded', () => {
    const atLimit = parse(nestedExpression(31));
    const beyondLimit = parse(nestedExpression(32));

    expect(atLimit.success).toBe(true);
    expect(beyondLimit.success).toBe(false);
    expect(beyondLimit.ast).toBeNull();
    expect(beyondLimit.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E004')).toBe(true);
  });

  it('AE-11: is whitespace-insensitive between tokens', () => {
    const compact = parse('source("customer.name")');
    const spaced = parse('  source(  "customer.name"  )  ');

    expect(spaced.success).toBe(true);
    expect(spaced.ast).toMatchObject({
      type: 'FunctionCall',
      name: 'source',
      arguments: [
        {
          type: 'StringLiteral',
          value: 'customer.name',
        },
      ],
    });
    expect(compact.ast).toMatchObject({
      type: 'FunctionCall',
      name: 'source',
      arguments: [
        {
          type: 'StringLiteral',
          value: 'customer.name',
        },
      ],
    });
  });

  it('AE-12: returns E001 on empty input', () => {
    const result = parse('');

    expect(result.success).toBe(false);
    expect(result.ast).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
  });

  it('AE-13: rejects trailing comma with E001', () => {
    const result = parse('concat("a", "b",)');

    expect(result.success).toBe(false);
    expect(result.ast).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
  });

  it('AE-14: tracks start/end offsets accurately', () => {
    const result = parse('concat("hello", source("name"))');

    expect(result.success).toBe(true);
    const root = result.ast;
    expect(root).not.toBeNull();
    expect(root?.type).toBe('FunctionCall');
    if (root?.type !== 'FunctionCall') {
      return;
    }

    expect(root.start).toBe(0);
    expect(root.end).toBe(31);

    const firstArg = root.arguments[0];
    expect(firstArg).toMatchObject({
      type: 'StringLiteral',
      start: 7,
      end: 14,
    });

    const secondArg = root.arguments[1];
    expect(secondArg).toMatchObject({
      type: 'FunctionCall',
      start: 16,
      end: 30,
    });

    if (secondArg?.type === 'FunctionCall') {
      expect(secondArg.arguments[0]).toMatchObject({
        type: 'StringLiteral',
        start: 23,
        end: 29,
      });
    }
  });

  it('covers E001 edge cases: whitespace-only, bare identifier, non-string object key', () => {
    const whitespaceOnly = parse('   \t\n  ');
    const bareIdentifier = parse('source');
    const nonStringKey = parse('{ 42: "x" }');

    expect(whitespaceOnly.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
    expect(bareIdentifier.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
    expect(nonStringKey.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E001')).toBe(true);
  });

  it('is deterministic: same input yields same parse result', () => {
    const expression = 'default(upper(source("customer.loyaltyTier")), "STANDARD")';

    const first = parse(expression);
    const second = parse(expression);

    expect(second).toEqual(first);
  });
});
