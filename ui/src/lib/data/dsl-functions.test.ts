import { describe, expect, it } from 'vitest';

import { DSL_FUNCTION_CATALOG } from './dsl-functions';
import type { FunctionCategory } from './dsl-functions';

// Import the engine's list of registered functions to verify coverage
import { listFunctions } from '@keyra/engine';

const VALID_CATEGORIES: readonly FunctionCategory[] = [
  'String',
  'Date',
  'Math',
  'Conditional',
  'Lookup',
  'Array',
  'NullHandling',
  'TypeConversion',
  'SourceAccess',
];

describe('DSL_FUNCTION_CATALOG', () => {
  it('contains entries for every engine-registered function', () => {
    const registeredNames = new Set(listFunctions());
    const catalogNames = new Set(DSL_FUNCTION_CATALOG.map((e) => e.name));

    for (const name of registeredNames) {
      expect(catalogNames.has(name), `Missing catalog entry for engine function: ${name}`).toBe(true);
    }
  });

  it('all entries have required fields', () => {
    for (const entry of DSL_FUNCTION_CATALOG) {
      expect(entry.name, 'name must be non-empty').toBeTruthy();
      expect(entry.category, `category missing for ${entry.name}`).toBeTruthy();
      expect(entry.description, `description missing for ${entry.name}`).toBeTruthy();
      expect(entry.parameters, `parameters missing for ${entry.name}`).toBeDefined();
      expect(entry.returnType, `returnType missing for ${entry.name}`).toBeTruthy();
      expect(entry.example, `example missing for ${entry.name}`).toBeTruthy();
    }
  });

  it('all categories are valid FunctionCategory values', () => {
    for (const entry of DSL_FUNCTION_CATALOG) {
      expect(
        VALID_CATEGORIES.includes(entry.category),
        `Invalid category "${entry.category}" on function "${entry.name}"`,
      ).toBe(true);
    }
  });

  it('has no duplicate function names', () => {
    const names = DSL_FUNCTION_CATALOG.map((e) => e.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('all parameters have required fields', () => {
    for (const entry of DSL_FUNCTION_CATALOG) {
      for (const param of entry.parameters) {
        expect(param.name, `param.name missing in ${entry.name}`).toBeTruthy();
        expect(param.type, `param.type missing in ${entry.name} param ${param.name}`).toBeTruthy();
        expect(typeof param.required, `param.required wrong type in ${entry.name}`).toBe('boolean');
      }
    }
  });
});
