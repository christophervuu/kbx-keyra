import { describe, expect, it } from 'vitest';

import {
  buildSmartBuilderDslCoverage,
  findUnregisteredFunctionsInActionCatalog,
} from './smart-builder-dsl-coverage';

describe('smart-builder-dsl-coverage', () => {
  it('accounts for all DSL catalog functions with a classification', () => {
    const coverage = buildSmartBuilderDslCoverage();
    expect(coverage.length).toBeGreaterThan(0);
    expect(coverage.every((entry) => entry.classification)).toBe(true);
  });

  it('classifies source access functions as input-type', () => {
    const coverage = buildSmartBuilderDslCoverage();
    const source = coverage.find((entry) => entry.functionName === 'source');
    const external = coverage.find((entry) => entry.functionName === 'external');
    const constant = coverage.find((entry) => entry.functionName === 'constant');
    expect(source?.classification).toBe('input-type');
    expect(external?.classification).toBe('input-type');
    expect(constant?.classification).toBe('input-type');
  });

  it('marks startsWith as intentionally unsupported', () => {
    const coverage = buildSmartBuilderDslCoverage();
    const startsWith = coverage.find((entry) => entry.functionName === 'startsWith');
    expect(startsWith).toBeUndefined();
  });

  it('has no unregistered function references in action catalog', () => {
    const unregistered = findUnregisteredFunctionsInActionCatalog();
    expect(unregistered).toEqual([]);
  });

  it('AE-09: includes classification entries for core array functions', () => {
    const coverage = buildSmartBuilderDslCoverage();
    const coreArrayFns = ['map', 'filter', 'find', 'array', 'merge', 'flatten', 'first', 'nth', 'join', 'count', 'get'];
    for (const fnName of coreArrayFns) {
      const entry = coverage.find((item) => item.functionName === fnName);
      expect(entry).toBeDefined();
      expect(entry?.classification).toBeTruthy();
    }
  });
});
