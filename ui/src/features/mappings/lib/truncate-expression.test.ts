import { describe, expect, it } from 'vitest';

import { truncateExpression } from './truncate-expression';

describe('truncateExpression', () => {
  it('returns expression unchanged when ≤ 60 chars', () => {
    expect(truncateExpression('source("firstName")')).toBe('source("firstName")');
  });

  it('returns expression unchanged when exactly 60 chars', () => {
    const expr = 'x'.repeat(60);
    expect(truncateExpression(expr)).toBe(expr);
  });

  it('truncates non-function string with trailing ellipsis', () => {
    const expr = 'x'.repeat(80);
    const result = truncateExpression(expr);
    expect(result).toBe('x'.repeat(60) + '\u2026');
  });

  it('shows function name + first arg + ellipsis for multi-arg call', () => {
    const expr = 'concat(source("firstName"), source("lastName"), source("middleName"))';
    const result = truncateExpression(expr);
    expect(result).toMatch(/^concat\(source\("firstName"\), \u2026\)$/);
  });

  it('shows full single-arg function when it fits', () => {
    expect(truncateExpression('source("firstName")')).toBe('source("firstName")');
  });

  it('replaces object template with {…}', () => {
    const expr = 'map(source("items"), {field: source("items[*].name"), other: source("items[*].id")})';
    const result = truncateExpression(expr);
    expect(result).toContain('{…}');
    expect(result).toContain('map');
  });

  it('handles empty string', () => {
    expect(truncateExpression('')).toBe('');
  });

  it('respects custom maxLen', () => {
    const expr = 'concat(source("a"), source("b"), source("c"))';
    const result = truncateExpression(expr, 25);
    expect(result.length).toBeLessThanOrEqual(27);
    expect(result).toContain('\u2026');
  });

  it('shows full expression when single-arg function is exactly at limit', () => {
    // Build an expression that is exactly 60 chars
    // source("") = 10 chars; pad fieldname to make it 60
    const fieldName = 'x'.repeat(48); // source("xxxxxxxx...") = 10 + 48 = 58 chars + parens = 60
    const expr = `source("${fieldName}")`;
    expect(expr.length).toBe(60);
    expect(truncateExpression(expr)).toBe(expr);
  });
});
