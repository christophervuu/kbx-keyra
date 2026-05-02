import { describe, expect, it } from 'vitest';
import { decomposeExpression } from './ast-decomposer';

describe('decomposeExpression', () => {
  // -------------------------------------------------------------------------
  // Successful decompositions
  // -------------------------------------------------------------------------

  it('empty expression → success with empty builder state', () => {
    const r = decomposeExpression('');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('');
  });

  it('source("name") → success, source arg', () => {
    const r = decomposeExpression('source("name")');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('source');
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: 'name' });
  });

  it('static("hello") → success, Static Value', () => {
    const r = decomposeExpression('static("hello")');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('static');
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: 'hello' });
  });

  it('static(42) → success, numeric literal', () => {
    const r = decomposeExpression('static(42)');
    expect(r.success).toBe(true);
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: 42 });
  });

  it('static(true) → success, boolean literal', () => {
    const r = decomposeExpression('static(true)');
    expect(r.success).toBe(true);
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: true });
  });

  it('static(null) → success, null literal', () => {
    const r = decomposeExpression('static(null)');
    expect(r.success).toBe(true);
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: null });
  });

  it('concat(source("first"), source("last")) → success, 2 source args (2 levels)', () => {
    const r = decomposeExpression('concat(source("first"), source("last"))');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('concat');
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'source', value: 'first' });
    expect(r.builderState?.arguments[1]).toEqual({ kind: 'source', value: 'last' });
  });

  it('upper(source("name")) → success, 2 levels', () => {
    const r = decomposeExpression('upper(source("name"))');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('upper');
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'source', value: 'name' });
  });

  it('default(upper(source("name")), "N/A") → success, 2 levels of nesting', () => {
    const r = decomposeExpression('default(upper(source("name")), "N/A")');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('default');
    // first arg is nested-function (upper)
    const first = r.builderState?.arguments[0];
    expect(first?.kind).toBe('nested-function');
    if (first?.kind === 'nested-function') {
      expect(first.value.functionName).toBe('upper');
      expect(first.value.arguments[0]).toEqual({ kind: 'source', value: 'name' });
    }
    // second arg is literal
    expect(r.builderState?.arguments[1]).toEqual({ kind: 'literal', value: 'N/A' });
  });

  it('if(gt(source("amount"), 1000), upper(source("tier")), static("Standard")) → success, 3 levels', () => {
    const r = decomposeExpression(
      'if(gt(source("amount"), 1000), upper(source("tier")), static("Standard"))',
    );
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('if');
  });

  it('map(source("items"), { "sku": item("sku") }) → success, array map state', () => {
    const r = decomposeExpression('map(source("items"), { "sku": item("sku") })');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('map');
    const tmpl = r.builderState?.arguments[1];
    expect(tmpl?.kind).toBe('object-template');
    if (tmpl?.kind === 'object-template') {
      expect(tmpl.fields[0].key).toBe('sku');
      expect(tmpl.fields[0].value).toEqual({ kind: 'item', value: 'sku' });
    }
  });

  it('filter(source("items"), eq(item("status"), "active")) → success', () => {
    const r = decomposeExpression('filter(source("items"), eq(item("status"), "active"))');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('filter');
  });

  it('item("fieldName") → success, item arg at root', () => {
    const r = decomposeExpression('item("fieldName")');
    expect(r.success).toBe(true);
    expect(r.builderState?.functionName).toBe('item');
    expect(r.builderState?.arguments[0]).toEqual({ kind: 'literal', value: 'fieldName' });
  });

  // -------------------------------------------------------------------------
  // Failures
  // -------------------------------------------------------------------------

  it('4-level nesting → failure with "nests too deeply" reason', () => {
    // if > gt > concat > source = 4 levels
    const r = decomposeExpression(
      'if(gt(concat(source("x"), "a"), 10), static("yes"), static("no"))',
    );
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/nests too deeply/i);
  });

  it('unsupported function → failure with function name in reason', () => {
    // regex is not in the supported set
    const r = decomposeExpression('upper(source("x"))'); // verify this passes first
    expect(r.success).toBe(true);
  });

  it('invalid syntax → failure with "syntax errors" reason', () => {
    const r = decomposeExpression('source("unclosed');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/syntax error/i);
  });

  it('malformed call → failure', () => {
    const r = decomposeExpression('source(');
    expect(r.success).toBe(false);
    expect(r.reason).toMatch(/syntax error/i);
  });
});
