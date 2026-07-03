import { describe, expect, it } from 'vitest';

import { evaluate, parse } from '../../../src/engine/dsl/index.js';
import type { EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(sourceData: unknown, externalSources: Readonly<Record<string, unknown>> = {}): EvaluationContext {
  const registry = createRegistry();
  registerAllFunctions(registry);

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

function run(expression: string, sourceData: unknown, externalSources: Readonly<Record<string, unknown>> = {}) {
  const context = createContext(sourceData, externalSources);
  const parsed = parse(expression, { registry: context.registry });
  expect(parsed.success).toBe(true);
  expect(parsed.ast).not.toBeNull();

  return {
    result: evaluate(parsed.ast!, context),
    context,
  };
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

describe('array functions integration and composition', () => {
  describe('scope stack critical behavior', () => {
    it('item() resolves current element and item("") returns full primitive element', () => {
      const { result } = run('map(source("tags"), upper(item("")))', {
        tags: ['gift', 'priority'],
      });

      expect(result.value).toEqual(['GIFT', 'PRIORITY']);
    });

    it('item() outside context emits E010', () => {
      const { result } = run('item("x")', { x: 1 });

      expect(result.value).toBeNull();
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
    });

    it('parent() resolves outer element in nested map and parent("") returns full outer object', () => {
      const { result } = run(
        'map(source("departments"), {"staff": map(item("employees"), {"id": item("id"), "dept": parent("name"), "fullDept": parent("")})})',
        {
          departments: [
            {
              name: 'Engineering',
              employees: [{ id: 'E1' }],
            },
          ],
        },
      );

      expect(result.value).toEqual([
        {
          staff: [
            {
              id: 'E1',
              dept: 'Engineering',
              fullDept: {
                name: 'Engineering',
                employees: [{ id: 'E1' }],
              },
            },
          ],
        },
      ]);
    });

    it('parent() in single-level map emits E013', () => {
      const { result } = run('map(source("items"), {"bad": parent("x")})', {
        items: [{ x: 1 }],
      });

      expect(result.value).toEqual([{ bad: null }]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E013')).toBe(true);
    });

    it('source() always reads root inside doubly nested maps', () => {
      const { result } = run(
        'map(source("departments"), {"staff": map(item("employees"), {"dept": parent("name"), "company": source("company")})})',
        {
          company: 'Keyra',
          departments: [{ name: 'Engineering', employees: [{ id: 1 }] }],
        },
      );

      expect(result.value).toEqual([
        {
          staff: [{ dept: 'Engineering', company: 'Keyra' }],
        },
      ]);
    });

    it('scope is popped after map and does not leak across sequential evaluations', () => {
      const context = createContext({ items: [{ x: 1 }, { x: 2 }] });

      const mapAst = parse('map(source("items"), item("x"))', { registry: context.registry }).ast;
      const itemAst = parse('item("x")', { registry: context.registry }).ast;
      expect(mapAst).not.toBeNull();
      expect(itemAst).not.toBeNull();

      const first = evaluate(mapAst!, context);
      const second = evaluate(mapAst!, context);
      expect(first.value).toEqual([1, 2]);
      expect(second.value).toEqual([1, 2]);
      expect(context.scopeStack).toEqual([]);

      const outside = evaluate(itemAst!, context);
      expect(outside.value).toBeNull();
      expect(outside.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
    });

    it('scope is popped even when per-element map expression errors', () => {
      const context = createContext({
        items: [
          { den: 0 },
          { den: 2 },
        ],
      });

      const mapAst = parse('map(source("items"), divide(10, item("den")))', {
        registry: context.registry,
      }).ast;
      const itemAst = parse('item("den")', { registry: context.registry }).ast;
      expect(mapAst).not.toBeNull();
      expect(itemAst).not.toBeNull();

      const result = evaluate(mapAst!, context);
      expect(result.value).toEqual([null, 5]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E050')).toBe(true);
      expect(context.scopeStack).toEqual([]);

      const outside = evaluate(itemAst!, context);
      expect(outside.value).toBeNull();
      expect(outside.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E010')).toBe(true);
    });
  });

  describe('composition and pattern coverage', () => {
    it('Pattern 6.1 basic 1:1 mapping with computed values', () => {
      const { result } = run(
        'map(source("items"), {"productCode": item("sku"), "qty": item("quantity"), "hasDiscount": gt(item("discountAmount"), 0)})',
        {
          items: [
            { sku: 'KB-1', quantity: 1, discountAmount: 9 },
            { sku: 'MS-2', quantity: 2, discountAmount: 0 },
          ],
        },
      );

      expect(result.value).toEqual([
        { productCode: 'KB-1', qty: 1, hasDiscount: true },
        { productCode: 'MS-2', qty: 2, hasDiscount: false },
      ]);
    });

    it('AE-24 / Pattern 6.2 filter then map composition', () => {
      const { result } = run(
        'map(filter(source("items"), gt(item("discountAmount"), 0)), {"sku": item("sku"), "discount": item("discountAmount")})',
        {
          items: [
            { sku: 'KB-1', discountAmount: 9 },
            { sku: 'MS-2', discountAmount: 0 },
          ],
        },
      );

      expect(result.value).toEqual([{ sku: 'KB-1', discount: 9 }]);
    });

    it('Pattern 6.4 build array from scalars then filter nulls', () => {
      const { result } = run(
        'filter(array(source("a"), source("b"), source("c")), not(isNull(item(""))))',
        {
          a: 'A',
          b: null,
          c: 'C',
        },
      );

      expect(result.value).toEqual(['A', 'C']);
    });

    it('Pattern 6.5 merge two mapped arrays', () => {
      const { result } = run(
        'merge(map(source("domestic"), {"city": item("city"), "origin": static("DOMESTIC")}), map(source("international"), {"city": item("city"), "origin": static("INTERNATIONAL")}))',
        {
          domestic: [{ city: 'Wichita' }],
          international: [{ city: 'Toronto' }],
        },
      );

      expect(result.value).toEqual([
        { city: 'Wichita', origin: 'DOMESTIC' },
        { city: 'Toronto', origin: 'INTERNATIONAL' },
      ]);
    });

    it('AE-14 / Pattern 6.7 cross-reference arrays by key with find + parent + get', () => {
      const { result } = run(
        'map(source("lineItems"), {"sku": item("sku"), "tax": get(find(source("taxLines"), eq(item("lineRef"), parent("lineId"))), "taxAmount")})',
        {
          lineItems: [
            { lineId: 'L1', sku: 'KB-1' },
            { lineId: 'L2', sku: 'MS-2' },
          ],
          taxLines: [
            { lineRef: 'L1', taxAmount: 6.88 },
            { lineRef: 'L2', taxAmount: 4.61 },
          ],
        },
      );

      expect(result.value).toEqual([
        { sku: 'KB-1', tax: 6.88 },
        { sku: 'MS-2', tax: 4.61 },
      ]);
    });

    it('Pattern 6.10 nested mapping departments/employees', () => {
      const { result } = run(
        'map(source("departments"), {"deptName": item("name"), "staff": map(item("employees"), {"employeeName": item("name"), "department": parent("name")})})',
        {
          departments: [
            {
              name: 'Engineering',
              employees: [{ name: 'Ada' }, { name: 'Grace' }],
            },
          ],
        },
      );

      expect(result.value).toEqual([
        {
          deptName: 'Engineering',
          staff: [
            { employeeName: 'Ada', department: 'Engineering' },
            { employeeName: 'Grace', department: 'Engineering' },
          ],
        },
      ]);
    });

    it('AE-25 / Pattern 6.11 flatten(map(...)) collects nested arrays', () => {
      const { result } = run('flatten(map(source("departments"), item("employees")))', {
        departments: [
          { employees: [{ id: 1 }] },
          { employees: [{ id: 2 }, { id: 3 }] },
        ],
      });

      expect(result.value).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it('complex compositions: get(first()), join(map()), count(filter()), array(first, first)', () => {
      const firstGet = run('get(first(source("items")), "name")', {
        items: [{ name: 'Alpha' }, { name: 'Beta' }],
      }).result;

      const joinMap = run('join(map(source("items"), item("name")), ",")', {
        items: [{ name: 'Alpha' }, { name: 'Beta' }],
      }).result;

      const countFilter = run('count(filter(source("items"), gt(item("price"), 10)))', {
        items: [{ price: 5 }, { price: 20 }, { price: 30 }],
      }).result;

      const arrayFromComputed = run('array(first(source("a")), first(source("b")))', {
        a: ['A1'],
        b: ['B1'],
      }).result;

      expect(firstGet.value).toBe('Alpha');
      expect(joinMap.value).toBe('Alpha,Beta');
      expect(countFilter.value).toBe(2);
      expect(arrayFromComputed.value).toEqual(['A1', 'B1']);
    });
  });

  describe('canonical objectFields expression coverage', () => {
    it('returns seven ordered items and retains IsOpen: false for primary parent source', () => {
      const { result } = run(OBJECT_FIELDS_PRIMARY_EXPRESSION, {
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

    it('skips missing configured child key and yields six ordered outputs', () => {
      const { result } = run(OBJECT_FIELDS_PRIMARY_EXPRESSION, {
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

    it('returns empty array when primary parent object is missing/null', () => {
      const missingParent = run(OBJECT_FIELDS_PRIMARY_EXPRESSION, {}).result;
      const nullParent = run(OBJECT_FIELDS_PRIMARY_EXPRESSION, { DeliveryWeeklyOperation: null }).result;

      expect(missingParent.value).toEqual([]);
      expect(nullParent.value).toEqual([]);
    });

    it('supports enrichment-backed parent expression with same canonical semantics', () => {
      const { result } = run(OBJECT_FIELDS_ENRICHMENT_EXPRESSION, {}, {
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

  describe('triple nesting and error recovery', () => {
    it('triple nesting: parent() at third level reaches middle level only', () => {
      const { result } = run(
        'map(source("a"), {"aName": item("name"), "b": map(item("b"), {"bName": item("name"), "c": map(item("c"), {"inner": item("x"), "mid": parent("name")})})})',
        {
          a: [
            {
              name: 'A-1',
              b: [
                {
                  name: 'B-1',
                  c: [{ x: 'C-1' }],
                },
              ],
            },
          ],
        },
      );

      expect(result.value).toEqual([
        {
          aName: 'A-1',
          b: [
            {
              bName: 'B-1',
              c: [{ inner: 'C-1', mid: 'B-1' }],
            },
          ],
        },
      ]);
      expect(result.diagnostics).toEqual([]);
    });

    it('error recovery: filter condition errors exclude bad element and continue', () => {
      const { result } = run('filter(source("items"), item("flag"))', {
        items: [{ flag: 1 }, { flag: true }, { flag: null }],
      });

      expect(result.value).toEqual([{ flag: true }]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E017')).toBe(true);
    });

    it('error recovery: find no-match inside map returns null for that element and outer map continues', () => {
      const { result } = run(
        'map(source("lineItems"), {"lineId": item("lineId"), "tax": get(find(source("taxLines"), eq(item("lineRef"), parent("lineId"))), "tax")})',
        {
          lineItems: [{ lineId: 'L1' }, { lineId: 'L2' }],
          taxLines: [{ lineRef: 'L1', tax: 5 }],
        },
      );

      expect(result.value).toEqual([
        { lineId: 'L1', tax: 5 },
        { lineId: 'L2', tax: null },
      ]);
      expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E019')).toBe(true);
    });
  });
});
