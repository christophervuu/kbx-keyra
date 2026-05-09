import { describe, expect, it } from 'vitest';

import { generateExpressionFromState } from '../pipeline-expression-generator';
import { decomposeExpression } from '../pipeline-decomposer';
import type { ExpressionBuilderState } from '../expression-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundtrip(expr: string): string {
  const result = decomposeExpression(expr);
  if (!result.success) throw new Error(`Decompose failed: ${result.reason}`);
  return generateExpressionFromState(result.state);
}

// ---------------------------------------------------------------------------
// Value mode — pipeline decomposition (AE-09)
// ---------------------------------------------------------------------------

describe('decomposeExpression — value mode', () => {
  it('source("email") → Value mode, 1 source, 0 transforms', () => {
    const result = decomposeExpression('source("email")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('value');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0].path).toBe('email');
    expect(state.transforms).toHaveLength(0);
  });

  it('AE-09: upper(trim(source("name"))) → Value mode, 2 transforms [trim, upper]', () => {
    const result = decomposeExpression('upper(trim(source("name")))');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('value');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.sources[0].path).toBe('name');
    expect(state.transforms).toHaveLength(2);
    expect(state.transforms[0].functionName).toBe('trim');
    expect(state.transforms[1].functionName).toBe('upper');
  });

  it('substring(source("code"), 0, 3) → Value mode, 1 transform with params', () => {
    const result = decomposeExpression('substring(source("code"), 0, 3)');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('value');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.sources[0].path).toBe('code');
    expect(state.transforms).toHaveLength(1);
    expect(state.transforms[0].functionName).toBe('substring');
    expect(state.transforms[0].parameters).toHaveLength(2);
    expect(state.transforms[0].parameters[0]).toMatchObject({ name: 'start', value: 0 });
    expect(state.transforms[0].parameters[1]).toMatchObject({ name: 'end', value: 3 });
  });

  it('static("N/A") → Value mode, staticValue', () => {
    const result = decomposeExpression('static("N/A")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('value');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.staticValue).toMatchObject({ type: 'string', value: 'N/A' });
  });

  it('static(42) → Value mode, staticValue number', () => {
    const result = decomposeExpression('static(42)');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.staticValue).toMatchObject({ type: 'number', value: 42 });
  });

  it('lower(source("email")) → Value mode, 1 transform', () => {
    const result = decomposeExpression('lower(source("email"))');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.transforms[0].functionName).toBe('lower');
  });
});

// ---------------------------------------------------------------------------
// Conditional mode decomposition (AE-04, AE-16)
// ---------------------------------------------------------------------------

