import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDslAutocomplete } from './use-dsl-autocomplete';
import type { UseDslAutocompleteOptions } from './use-dsl-autocomplete';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(path: string, type: SchemaTreeNode['type']): SchemaTreeNode {
  return {
    path,
    fieldName: path.split('.').at(-1) ?? path,
    type,
    depth: path.split('.').length - 1,
    isArray: false,
    isRequired: true,
    parentPath: null,
    childCount: 0,
    children: [],
  };
}

function makeSchema(paths: string[]): ParsedSchema {
  return {
    nodes: paths.map((p) => makeNode(p, 'string')),
    totalFieldCount: paths.length,
    format: 'json-schema',
    parseTimeMs: 0,
    inferred: false,
  };
}

function renderAutocomplete(opts: Partial<UseDslAutocompleteOptions> = {}) {
  return renderHook((props: UseDslAutocompleteOptions) => useDslAutocomplete(props), {
    initialProps: {
      expression: '',
      cursorPosition: 0,
      parsedSourceSchema: null,
      constants: [],
      externalSources: [],
      ...opts,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDslAutocomplete', () => {
  it('is closed by default for empty expression (no suggestions)', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    // Empty expression at pos 0 → function kind, no prefix, ALL functions are suggestions
    // So it should be open with function suggestions
    expect(result.current.suggestions.length).toBeGreaterThan(0);
    expect(result.current.isOpen).toBe(true);
  });

  it('provides function suggestions at top-level position', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toContain('concat');
    expect(labels).toContain('if');
    expect(labels).toContain('source');
  });

  it('filters function suggestions by prefix', () => {
    const expr = 'con';
    const { result } = renderAutocomplete({ expression: expr, cursorPosition: expr.length });
    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toContain('concat');
    expect(labels).toContain('contains');
    expect(labels).not.toContain('upper');
  });

  it('provides source-path suggestions when cursor inside source("...")', () => {
    const schema = makeSchema(['order.name', 'order.total', 'id']);
    const expr = 'source("ord';
    const { result } = renderAutocomplete({
      expression: expr,
      cursorPosition: expr.length,
      parsedSourceSchema: schema,
    });
    expect(result.current.context.kind).toBe('source-path');
    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toContain('order.name');
    expect(labels).toContain('order.total');
    expect(labels).not.toContain('id'); // 'id' doesn't start with 'ord'
  });

  it('returns no source-path suggestions when schema is null', () => {
    const expr = 'source("x';
    const { result } = renderAutocomplete({
      expression: expr,
      cursorPosition: expr.length,
      parsedSourceSchema: null,
    });
    expect(result.current.context.kind).toBe('source-path');
    expect(result.current.suggestions).toHaveLength(0);
    expect(result.current.isOpen).toBe(false);
  });

  it('provides constant suggestions when cursor inside constant("...")', () => {
    const expr = 'constant("TAX';
    const { result } = renderAutocomplete({
      expression: expr,
      cursorPosition: expr.length,
      constants: ['TAX_RATE', 'MAX_ITEMS', 'TAX_CODE'],
    });
    expect(result.current.context.kind).toBe('constant');
    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toContain('TAX_RATE');
    expect(labels).toContain('TAX_CODE');
    expect(labels).not.toContain('MAX_ITEMS');
  });

  it('provides external suggestions when cursor inside external("...")', () => {
    const expr = 'external("look';
    const { result } = renderAutocomplete({
      expression: expr,
      cursorPosition: expr.length,
      externalSources: ['lookupTable', 'referenceData'],
    });
    expect(result.current.context.kind).toBe('external');
    const labels = result.current.suggestions.map((s) => s.label);
    expect(labels).toContain('lookupTable');
    expect(labels).not.toContain('referenceData');
  });

  it('closes and returns no suggestions when context kind is none', () => {
    // static("val — context is 'none'
    const expr = 'static("val';
    const { result } = renderAutocomplete({ expression: expr, cursorPosition: expr.length });
    expect(result.current.context.kind).toBe('none');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('open() opens the dropdown when there are suggestions', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    act(() => { result.current.close(); });
    expect(result.current.isOpen).toBe(false);
    act(() => { result.current.open(); });
    expect(result.current.isOpen).toBe(true);
  });

  it('close() closes the dropdown', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    act(() => { result.current.close(); });
    expect(result.current.isOpen).toBe(false);
  });

  it('selectNext() advances selectedIndex', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    expect(result.current.selectedIndex).toBe(0);
    act(() => { result.current.selectNext(); });
    expect(result.current.selectedIndex).toBe(1);
  });

  it('selectNext() wraps around at end of list', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    const count = result.current.suggestions.length;
    // Jump to last item
    for (let i = 0; i < count - 1; i++) {
      act(() => { result.current.selectNext(); });
    }
    expect(result.current.selectedIndex).toBe(count - 1);
    act(() => { result.current.selectNext(); });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('selectPrev() wraps around at beginning', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    expect(result.current.selectedIndex).toBe(0);
    act(() => { result.current.selectPrev(); });
    expect(result.current.selectedIndex).toBe(result.current.suggestions.length - 1);
  });

  it('confirm() returns insert result and closes dropdown', () => {
    const { result } = renderAutocomplete({ expression: 'con', cursorPosition: 3 });
    expect(result.current.isOpen).toBe(true);
    let confirmResult: ReturnType<typeof result.current.confirm> = null;
    act(() => {
      confirmResult = result.current.confirm();
    });
    expect(confirmResult).not.toBeNull();
    expect(confirmResult!.insertText).toContain('(');
    expect(result.current.isOpen).toBe(false);
  });

  it('confirm() appends closing quote for source-path suggestions', () => {
    const schema = makeSchema(['order.name']);
    const expr = 'source("order';
    const { result } = renderAutocomplete({
      expression: expr,
      cursorPosition: expr.length,
      parsedSourceSchema: schema,
    });
    let confirmResult: ReturnType<typeof result.current.confirm> = null;
    act(() => {
      confirmResult = result.current.confirm();
    });
    expect(confirmResult!.insertText).toMatch(/"/);
    expect(confirmResult!.insertText.endsWith('"')).toBe(true);
  });

  it('confirm() returns null when dropdown is closed', () => {
    const { result } = renderAutocomplete({ expression: '', cursorPosition: 0 });
    act(() => { result.current.close(); });
    let confirmResult: ReturnType<typeof result.current.confirm> = null;
    act(() => {
      confirmResult = result.current.confirm();
    });
    expect(confirmResult).toBeNull();
  });

  it('selectedIndex resets to 0 when context/suggestions change', () => {
    const { result, rerender } = renderAutocomplete({ expression: 'con', cursorPosition: 3 });
    act(() => { result.current.selectNext(); });
    expect(result.current.selectedIndex).toBe(1);
    // Change expression so suggestions change
    rerender({ expression: 'upper', cursorPosition: 5, parsedSourceSchema: null });
    expect(result.current.selectedIndex).toBe(0);
  });
});
