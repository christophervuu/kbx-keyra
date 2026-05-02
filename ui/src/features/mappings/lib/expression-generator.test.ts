import { describe, expect, it } from 'vitest';
import {
  generateExpression,
  generateObjectTemplate,
  makeSourceArg,
  makeItemArg,
  makeParentArg,
  makeLiteralArg,
  makeNestedArg,
  makeObjectTemplateArg,
  type BuilderState,
  type ObjectTemplateField,
} from './expression-generator';

describe('generateExpression', () => {
  it('direct copy — source() with literal path argument', () => {
    const state: BuilderState = {
      functionName: 'source',
      arguments: [makeLiteralArg('order.name')],
    };
    expect(generateExpression(state)).toBe('source("order.name")');
  });

  it('static string value', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg('hello')],
    };
    expect(generateExpression(state)).toBe('static("hello")');
  });

  it('static number value', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg(42)],
    };
    expect(generateExpression(state)).toBe('static(42)');
  });

  it('static float value', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg(3.14)],
    };
    expect(generateExpression(state)).toBe('static(3.14)');
  });

  it('static boolean true', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg(true)],
    };
    expect(generateExpression(state)).toBe('static(true)');
  });

  it('static boolean false', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg(false)],
    };
    expect(generateExpression(state)).toBe('static(false)');
  });

  it('static null', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg(null)],
    };
    expect(generateExpression(state)).toBe('static(null)');
  });

  it('concat with 3 source arguments', () => {
    const state: BuilderState = {
      functionName: 'concat',
      arguments: [
        makeSourceArg('firstName'),
        makeSourceArg('lastName'),
        makeLiteralArg(' '),
      ],
    };
    expect(generateExpression(state)).toBe(
      'concat(source("firstName"), source("lastName"), " ")',
    );
  });

  it('concat with 4 variadic arguments', () => {
    const state: BuilderState = {
      functionName: 'concat',
      arguments: [
        makeSourceArg('a'),
        makeSourceArg('b'),
        makeSourceArg('c'),
        makeLiteralArg('-'),
      ],
    };
    expect(generateExpression(state)).toBe(
      'concat(source("a"), source("b"), source("c"), "-")',
    );
  });

  it('nested function — if with eq inner call', () => {
    const eq: BuilderState = {
      functionName: 'eq',
      arguments: [makeSourceArg('x'), makeLiteralArg(10)],
    };
    const state: BuilderState = {
      functionName: 'if',
      arguments: [
        makeNestedArg(eq),
        makeLiteralArg('yes'),
        makeLiteralArg('no'),
      ],
    };
    expect(generateExpression(state)).toBe(
      'if(eq(source("x"), 10), "yes", "no")',
    );
  });

  it('deeply nested — if(eq(source("x"), 10), static("yes"), static("no")) pattern', () => {
    const eq: BuilderState = {
      functionName: 'eq',
      arguments: [makeSourceArg('x'), makeLiteralArg(10)],
    };
    const staticYes: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg('yes')],
    };
    const staticNo: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg('no')],
    };
    const state: BuilderState = {
      functionName: 'if',
      arguments: [
        makeNestedArg(eq),
        makeNestedArg(staticYes),
        makeNestedArg(staticNo),
      ],
    };
    expect(generateExpression(state)).toBe(
      'if(eq(source("x"), 10), static("yes"), static("no"))',
    );
  });

  it('escapes double quotes in string literals', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg('say "hello"')],
    };
    expect(generateExpression(state)).toBe('static("say \\"hello\\"")');
  });

  it('escapes backslashes in string literals', () => {
    const state: BuilderState = {
      functionName: 'static',
      arguments: [makeLiteralArg('C:\\path')],
    };
    expect(generateExpression(state)).toBe('static("C:\\\\path")');
  });

  it('zero-argument function produces empty parens', () => {
    const state: BuilderState = {
      functionName: 'now',
      arguments: [],
    };
    expect(generateExpression(state)).toBe('now()');
  });

  it('source arg produces source("path") sub-expression', () => {
    const state: BuilderState = {
      functionName: 'upper',
      arguments: [makeSourceArg('order.customer.name')],
    };
    expect(generateExpression(state)).toBe('upper(source("order.customer.name"))');
  });
});