describe('decomposeExpression — conditional mode', () => {
  it('AE-04: if(eq(source("status"), "active"), "Yes", "No") → Conditional mode', () => {
    const result = decomposeExpression('if(eq(source("status"), "active"), "Yes", "No")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('conditional');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    expect(state.condition.conditions).toHaveLength(1);
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('eq');
    expect(row.leftOperand).toMatchObject({ kind: 'source', value: 'status' });
    expect(row.rightOperand).toMatchObject({ kind: 'static', value: 'active' });
    expect(state.thenBranch).toMatchObject({ kind: 'static', value: 'Yes' });
    expect(state.elseBranch).toMatchObject({ kind: 'static', value: 'No' });
  });

  it('hydrates typed boolean static branches in conditional expressions', () => {
    const result = decomposeExpression('if(source("notes"), true, false)');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    expect(state.thenBranch).toMatchObject({ kind: 'static', value: 'true', valueType: 'boolean' });
    expect(state.elseBranch).toMatchObject({ kind: 'static', value: 'false', valueType: 'boolean' });
  });

  it('AE-16: if(gt(source("amount"), 100), "high", "low") → Conditional mode (mode auto-detection)', () => {
    const result = decomposeExpression('if(gt(source("amount"), 100), "high", "low")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('conditional');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('gt');
    expect(row.leftOperand).toMatchObject({ kind: 'source', value: 'amount' });
    expect(row.rightOperand).toMatchObject({ kind: 'expression', value: '100' });
  });

  it('nested if() in else → else-if chain', () => {
    const expr = 'if(eq(source("p"), "h"), "1", if(eq(source("p"), "m"), "2", "3"))';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('conditional');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    expect(state.elseBranch.kind).toBe('conditional');
    if (state.elseBranch.kind === 'conditional') {
      expect(state.elseBranch.value.mode).toBe('conditional');
    }
  });

  it('isNull condition → isNull comparison operator', () => {
    const result = decomposeExpression('if(isNull(source("field")), "empty", "filled")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('isNull');
  });

  it('not(isNull(...)) → isNotNull comparison operator', () => {
    const result = decomposeExpression('if(not(isNull(source("field"))), "filled", "empty")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('isNotNull');
  });

  it('if(source("flag"), ...) → isTruthy comparison operator', () => {
    const result = decomposeExpression('if(source("settings.notificationsEnabled"), "ENABLED", "DISABLED")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('isTruthy');
    expect(row.leftOperand).toMatchObject({ kind: 'source', value: 'settings.notificationsEnabled' });
  });

  it('if(not(source("flag")), ...) → isFalsy comparison operator', () => {
    const result = decomposeExpression('if(not(source("settings.notificationsEnabled")), "DISABLED", "ENABLED")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.comparison).toBe('isFalsy');
    expect(row.leftOperand).toMatchObject({ kind: 'source', value: 'settings.notificationsEnabled' });
  });
});

// ---------------------------------------------------------------------------
// Value Map mode decomposition
// ---------------------------------------------------------------------------

describe('decomposeExpression — valueMap mode', () => {
  it('valueMap(source("country"), {"US": "United States"}, "Unknown") → Value Map mode', () => {
    const result = decomposeExpression('valueMap(source("country"), {"US": "United States"}, "Unknown")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('valueMap');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'valueMap' }>;
    expect(state.inputSource).toBe('country');
    expect(state.mappings).toHaveLength(1);
    expect(state.mappings[0]).toMatchObject({ whenValue: 'US', mapTo: 'United States' });
    expect(state.fallback).toMatchObject({ kind: 'value', value: 'Unknown' });
  });

  it('valueMap with null fallback', () => {
    const result = decomposeExpression('valueMap(source("status"), {"A": "Active"}, null)');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'valueMap' }>;
    expect(state.fallback.kind).toBe('null');
  });

  it('valueMap with multiple entries', () => {
    const result = decomposeExpression('valueMap(source("code"), {"A": "Alpha", "B": "Beta"}, "Other")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'valueMap' }>;
    expect(state.mappings).toHaveLength(2);
  });

  it('hydrates typed boolean map entries and fallback', () => {
    const result = decomposeExpression('valueMap(source("notes"), {"": false, "present": true}, false)');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'valueMap' }>;
    expect(state.mappings[0]).toMatchObject({ whenValue: '', mapTo: 'false', mapToType: 'boolean' });
    expect(state.mappings[1]).toMatchObject({ whenValue: 'present', mapTo: 'true', mapToType: 'boolean' });
    expect(state.fallback).toMatchObject({ kind: 'value', value: 'false', valueType: 'boolean' });
  });
});

// ---------------------------------------------------------------------------
// Failure cases (AE-10)
// ---------------------------------------------------------------------------

describe('decomposeExpression — failure cases', () => {
  it('empty expression → failure', () => {
    const result = decomposeExpression('');
    expect(result.success).toBe(false);
  });

  it('syntax error → failure with reason', () => {
    const result = decomposeExpression('upper(source("name"');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/syntax/i);
    }
  });

  it('AE-10: complex unsupported expression → failure with meaningful reason', () => {
    // concat() is not a valid pipeline root (it takes multiple args, not a single pipeline input)
    // and is not a recognized mode root — should fail gracefully
    const result = decomposeExpression('map(source("items"), { "id": item("sku") })');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('unsupported root function → failure', () => {
    const result = decomposeExpression('concat(source("a"), source("b"))');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain('concat');
    }
  });

  it('pipeline exceeding max depth → failure', () => {
    // Build a 6-deep pipeline: f(f(f(f(f(f(source("x")))))))
    const deep = 'lower(lower(lower(lower(lower(lower(source("x")))))))';
    const result = decomposeExpression(deep);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toMatch(/too deeply/i);
    }
  });

  it('valueMap with non-source first arg → failure', () => {
    const result = decomposeExpression('valueMap(static("x"), {"A": "B"}, null)');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-03: pipeline branch decomposition
// ---------------------------------------------------------------------------

describe('decomposeExpression — T-03 pipeline branches', () => {
  it('T-03-DEC-01: transform chain in then branch → kind=pipeline', () => {
    const expr = 'if(eq(source("status"), "active"), upper(source("tier")), "inactive")';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    expect(state.thenBranch.kind).toBe('pipeline');
    if (state.thenBranch.kind === 'pipeline') {
      expect(state.thenBranch.state.sources[0].path).toBe('tier');
      expect(state.thenBranch.state.transforms[0].functionName).toBe('upper');
    }
  });

  it('T-03-DEC-02: transform chain in else branch → kind=pipeline', () => {
    const expr = 'if(eq(source("flag"), "yes"), "ok", lower(source("fallback_label")))';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    expect(state.elseBranch.kind).toBe('pipeline');
    if (state.elseBranch.kind === 'pipeline') {
      expect(state.elseBranch.state.sources[0].path).toBe('fallback_label');
      expect(state.elseBranch.state.transforms[0].functionName).toBe('lower');
    }
  });

  it('T-03-DEC-03: transform chain on left operand → kind=pipeline with pipelineState', () => {
    const expr = 'if(gt(length(source("name")), 5), "long", "short")';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'conditional' }>;
    const row = state.condition.conditions[0] as import('../expression-builder-state').ConditionRow;
    expect(row.leftOperand.kind).toBe('pipeline');
    if (row.leftOperand.kind === 'pipeline') {
      expect(row.leftOperand.pipelineState?.sources[0].path).toBe('name');
      expect(row.leftOperand.pipelineState?.transforms[0].functionName).toBe('length');
    }
  });

  it('T-03-DEC-04: roundtrip — pipeline then branch', () => {
    const expr = 'if(eq(source("status"), "active"), upper(source("tier")), "inactive")';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const regenerated = generateExpressionFromState(result.state);
    expect(regenerated).toBe(expr);
  });

  it('T-03-DEC-05: roundtrip — pipeline left operand', () => {
    const expr = 'if(gt(length(source("name")), 5), "long", "short")';
    const result = decomposeExpression(expr);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const regenerated = generateExpressionFromState(result.state);
    expect(regenerated).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip tests: generate → decompose → generate produces identical DSL
// ---------------------------------------------------------------------------

describe('roundtrip: generateExpressionFromState ↔ decomposeExpression', () => {
  it('AE-01: direct copy', () => {
    expect(roundtrip('source("email")')).toBe('source("email")');
  });

  it('AE-02: 2-step pipeline', () => {
    expect(roundtrip('lower(trim(source("email")))')).toBe('lower(trim(source("email")))');
  });

  it('AE-03: substring with params', () => {
    expect(roundtrip('substring(source("code"), 0, 3)')).toBe('substring(source("code"), 0, 3)');
  });

  it('AE-04: conditional eq', () => {
    expect(roundtrip('if(eq(source("status"), "active"), "Yes", "No")')).toBe(
      'if(eq(source("status"), "active"), "Yes", "No")',
    );
  });

  it('AE-09: upper(trim(source("name")))', () => {
    expect(roundtrip('upper(trim(source("name")))')).toBe('upper(trim(source("name")))');
  });

  it('AE-16: gt conditional', () => {
    expect(roundtrip('if(gt(source("amount"), 100), "high", "low")')).toBe(
      'if(gt(source("amount"), 100), "high", "low")',
    );
  });

  it('valueMap roundtrip', () => {
    const expr = 'valueMap(source("country"), {"US": "United States"}, "Unknown")';
    expect(roundtrip(expr)).toBe(expr);
  });

  it('static string roundtrip (T-06: bare literal)', () => {
    const state: ExpressionBuilderState = {
      mode: 'value',
      inputType: 'static',
      sources: [],
      transforms: [],
      staticValue: { type: 'string', value: 'hello' },
    };
    const expr = generateExpressionFromState(state);
    // expr is now `"hello"` (bare literal)
    expect(expr).toBe('"hello"');
    expect(roundtrip(expr)).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// T-06: bare literal decomposition
// ---------------------------------------------------------------------------

describe('decomposeExpression — T-06 bare literals at root', () => {
  it('T-06-DEC-01: bare string literal → static value state', () => {
    const result = decomposeExpression('"hello"');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.state.mode).toBe('value');
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('static');
    expect(state.staticValue).toMatchObject({ type: 'string', value: 'hello' });
  });

  it('T-06-DEC-02: bare number literal → static value state', () => {
    const result = decomposeExpression('42');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('static');
    expect(state.staticValue).toMatchObject({ type: 'number', value: 42 });
  });

  it('T-06-DEC-03: bare true → static boolean', () => {
    const result = decomposeExpression('true');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('static');
    expect(state.staticValue).toMatchObject({ type: 'boolean', value: true });
  });

  it('T-06-DEC-04: bare false → static boolean', () => {
    const result = decomposeExpression('false');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.staticValue).toMatchObject({ type: 'boolean', value: false });
  });

  it('T-06-DEC-05: bare null → static null', () => {
    const result = decomposeExpression('null');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('static');
    expect(state.staticValue?.type).toBe('null');
  });

  it('T-06-DEC-06: source() decomposition has inputType=source', () => {
    const result = decomposeExpression('source("email")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('source');
  });

  it('T-06-DEC-07: legacy static("N/A") → inputType=static (backward compat)', () => {
    const result = decomposeExpression('static("N/A")');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const state = result.state as Extract<ExpressionBuilderState, { mode: 'value' }>;
    expect(state.inputType).toBe('static');
    expect(state.staticValue).toMatchObject({ type: 'string', value: 'N/A' });
  });

  it('T-06-DEC-08: bare literal roundtrip — "hello" → decompose → generate → "hello"', () => {
    expect(roundtrip('"hello"')).toBe('"hello"');
  });

  it('T-06-DEC-09: bare number roundtrip — 99 → decompose → generate → 99', () => {
    expect(roundtrip('99')).toBe('99');
  });
});
