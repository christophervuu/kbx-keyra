import { describe, expect, it } from 'vitest';

import { generateArrayExpression } from './array-expression-generator';
import type { ArrayBuilderState } from './array-expression-generator';

const BASE: ArrayBuilderState = {
  sourceArrayPath: 'order.items',
  pattern: '1:1 map',
  fieldMappings: [],
  rawExpression: '',
  additionalSourcePaths: [],
};

describe('generateArrayExpression', () => {
  it('generates 1:1 map with no field mappings', () => {
    const result = generateArrayExpression({ ...BASE, pattern: '1:1 map' });
    expect(result).toBe('map(source("order.items"), {})');
  });

  it('generates 1:1 map with field mappings', () => {
    const result = generateArrayExpression({
      ...BASE,
      pattern: '1:1 map',
      fieldMappings: [
        { targetField: 'sku', sourceField: 'productCode' },
        { targetField: 'qty', sourceField: 'quantity' },
      ],
    });
    expect(result).toBe('map(source("order.items"), {"sku": item("productCode"), "qty": item("quantity")})');
  });

  it('generates filter-then-map expression', () => {
    const result = generateArrayExpression({
      ...BASE,
      pattern: 'filter-then-map',
      fieldMappings: [{ targetField: 'name', sourceField: 'name' }],
    });
    expect(result).toContain('filter(source("order.items")');
    expect(result).toContain('map(');
    expect(result).toContain('item("name")');
  });

  it('generates merge-arrays with single source', () => {
    const result = generateArrayExpression({ ...BASE, pattern: 'merge-arrays' });
    expect(result).toBe('source("order.items")');
  });

  it('generates merge-arrays with multiple sources', () => {
    const result = generateArrayExpression({
      ...BASE,
      pattern: 'merge-arrays',
      additionalSourcePaths: ['domestic.addresses', 'international.addresses'],
    });
    expect(result).toBe(
      'concat(source("order.items"), source("domestic.addresses"), source("international.addresses"))',
    );
  });

  it('generates build-from-scalars expression', () => {
    const result = generateArrayExpression({
      ...BASE,
      pattern: 'build-from-scalars',
      fieldMappings: [
        { targetField: '0', sourceField: 'primaryPhone' },
        { targetField: '1', sourceField: 'mobilePhone' },
      ],
    });
    expect(result).toBe('array(source("primaryPhone"), source("mobilePhone"))');
  });

  it('returns raw expression for advanced pattern', () => {
    const raw = 'map(source("items"), item(""))';
    const result = generateArrayExpression({ ...BASE, pattern: 'advanced', rawExpression: raw });
    expect(result).toBe(raw);
  });

  it('returns empty string when sourceArrayPath is empty for non-advanced patterns', () => {
    const result = generateArrayExpression({ ...BASE, sourceArrayPath: '', pattern: '1:1 map' });
    expect(result).toBe('');
  });

  it('escapes double quotes in field names', () => {
    const result = generateArrayExpression({
      ...BASE,
      pattern: '1:1 map',
      fieldMappings: [{ targetField: 'my"field', sourceField: 'src"field' }],
    });
    expect(result).toContain('\\"');
  });
});