// ---------------------------------------------------------------------------
// item() / parent() argument kinds
// ---------------------------------------------------------------------------

describe('item and parent args', () => {
  it('item arg produces item("path")', () => {
    const state: BuilderState = {
      functionName: 'upper',
      arguments: [makeItemArg('name')],
    };
    expect(generateExpression(state)).toBe('upper(item("name"))');
  });

  it('parent arg produces parent("path")', () => {
    const state: BuilderState = {
      functionName: 'upper',
      arguments: [makeParentArg('order.id')],
    };
    expect(generateExpression(state)).toBe('upper(parent("order.id"))');
  });
});

// ---------------------------------------------------------------------------
// generateObjectTemplate
// ---------------------------------------------------------------------------

describe('generateObjectTemplate', () => {
  it('empty fields returns {}', () => {
    expect(generateObjectTemplate([])).toBe('{}');
  });

  it('single field — item value', () => {
    const fields: ObjectTemplateField[] = [
      { key: 'name', value: makeItemArg('fullName') },
    ];
    expect(generateObjectTemplate(fields)).toBe('{ "name": item("fullName") }');
  });

  it('multiple fields', () => {
    const fields: ObjectTemplateField[] = [
      { key: 'sku', value: makeItemArg('sku') },
      { key: 'active', value: makeLiteralArg(true) },
    ];
    expect(generateObjectTemplate(fields)).toBe('{ "sku": item("sku"), "active": true }');
  });

  it('nested function value', () => {
    const concatState: BuilderState = {
      functionName: 'concat',
      arguments: [makeItemArg('first'), makeItemArg('last')],
    };
    const fields: ObjectTemplateField[] = [
      { key: 'full', value: makeNestedArg(concatState) },
    ];
    expect(generateObjectTemplate(fields)).toBe('{ "full": concat(item("first"), item("last")) }');
  });

  it('escapes key with double quotes', () => {
    const fields: ObjectTemplateField[] = [
      { key: 'my "key"', value: makeLiteralArg('val') },
    ];
    expect(generateObjectTemplate(fields)).toBe('{ "my \\"key\\"": "val" }');
  });
});

// ---------------------------------------------------------------------------
// object-template argument kind in generateExpression
// ---------------------------------------------------------------------------

describe('object-template in generateExpression', () => {
  it('map with template — single field', () => {
    const state: BuilderState = {
      functionName: 'map',
      arguments: [
        makeSourceArg('items'),
        makeObjectTemplateArg([{ key: 'sku', value: makeItemArg('sku') }]),
      ],
    };
    expect(generateExpression(state)).toBe('map(source("items"), { "sku": item("sku") })');
  });

  it('map with template — multiple fields', () => {
    const state: BuilderState = {
      functionName: 'map',
      arguments: [
        makeSourceArg('items'),
        makeObjectTemplateArg([
          { key: 'sku', value: makeItemArg('sku') },
          { key: 'label', value: makeItemArg('name') },
        ]),
      ],
    };
    expect(generateExpression(state)).toBe(
      'map(source("items"), { "sku": item("sku"), "label": item("name") })',
    );
  });

  it('filter with condition — eq', () => {
    const eq: BuilderState = {
      functionName: 'eq',
      arguments: [makeItemArg('status'), makeLiteralArg('active')],
    };
    const state: BuilderState = {
      functionName: 'filter',
      arguments: [makeSourceArg('items'), makeNestedArg(eq)],
    };
    expect(generateExpression(state)).toBe(
      'filter(source("items"), eq(item("status"), "active"))',
    );
  });

  it('map with nested concat in template value', () => {
    const concat: BuilderState = {
      functionName: 'concat',
      arguments: [makeItemArg('first'), makeLiteralArg(' '), makeItemArg('last')],
    };
    const state: BuilderState = {
      functionName: 'map',
      arguments: [
        makeSourceArg('people'),
        makeObjectTemplateArg([{ key: 'full', value: makeNestedArg(concat) }]),
      ],
    };
    expect(generateExpression(state)).toBe(
      'map(source("people"), { "full": concat(item("first"), " ", item("last")) })',
    );
  });
});
