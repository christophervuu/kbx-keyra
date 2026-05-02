import { describe, expect, it } from 'vitest';

import { inferRuleType } from './infer-rule-type';

describe('inferRuleType', () => {
  it('returns "Direct Copy" for source() expressions', () => {
    expect(inferRuleType('source("orderDate")')).toBe('Direct Copy');
  });

  it('returns "Static Value" for static() expressions', () => {
    expect(inferRuleType('static("PO")')).toBe('Static Value');
  });

  it('returns "Conditional" for if() expressions', () => {
    expect(inferRuleType('if(eq(source("urgent"), true), static("Rush"), static("Normal"))')).toBe(
      'Conditional',
    );
  });

  it('returns "Lookup" for valueMap() expressions', () => {
    expect(inferRuleType('valueMap(source("code"), "mapping-table")')).toBe('Lookup');
  });

  it('returns "Array" for map() expressions', () => {
    expect(inferRuleType('map(source("items"), source("name"))')).toBe('Array');
  });

  it('returns "Array" for filter() expressions', () => {
    expect(inferRuleType('filter(source("items"), gt(source("qty"), static(0)))')).toBe('Array');
  });

  it('returns "Transform" for concat() expressions', () => {
    expect(inferRuleType('concat(source("first"), static(" "), source("last"))')).toBe('Transform');
  });

  it('returns "Transform" for upper() expressions', () => {
    expect(inferRuleType('upper(source("name"))')).toBe('Transform');
  });

  it('returns "Transform" for formatDate() expressions', () => {
    expect(inferRuleType('formatDate(source("date"), "YYYY-MM-DD")')).toBe('Transform');
  });

  it('returns "Not configured" for empty string', () => {
    expect(inferRuleType('')).toBe('Not configured');
  });

  it('returns "Not configured" for whitespace-only string', () => {
    expect(inferRuleType('   ')).toBe('Not configured');
  });

  it('returns "Transform" for unknown function names', () => {
    expect(inferRuleType('customFn(source("x"))')).toBe('Transform');
  });

  it('returns "Transform" for expressions not starting with a function call', () => {
    expect(inferRuleType('"literal string"')).toBe('Transform');
  });

  it('handles function names with underscores', () => {
    expect(inferRuleType('my_func(arg)')).toBe('Transform');
  });

  it('handles whitespace before opening paren', () => {
    expect(inferRuleType('source ("field")')).toBe('Direct Copy');
  });
});
