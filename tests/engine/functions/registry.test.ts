import { describe, expect, it } from 'vitest';

import { createRegistry, defaultRegistry, registerAllFunctions } from '../../../src/engine/index.js';

const EXPECTED_FUNCTIONS = [
  // Source access
  'source',
  'item',
  'parent',
  'constant',
  'external',
  'static',

  // Arrays
  'map',
  'filter',
  'find',
  'array',
  'merge',
  'flatten',
  'first',
  'nth',
  'join',
  'count',
  'get',

  // Type conversion
  'cast',

  // Null handling
  'default',
  'coalesce',
  'isNull',

  // Conditional
  'if',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'and',
  'or',
  'not',

  // Lookup
  'valueMap',

  // String
  'concat',
  'substring',
  'upper',
  'lower',
  'trim',
  'replace',
  'replaceAll',
  'contains',
  'length',

  // Date
  'formatDate',

  // Math
  'add',
  'subtract',
  'multiply',
  'divide',
  'round',
  'abs',
] as const;

describe('built-in function registration', () => {
  it('AE-25: default registry includes all expected built-in functions', () => {
    const names = defaultRegistry.listFunctions();

    expect(names).toHaveLength(48);

    for (const functionName of EXPECTED_FUNCTIONS) {
      expect(defaultRegistry.hasFunction(functionName)).toBe(true);
    }
  });

  it('registerAllFunctions registers all expected names on fresh registry', () => {
    const registry = createRegistry();

    registerAllFunctions(registry);

    expect(registry.listFunctions()).toHaveLength(48);
    for (const functionName of EXPECTED_FUNCTIONS) {
      expect(registry.hasFunction(functionName)).toBe(true);
    }
  });

  it('registerAllFunctions throws on duplicate registration', () => {
    const registry = createRegistry();

    registerAllFunctions(registry);

    expect(() => {
      registerAllFunctions(registry);
    }).toThrow(/already registered/);
  });
});
