import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import { parse } from '../../../src/engine/dsl/index.js';
import { registerArrayFunctions } from '../../../src/engine/functions/arrays.js';
import { registerConditionalFunctions } from '../../../src/engine/functions/conditional.js';
import { registerMathFunctions } from '../../../src/engine/functions/math.js';
import { registerNullHandlingFunctions } from '../../../src/engine/functions/null-handling.js';
import { registerSourceAccessFunctions } from '../../../src/engine/functions/source-access.js';
import { registerStringFunctions } from '../../../src/engine/functions/string.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';
import type { EvaluationContext } from '../../../src/engine/dsl/types.js';

function createContext(sourceData: unknown, externalSources: Readonly<Record<string, unknown>> = {}): EvaluationContext {
  const registry = createRegistry();
  registerSourceAccessFunctions(registry);
  registerArrayFunctions(registry);
  registerConditionalFunctions(registry);
  registerNullHandlingFunctions(registry);
  registerMathFunctions(registry);
  registerStringFunctions(registry);

  const context: EvaluationContext = {
    sourceData,
    scopeStack: [],
    constants: {},
    externalSources,
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

function evalExpression(expression: string, sourceData: unknown, externalSources: Readonly<Record<string, unknown>> = {}) {
  const context = createContext(sourceData, externalSources);
  const parsed = parse(expression, { registry: context.registry });

  expect(parsed.success).toBe(true);
  expect(parsed.ast).not.toBeNull();

  return evaluate(parsed.ast!, context);
}

const OBJECT_FIELDS_PRIMARY_EXPRESSION =
  'map(filter(map(array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"), {"day": item(""), "value": get(source("DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day"), "isOpen": item("value.IsOpen"), "beginTime": item("value.BeginTime")})';

const OBJECT_FIELDS_ENRICHMENT_EXPRESSION =
  'map(filter(map(array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"), {"day": item(""), "value": get(get(external("hours"), "DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day"), "isOpen": item("value.IsOpen"), "beginTime": item("value.BeginTime")})';

const WEEKLY_OBJECT = {
  Sunday: { BeginTime: '09:00', IsOpen: true },
  Monday: { BeginTime: '10:00', IsOpen: false },
  Tuesday: { BeginTime: '11:00', IsOpen: true },
  Wednesday: { BeginTime: '12:00', IsOpen: true },
  Thursday: { BeginTime: '13:00', IsOpen: true },
  Friday: { BeginTime: '14:00', IsOpen: true },
  Saturday: { BeginTime: '15:00', IsOpen: true },
};

describe('array functions - map()', () => {
  it('AE-01: maps array using object template mode', () => {
    const result = evalExpression(
      'map(source("items"), {"code": item("sku"), "label": item("name")})',
      {
        items: [
          { sku: 'A', name: 'Alpha' },
          { sku: 'B', name: 'Beta' },
        ],
      },
    );

    expect(result.value).toEqual([
      { code: 'A', label: 'Alpha' },
      { code: 'B', label: 'Beta' },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-02: maps primitive array using expression mode', () => {
    const result = evalExpression('map(source("tags"), item(""))', {
      tags: ['gift', 'priority'],
    });

    expect(result.value).toEqual(['gift', 'priority']);
  });

  it('AE-03: null array returns null', () => {
    const result = evalExpression('map(source("items"), {"x": item("y")})', {
      items: null,
    });

    expect(result.value).toBeNull();
  });

  it('returns empty array for empty input array', () => {
    const result = evalExpression('map(source("items"), item("sku"))', {
      items: [],
    });

    expect(result.value).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-11: source() inside map template reads from root source', () => {
    const result = evalExpression(
      'map(source("items"), {"sku": item("sku"), "order": source("orderId")})',
      {
        orderId: 'ORD-1',
        items: [{ sku: 'A' }],
      },
    );

    expect(result.value).toEqual([{ sku: 'A', order: 'ORD-1' }]);
  });

  it('AE-09: nested map supports parent() from outer element', () => {
    const result = evalExpression(
      'map(source("departments"), {"staff": map(item("employees"), {"empId": item("id"), "dept": parent("name")})})',
      {
        departments: [
          {
            name: 'Eng',
            employees: [{ id: 1 }, { id: 2 }],
          },
        ],
      },
    );

    expect(result.value).toEqual([
      {
        staff: [
          { empId: 1, dept: 'Eng' },
          { empId: 2, dept: 'Eng' },
        ],
      },
    ]);
  });

  it('AE-10: parent() in single-level map yields E013 and null value', () => {
    const result = evalExpression('map(source("items"), {"bad": parent("x")})', {
      items: [{ x: 1 }],
    });

    expect(result.value).toEqual([{ bad: null }]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E013')).toBe(true);
  });

  it('AE-12: scope is fully popped after map completes', () => {
    const context = createContext({ items: [{ x: 1 }] });
    const mapAst = parse('map(source("items"), item("x"))', { registry: context.registry }).ast;
    const itemAst = parse('item("x")', { registry: context.registry }).ast;

    expect(mapAst).not.toBeNull();
    expect(itemAst).not.toBeNull();

    const mapResult = evaluate(mapAst!, context);
    expect(mapResult.value).toEqual([1]);
    expect(context.scopeStack).toEqual([]);

    const outsideResult = evaluate(itemAst!, context);
    expect(outsideResult.value).toBeNull();
    expect(outsideResult.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });

  it('AE-13: scope is popped even when template evaluation errors mid-iteration', () => {
    const context = createContext({
      items: [{ x: 1 }, { x: 2 }],
      text: 'abc',
    });
    const mapAst = parse('map(source("items"), substring(source("text"), "bad", 1))', {
      registry: context.registry,
    }).ast;
    const itemAst = parse('item("x")', { registry: context.registry }).ast;

    expect(mapAst).not.toBeNull();
    expect(itemAst).not.toBeNull();

    const mapResult = evaluate(mapAst!, context);
    expect(mapResult.value).toEqual([null, null]);
    expect(mapResult.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E005')).toBe(true);
    expect(context.scopeStack).toEqual([]);

    const outsideResult = evaluate(itemAst!, context);
    expect(outsideResult.value).toBeNull();
    expect(outsideResult.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });

  it('supports nested object templates', () => {
    const result = evalExpression(
      'map(source("items"), {"product": {"code": item("sku")}, "pricing": {"net": subtract(item("price"), item("discount"))}})',
      {
        items: [{ sku: 'KB-1', price: 10, discount: 2 }],
      },
    );

    expect(result.value).toEqual([
      {
        product: { code: 'KB-1' },
        pricing: { net: 8 },
      },
    ]);
  });

  it('AE-27: lazy template expression is re-evaluated per element', () => {
    const result = evalExpression('map(source("items"), item("n"))', {
      items: [{ n: 1 }, { n: 2 }, { n: 3 }],
    });

    expect(result.value).toEqual([1, 2, 3]);
  });
});

describe('array functions - filter() and find()', () => {
  it('AE-04: filter() keeps original matching elements unchanged', () => {
    const source = {
      items: [{ price: 10 }, { price: 50 }, { price: 30 }],
    };

    const result = evalExpression('filter(source("items"), gt(item("price"), 20))', source);

    expect(result.value).toEqual([{ price: 50 }, { price: 30 }]);
    const filtered = result.value as Array<{ price: number }>;
    expect(filtered[0]).toBe(source.items[1]);
    expect(filtered[1]).toBe(source.items[2]);
  });

  it('AE-05: filter() emits E016 when result is empty on non-empty input', () => {
    const result = evalExpression('filter(source("items"), gt(item("price"), 100))', {
      items: [{ price: 5 }, { price: 10 }],
    });

    expect(result.value).toEqual([]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E016')).toBe(true);
  });

  it('filter() null array returns null', () => {
    const result = evalExpression('filter(source("items"), gt(item("price"), 0))', {
      items: null,
    });

    expect(result.value).toBeNull();
  });

  it('filter() empty array returns [] without E016', () => {
    const result = evalExpression('filter(source("items"), gt(item("price"), 0))', {
      items: [],
    });

    expect(result.value).toEqual([]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E016')).toBe(false);
  });

  it('AE-26: filter() emits E017 for non-boolean, non-null condition values', () => {
    const result = evalExpression('filter(source("items"), item("x"))', {
      items: [{ x: 1 }, { x: null }, { x: true }],
    });

    expect(result.value).toEqual([{ x: true }]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBe(true);
  });

  it('AE-06: find() returns first matching element', () => {
    const result = evalExpression('find(source("items"), gt(item("id"), 1))', {
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    expect(result.value).toEqual({ id: 2 });
  });

  it('AE-07: find() no match returns null with E019', () => {
    const result = evalExpression('find(source("items"), eq(item("id"), 99))', {
      items: [{ id: 1 }],
    });

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E019')).toBe(true);
  });

  it('find() null array returns null', () => {
    const result = evalExpression('find(source("items"), eq(item("id"), 1))', {
      items: null,
    });

    expect(result.value).toBeNull();
  });

  it('find() empty array returns null without E019', () => {
    const result = evalExpression('find(source("items"), eq(item("id"), 1))', {
      items: [],
    });

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E019')).toBe(false);
  });

  it('find() emits E017 for non-boolean, non-null condition values', () => {
    const result = evalExpression('find(source("items"), item("x"))', {
      items: [{ x: 1 }, { x: null }, { x: true }],
    });

    expect(result.value).toEqual({ x: true });
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBe(true);
  });

  it('AE-14 (partial): find() inside map() can use parent() from outer map scope', () => {
    const result = evalExpression(
      'map(source("lineItems"), {"sku": item("sku"), "taxLine": find(source("taxLines"), eq(item("lineRef"), parent("lineId")))})',
      {
        lineItems: [
          { lineId: 'L1', sku: 'A' },
          { lineId: 'L2', sku: 'B' },
        ],
        taxLines: [
          { lineRef: 'L1', tax: 5 },
          { lineRef: 'L2', tax: 3 },
        ],
      },
    );

    expect(result.value).toEqual([
      { sku: 'A', taxLine: { lineRef: 'L1', tax: 5 } },
      { sku: 'B', taxLine: { lineRef: 'L2', tax: 3 } },
    ]);
  });

  it('filter() scope is popped after iteration', () => {
    const context = createContext({ items: [{ x: 1 }, { x: 2 }] });
    const filterAst = parse('filter(source("items"), gt(item("x"), 1))', {
      registry: context.registry,
    }).ast;
    const itemAst = parse('item("x")', { registry: context.registry }).ast;

    expect(filterAst).not.toBeNull();
    expect(itemAst).not.toBeNull();

    const filterResult = evaluate(filterAst!, context);
    expect(filterResult.value).toEqual([{ x: 2 }]);
    expect(context.scopeStack).toEqual([]);

    const outsideResult = evaluate(itemAst!, context);
    expect(outsideResult.value).toBeNull();
    expect(outsideResult.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });

  it('find() scope is popped after early return and after no-match path', () => {
    const context = createContext({ items: [{ x: 1 }, { x: 2 }] });
    const firstFindAst = parse('find(source("items"), gt(item("x"), 1))', {
      registry: context.registry,
    }).ast;
    const secondFindAst = parse('find(source("items"), eq(item("x"), 99))', {
      registry: context.registry,
    }).ast;
    const itemAst = parse('item("x")', { registry: context.registry }).ast;

    expect(firstFindAst).not.toBeNull();
    expect(secondFindAst).not.toBeNull();
    expect(itemAst).not.toBeNull();

    const firstResult = evaluate(firstFindAst!, context);
    expect(firstResult.value).toEqual({ x: 2 });
    expect(context.scopeStack).toEqual([]);

    const secondResult = evaluate(secondFindAst!, context);
    expect(secondResult.value).toBeNull();
    expect(context.scopeStack).toEqual([]);

    const outsideResult = evaluate(itemAst!, context);
    expect(outsideResult.value).toBeNull();
    expect(outsideResult.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
  });
});

describe('array functions - array/merge/flatten/first/nth', () => {
  it('array() builds an array from scalar values', () => {
    const result = evalExpression('array(1, 2, 3)', {});
    expect(result.value).toEqual([1, 2, 3]);
    expect(result.diagnostics).toEqual([]);
  });

  it('AE-15: array() includes null elements', () => {
    const result = evalExpression('array(source("a"), source("b"), source("c"))', {
      a: 1,
      b: null,
      c: 3,
    });

    expect(result.value).toEqual([1, null, 3]);
  });

  it('array() with zero args fails with E003 (arity check)', () => {
    const result = evalExpression('array()', {});
    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E003')).toBe(true);
  });

  it('merge() concatenates arrays in order', () => {
    const result = evalExpression('merge(source("a"), source("b"))', {
      a: [1, 2],
      b: [3, 4],
    });

    expect(result.value).toEqual([1, 2, 3, 4]);
  });

  it('AE-16: merge() skips null arguments', () => {
    const result = evalExpression('merge(source("x"), source("y"), source("z"))', {
      x: [1, 2],
      y: null,
      z: [3],
    });

    expect(result.value).toEqual([1, 2, 3]);
  });

  it('merge() emits E005 for non-null, non-array argument and continues', () => {
    const result = evalExpression('merge(source("a"), source("bad"), source("b"))', {
      a: [1],
      bad: 'not_array',
      b: [2],
    });

    expect(result.value).toEqual([1, 2]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E005')).toBe(true);
  });

  it('merge(null, null) returns empty array', () => {
    const result = evalExpression('merge(source("a"), source("b"))', {
      a: null,
      b: null,
    });

    expect(result.value).toEqual([]);
  });

  it('flatten() removes one level of nesting', () => {
    const result = evalExpression('flatten(source("nested"))', {
      nested: [[1, 2], [3, 4], [5]],
    });

    expect(result.value).toEqual([1, 2, 3, 4, 5]);
  });

  it('AE-17: flatten() only removes one level', () => {
    const result = evalExpression('flatten(source("nested"))', {
      nested: [[1, [2]], [3]],
    });

    expect(result.value).toEqual([1, [2], 3]);
  });

  it('flatten([]) returns []', () => {
    const result = evalExpression('flatten(source("nested"))', {
      nested: [],
    });

    expect(result.value).toEqual([]);
  });

  it('flatten(null) returns null (standard null propagation)', () => {
    const result = evalExpression('flatten(source("nested"))', {
      nested: null,
    });

    expect(result.value).toBeNull();
  });

  it('flatten keeps non-array elements while expanding array elements', () => {
    const result = evalExpression('flatten(source("mixed"))', {
      mixed: [1, [2], 3],
    });

    expect(result.value).toEqual([1, 2, 3]);
  });

  it('first() returns first element', () => {
    const result = evalExpression('first(source("items"))', {
      items: [10, 20],
    });

    expect(result.value).toBe(10);
  });

  it('first([]) returns null', () => {
    const result = evalExpression('first(source("items"))', {
      items: [],
    });

    expect(result.value).toBeNull();
  });

  it('first(null) returns null', () => {
    const result = evalExpression('first(source("items"))', {
      items: null,
    });

    expect(result.value).toBeNull();
  });

  it('nth() supports positive index', () => {
    const result = evalExpression('nth(source("items"), 1)', {
      items: [10, 20, 30],
    });

    expect(result.value).toBe(20);
  });

  it('AE-22: nth() supports negative index', () => {
    const result = evalExpression('nth(source("items"), -1)', {
      items: [10, 20, 30],
    });

    expect(result.value).toBe(30);
  });

  it('AE-23: nth() out-of-bounds positive index returns null + W004', () => {
    const result = evalExpression('nth(source("items"), 5)', {
      items: [10, 20],
    });

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W004')).toBe(true);
  });

  it('nth() out-of-bounds negative index returns null + W004', () => {
    const result = evalExpression('nth(source("items"), -5)', {
      items: [10, 20],
    });

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-W004')).toBe(true);
  });

  it('nth(null, index) returns null', () => {
    const result = evalExpression('nth(source("items"), 0)', {
      items: null,
    });

    expect(result.value).toBeNull();
  });
});

describe('array functions - objectFields canonical parity scenarios', () => {
  it('returns seven ordered outputs and keeps IsOpen:false entries for primary source parent', () => {
    const result = evalExpression(OBJECT_FIELDS_PRIMARY_EXPRESSION, {
      DeliveryWeeklyOperation: WEEKLY_OBJECT,
    });

    expect(result.value).toEqual([
      { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
      { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
      { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
      { operationDayValue: 'Wednesday', isOpen: true, beginTime: '12:00' },
      { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
      { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
      { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
    ]);
  });

  it('returns six outputs when one configured day is null/missing', () => {
    const result = evalExpression(OBJECT_FIELDS_PRIMARY_EXPRESSION, {
      DeliveryWeeklyOperation: {
        ...WEEKLY_OBJECT,
        Wednesday: null,
      },
    });

    expect(result.value).toEqual([
      { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
      { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
      { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
      { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
      { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
      { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
    ]);
  });

  it('returns empty array when parent object is missing or null', () => {
    const missingParent = evalExpression(OBJECT_FIELDS_PRIMARY_EXPRESSION, {});
    const nullParent = evalExpression(OBJECT_FIELDS_PRIMARY_EXPRESSION, {
      DeliveryWeeklyOperation: null,
    });

    expect(missingParent.value).toEqual([]);
    expect(nullParent.value).toEqual([]);
  });

  it('supports enrichment-backed parent reference with equivalent output', () => {
    const result = evalExpression(OBJECT_FIELDS_ENRICHMENT_EXPRESSION, {}, {
      hours: {
        DeliveryWeeklyOperation: WEEKLY_OBJECT,
      },
    });

    expect(result.value).toEqual([
      { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
      { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
      { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
      { operationDayValue: 'Wednesday', isOpen: true, beginTime: '12:00' },
      { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
      { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
      { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
    ]);
  });
});

describe('array functions - join/count/get', () => {
  it('join() concatenates string arrays with separator', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: ['a', 'b', 'c'],
    });

    expect(result.value).toBe('a,b,c');
  });

  it('join() supports custom separators', () => {
    const result = evalExpression('join(source("values"), " - ")', {
      values: ['a', 'b'],
    });

    expect(result.value).toBe('a - b');
  });

  it('AE-18: join() skips null elements', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: ['a', null, 'b'],
    });

    expect(result.value).toBe('a,b');
  });

  it('join([]) returns empty string', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: [],
    });

    expect(result.value).toBe('');
  });

  it('join(null) returns null', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: null,
    });

    expect(result.value).toBeNull();
  });

  it('join() emits E005 for non-string non-null elements and continues', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: ['a', 123, 'b'],
    });

    expect(result.value).toBe('a,b');
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E005')).toBe(true);
  });

  it('join() single element has no separator', () => {
    const result = evalExpression('join(source("values"), ",")', {
      values: ['single'],
    });

    expect(result.value).toBe('single');
  });

  it('count() returns array length', () => {
    const result = evalExpression('count(source("values"))', {
      values: [1, 2, 3],
    });

    expect(result.value).toBe(3);
  });

  it('count([]) returns 0', () => {
    const result = evalExpression('count(source("values"))', {
      values: [],
    });

    expect(result.value).toBe(0);
  });

  it('AE-19: count(null) returns 0', () => {
    const result = evalExpression('count(source("values"))', {
      values: null,
    });

    expect(result.value).toBe(0);
  });

  it('AE-20: get() reads property from object', () => {
    const result = evalExpression('get(first(source("items")), "name")', {
      items: [{ sku: 'A', name: 'Alpha' }],
    });

    expect(result.value).toBe('Alpha');
  });

  it('get() reads nested path', () => {
    const result = evalExpression('get(source("obj"), "a.b")', {
      obj: { a: { b: 1 } },
    });

    expect(result.value).toBe(1);
  });

  it('get(null, path) returns null', () => {
    const result = evalExpression('get(source("obj"), "x")', {
      obj: null,
    });

    expect(result.value).toBeNull();
  });

  it('AE-21: get() emits E018 for string first argument', () => {
    const result = evalExpression('get("string", "x")', {});

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E018')).toBe(true);
  });

  it('get() emits E018 for number first argument', () => {
    const result = evalExpression('get(123, "x")', {});

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E018')).toBe(true);
  });

  it('get() returns null for null field value and missing path', () => {
    const nullField = evalExpression('get(source("obj"), "x")', {
      obj: { x: null },
    });
    const missing = evalExpression('get(source("obj"), "missing")', {
      obj: {},
    });

    expect(nullField.value).toBeNull();
    expect(missing.value).toBeNull();
  });
});
