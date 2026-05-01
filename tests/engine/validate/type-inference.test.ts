import { describe, expect, it } from 'vitest';

import { parse } from '../../../src/engine/dsl/index.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { defaultRegistry } from '../../../src/engine/registry/function-registry.js';
import { buildSchemaTree } from '../../../src/engine/validate/index.js';
import { inferType } from '../../../src/engine/validate/type-inference.js';

function parseAst(expression: string) {
  const parsed = parse(expression, { registry: defaultRegistry });
  if (!parsed.ast) {
    throw new Error(`Expected AST for expression: ${expression}`);
  }
  return parsed.ast;
}

describe('inferType', () => {
  registerAllFunctions(defaultRegistry);

  const sourceSchema = buildSchemaTree({
    type: 'object',
    properties: {
      customer: {
        type: 'object',
        properties: {
          age: { type: 'number' },
          name: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              nested: { type: 'string' },
            },
          },
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            price: { type: 'number' },
            name: { type: 'string' },
          },
        },
      },
    },
  });

  const baseContext = {
    registry: defaultRegistry,
    sourceSchema,
    arrayDepth: 0,
  } as const;

  it('infers primitive literal types', () => {
    expect(inferType(parseAst('"hello"'), baseContext)).toBe('string');
    expect(inferType(parseAst('42'), baseContext)).toBe('number');
    expect(inferType(parseAst('true'), baseContext)).toBe('boolean');
    expect(inferType(parseAst('null'), baseContext)).toBe('null');
  });

  it('infers object template type', () => {
    expect(inferType(parseAst('{"a": "b"}'), baseContext)).toBe('object');
  });

  it('infers source() from schema path type', () => {
    expect(inferType(parseAst('source("customer.age")'), baseContext)).toBe('number');
    expect(inferType(parseAst('source("customer.name")'), baseContext)).toBe('string');
    expect(inferType(parseAst('source("customer.data")'), baseContext)).toBe('object');
  });

  it('returns any for source() path missing in schema', () => {
    expect(inferType(parseAst('source("customer.unknown")'), baseContext)).toBe('any');
  });

  it('infers cast() target type', () => {
    expect(inferType(parseAst('cast(source("customer.age"), "string")'), baseContext)).toBe(
      'string',
    );
  });

  it('infers return type from registry for non-any signatures', () => {
    expect(inferType(parseAst('concat("a", "b")'), baseContext)).toBe('string');
    expect(inferType(parseAst('add(1, 2)'), baseContext)).toBe('number');
    expect(inferType(parseAst('gt(2, 1)'), baseContext)).toBe('boolean');
  });

  it('infers map/filter as array', () => {
    expect(inferType(parseAst('map(source("items"), item("name"))'), baseContext)).toBe('array');
    expect(inferType(parseAst('filter(source("items"), gt(item("price"), 100))'), baseContext)).toBe(
      'array',
    );
  });

  it('infers find as any', () => {
    expect(inferType(parseAst('find(source("items"), gt(item("price"), 100))'), baseContext)).toBe(
      'any',
    );
  });

  it('infers if() by branch unification', () => {
    expect(inferType(parseAst('if(true, "a", "b")'), baseContext)).toBe('string');
    expect(inferType(parseAst('if(true, "a", 1)'), baseContext)).toBe('any');
  });

  it('infers static() from argument literal type', () => {
    expect(inferType(parseAst('static("x")'), baseContext)).toBe('string');
    expect(inferType(parseAst('static(123)'), baseContext)).toBe('number');
  });

  it('returns undefined for unknown function', () => {
    expect(inferType(parseAst('unknownFn("x")'), baseContext)).toBeUndefined();
  });

  it('returns undefined for registry any-return functions without special override', () => {
    expect(inferType(parseAst('default("x", "y")'), baseContext)).toBeUndefined();
    expect(inferType(parseAst('coalesce("x", "y")'), baseContext)).toBeUndefined();
  });
});
