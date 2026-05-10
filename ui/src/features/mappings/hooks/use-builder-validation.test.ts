/**
 * Unit tests for useBuilderValidation hook (FS-040 T-01).
 *
 * Tests cover:
 * - Structural validation per mode (Value, Conditional, ValueMap)
 * - Editor mode bypass (always structureValid: true)
 * - Output type inference and compatibility
 * - canApply and canSave derivation
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parse, defaultRegistry } from '@/lib/engine';
import type { ParseResult } from '@/lib/engine';

import type {
  ExpressionBuilderState,
  ValueModeState,
  ConditionalModeState,
  ValueMapModeState,
} from '../lib/expression-builder-state';
import { useBuilderValidation } from './use-builder-validation';
import type { UseBuilderValidationInput } from './use-builder-validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseExpr(expression: string): ParseResult {
  return parse(expression, { registry: defaultRegistry });
}

function makeInput(overrides: Partial<UseBuilderValidationInput>): UseBuilderValidationInput {
  return {
    builderState: null,
    expression: '',
    targetType: 'string',
    mode: 'builder',
    parseResult: null,
    isParseValid: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Value mode builder states
// ---------------------------------------------------------------------------

const emptyValueState: ValueModeState = {
  mode: 'value',
  inputType: 'source',
  sources: [],
  transforms: [],
};

const validValueState: ValueModeState = {
  mode: 'value',
  inputType: 'source',
  sources: [{ path: 'order.amount' }],
  transforms: [],
};

const incompleteTransformState: ValueModeState = {
  mode: 'value',
  inputType: 'source',
  sources: [{ path: 'order.date' }],
  transforms: [
    {
      functionName: 'formatDate',
      parameters: [
        { name: 'format', value: '', type: 'string' }, // empty — incomplete
      ],
    },
  ],
};

const staticEmptyState: ValueModeState = {
  mode: 'value',
  inputType: 'static',
  sources: [],
  transforms: [],
  staticValue: undefined,
};

const staticFilledState: ValueModeState = {
  mode: 'value',
  inputType: 'static',
  sources: [],
  transforms: [],
  staticValue: { type: 'string', value: 'USD' },
};

// ---------------------------------------------------------------------------
// Conditional mode builder states
// ---------------------------------------------------------------------------

const noConditionsState: ConditionalModeState = {
  mode: 'conditional',
  condition: { operator: 'and', conditions: [] },
  thenBranch: { kind: 'static', value: 'yes' },
  elseBranch: { kind: 'static', value: 'no' },
};

const incompleteConditionState: ConditionalModeState = {
  mode: 'conditional',
  condition: {
    operator: 'and',
    conditions: [
      {
        leftOperand: { kind: 'source', value: '' }, // empty left operand
        comparison: 'eq',
        rightOperand: { kind: 'static', value: '10' },
      },
    ],
  },
  thenBranch: { kind: 'static', value: 'yes' },
  elseBranch: { kind: 'static', value: 'no' },
};

const missingThenState: ConditionalModeState = {
  mode: 'conditional',
  condition: {
    operator: 'and',
    conditions: [
      {
        leftOperand: { kind: 'source', value: 'order.amount' },
        comparison: 'gt',
        rightOperand: { kind: 'static', value: '0' },
      },
    ],
  },
  thenBranch: { kind: 'static', value: '' }, // empty
  elseBranch: { kind: 'static', value: 'no' },
};

const missingElseState: ConditionalModeState = {
  mode: 'conditional',
  condition: {
    operator: 'and',
    conditions: [
      {
        leftOperand: { kind: 'source', value: 'order.amount' },
        comparison: 'gt',
        rightOperand: { kind: 'static', value: '0' },
      },
    ],
  },
  thenBranch: { kind: 'static', value: 'yes' },
  elseBranch: { kind: 'static', value: '' }, // empty
};

const validConditionalState: ConditionalModeState = {
  mode: 'conditional',
  condition: {
    operator: 'and',
    conditions: [
      {
        leftOperand: { kind: 'source', value: 'order.amount' },
        comparison: 'gt',
        rightOperand: { kind: 'static', value: '0' },
      },
    ],
  },
  thenBranch: { kind: 'static', value: 'yes' },
  elseBranch: { kind: 'static', value: 'no' },
};

// ---------------------------------------------------------------------------
// ValueMap mode builder states
// ---------------------------------------------------------------------------

const noSourceValueMapState: ValueMapModeState = {
  mode: 'valueMap',
  inputSource: '',
  mappings: [{ whenValue: 'A', mapTo: 'Alpha' }],
  fallback: { kind: 'value', value: 'Unknown' },
};

const emptyRowsValueMapState: ValueMapModeState = {
  mode: 'valueMap',
  inputSource: 'order.status',
  mappings: [],
  fallback: { kind: 'value', value: 'Unknown' },
};

const missingDefaultValueMapState: ValueMapModeState = {
  mode: 'valueMap',
  inputSource: 'order.status',
  mappings: [{ whenValue: 'A', mapTo: 'Alpha' }],
  fallback: { kind: 'value', value: '' }, // empty default
};

const validValueMapState: ValueMapModeState = {
  mode: 'valueMap',
  inputSource: 'order.status',
  mappings: [{ whenValue: 'A', mapTo: 'Alpha' }],
  fallback: { kind: 'value', value: 'Unknown' },
};

// ---------------------------------------------------------------------------
// Value mode structural validation
// ---------------------------------------------------------------------------

describe('useBuilderValidation — Value mode structural validation', () => {
  it('returns missing_source when no source selected and no static value', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: emptyValueState,
          expression: 'source("")', // non-empty expression to trigger structural check
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues).toHaveLength(1);
    expect(result.current.structureIssues[0].key).toBe('missing_source');
  });

  it('returns valid when source is selected with no transforms', () => {
    const expr = 'source("order.amount")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
    expect(result.current.structureIssues).toHaveLength(0);
  });

  it('returns incomplete_transform when transform has empty required parameter', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: incompleteTransformState,
          expression: 'formatDate(source("order.date"), "")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues[0].key).toBe('incomplete_transform');
    expect(result.current.structureIssues[0].message).toContain('formatDate');
  });

  it('returns missing_source when static inputType but no staticValue', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: staticEmptyState,
          expression: 'static("")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues[0].key).toBe('missing_source');
  });

  it('returns valid when static inputType with staticValue provided', () => {
    const expr = '"USD"';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: staticFilledState,
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
    expect(result.current.structureIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conditional mode structural validation
// ---------------------------------------------------------------------------

describe('useBuilderValidation — Conditional mode structural validation', () => {
  it('returns missing_condition when no condition rows', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: noConditionsState,
          expression: 'if(true, "yes", "no")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues[0].key).toBe('missing_condition');
  });

  it('returns incomplete_condition when condition row has empty left operand', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: incompleteConditionState,
          expression: 'if(eq("", "10"), "yes", "no")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues[0].key).toBe('incomplete_condition');
  });

  it('returns missing_then when then branch is empty', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: missingThenState,
          expression: 'if(gt(source("order.amount"), 0), "", "no")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    const keys = result.current.structureIssues.map((i) => i.key);
    expect(keys).toContain('missing_then');
  });

  it('returns missing_else when else branch is empty', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: missingElseState,
          expression: 'if(gt(source("order.amount"), 0), "yes", "")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    const keys = result.current.structureIssues.map((i) => i.key);
    expect(keys).toContain('missing_else');
  });

  it('returns valid when condition, then, and else are all complete', () => {
    const expr = 'if(gt(source("order.amount"), 0), "yes", "no")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validConditionalState,
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
    expect(result.current.structureIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ValueMap mode structural validation
// ---------------------------------------------------------------------------

describe('useBuilderValidation — ValueMap mode structural validation', () => {
  it('returns missing_source when inputSource is empty', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: noSourceValueMapState,
          expression: 'valueMap(source(""), ...)',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    expect(result.current.structureIssues[0].key).toBe('missing_source');
  });

  it('returns empty_map_rows when no mapping rows', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: emptyRowsValueMapState,
          expression: 'valueMap(source("order.status"))',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    const keys = result.current.structureIssues.map((i) => i.key);
    expect(keys).toContain('empty_map_rows');
  });

  it('returns missing_default when fallback value is empty', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: missingDefaultValueMapState,
          expression: 'valueMap(source("order.status"), "A", "Alpha")',
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(false);
    const keys = result.current.structureIssues.map((i) => i.key);
    expect(keys).toContain('missing_default');
  });

  it('returns valid when source, rows, and default are all provided', () => {
    const expr = 'coalesce(source("order.status"), "Unknown")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueMapState,
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
    expect(result.current.structureIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Editor mode — structural validation bypass
// ---------------------------------------------------------------------------

describe('useBuilderValidation — Editor mode', () => {
  it('always returns structureValid: true in Editor mode regardless of builder state', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: emptyValueState, // would fail in Builder mode
          expression: 'source("x")',
          mode: 'editor',
          isParseValid: true,
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
    expect(result.current.structureIssues).toHaveLength(0);
  });

  it('returns structureValid: true even when builderState is null in Editor mode', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: null,
          expression: 'upper(source("name"))',
          mode: 'editor',
          isParseValid: true,
        }),
      ),
    );
    expect(result.current.structureValid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Output type validation
// ---------------------------------------------------------------------------

describe('useBuilderValidation — output type validation', () => {
  it('reports no mismatch when expression type matches target type (string → string)', () => {
    const expr = 'upper(source("name"))';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(true);
    expect(result.current.outputTypeMismatch).toBeNull();
  });

  it('reports mismatch when number expression targets string field', () => {
    const expr = 'add(source("price"), source("tax"))';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(false);
    expect(result.current.outputTypeMismatch).not.toBeNull();
    expect(result.current.outputTypeMismatch?.inferredType).toBe('number');
    expect(result.current.outputTypeMismatch?.targetType).toBe('string');
    expect(result.current.outputTypeMismatch?.message).toContain('number');
    expect(result.current.outputTypeMismatch?.message).toContain('string');
  });

  it('reports no mismatch when inferred type is unknown (source() — schema-dependent)', () => {
    // source() returns 'any' in our adapter (no schema available)
    const expr = 'source("order.amount")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    // source() → 'any' → compatible with any target type
    expect(result.current.outputTypeValid).toBe(true);
    expect(result.current.outputTypeMismatch).toBeNull();
  });

  it('reports no mismatch when parseResult is null (empty expression)', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          expression: '',
          targetType: 'number',
          parseResult: null,
          isParseValid: true,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(true);
    expect(result.current.outputTypeMismatch).toBeNull();
  });

  it('reports no mismatch when parse failed (ast is null)', () => {
    const failedParseResult: ParseResult = { success: false, ast: null, diagnostics: [] };
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          expression: 'source(',
          targetType: 'number',
          parseResult: failedParseResult,
          isParseValid: false,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(true);
    expect(result.current.outputTypeMismatch).toBeNull();
  });

  it('reports no mismatch for cast() to matching type', () => {
    const expr = 'cast(source("x"), "number")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'number',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(true);
  });

  it('reports mismatch for cast() to wrong type', () => {
    const expr = 'cast(source("x"), "boolean")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(false);
    expect(result.current.outputTypeMismatch?.inferredType).toBe('boolean');
  });

  it('reports no mismatch for string literal targeting string field', () => {
    const expr = '"hello"';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: staticFilledState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(true);
  });

  it('reports mismatch for number literal targeting string field', () => {
    const expr = '42';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.outputTypeValid).toBe(false);
    expect(result.current.outputTypeMismatch?.inferredType).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// canApply and canSave derivation
// ---------------------------------------------------------------------------

describe('useBuilderValidation — canApply and canSave', () => {
  it('canApply is false when expression is empty', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(makeInput({ expression: '', isParseValid: true })),
    );
    expect(result.current.canApply).toBe(false);
  });

  it('canApply is false when parse is invalid', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: 'source("x")',
          isParseValid: false,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.canApply).toBe(false);
  });

  it('canApply is false when structural validation fails in Builder mode', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: emptyValueState,
          expression: 'source("")',
          isParseValid: true,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.canApply).toBe(false);
  });

  it('canApply is true when expression is valid and structural checks pass in Builder mode', () => {
    const expr = 'source("order.amount")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.canApply).toBe(true);
  });

  it('canApply is true in Editor mode even when builderState would fail structural checks', () => {
    const expr = 'upper(source("name"))';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: emptyValueState, // would fail in Builder mode
          expression: expr,
          parseResult,
          isParseValid: parseResult.success,
          mode: 'editor',
        }),
      ),
    );
    expect(result.current.canApply).toBe(true);
  });

  it('canSave is false when canApply is false', () => {
    const { result } = renderHook(() =>
      useBuilderValidation(makeInput({ expression: '', isParseValid: true })),
    );
    expect(result.current.canSave).toBe(false);
  });

  it('canSave is false when output type mismatch exists even if canApply is true', () => {
    const expr = 'add(source("price"), source("tax"))'; // number expression
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string', // mismatch
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.canApply).toBe(true); // Apply is still allowed
    expect(result.current.canSave).toBe(false); // Save is blocked
  });

  it('canSave is true when canApply is true and output type is compatible', () => {
    const expr = 'upper(source("name"))';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'string',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    expect(result.current.canApply).toBe(true);
    expect(result.current.canSave).toBe(true);
  });

  it('canSave is true when output type is unknown (source() — no schema)', () => {
    const expr = 'source("order.amount")';
    const parseResult = parseExpr(expr);
    const { result } = renderHook(() =>
      useBuilderValidation(
        makeInput({
          builderState: validValueState,
          expression: expr,
          targetType: 'number',
          parseResult,
          isParseValid: parseResult.success,
          mode: 'builder',
        }),
      ),
    );
    // source() → 'any' → compatible → canSave true
    expect(result.current.canSave).toBe(true);
  });
});
