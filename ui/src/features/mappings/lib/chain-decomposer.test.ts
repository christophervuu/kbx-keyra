import { describe, expect, it } from 'vitest';
import { decomposeToChainState } from './chain-decomposer';
import { generateExpressionFromChain } from './chain-expression-generator';
import type {
  ChainBuilderState,
  ConditionLogicStep,
  ValueMapLogicStep,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectSuccess(result: ReturnType<typeof decomposeToChainState>): ChainBuilderState {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('Expected success');
  return result.state;
}

function expectFailure(result: ReturnType<typeof decomposeToChainState>): string {
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Expected failure');
  return result.reason;
}

// ---------------------------------------------------------------------------
// Empty expression
// ---------------------------------------------------------------------------

describe('decomposeToChainState — empty expression', () => {
  it('returns empty chain state for empty string', () => {
    const state = expectSuccess(decomposeToChainState(''));
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBeUndefined();
    expect(state.logicSteps).toHaveLength(0);
  });

  it('returns empty chain state for whitespace-only string', () => {
    const state = expectSuccess(decomposeToChainState('   '));
    expect(state.entryType).toBe('source');
    expect(state.logicSteps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Direct source copy
// ---------------------------------------------------------------------------

describe('decomposeToChainState — direct source copy', () => {
  it('AE-01: decomposes source("source.firstName") → source entry, no steps', () => {
    const state = expectSuccess(decomposeToChainState('source("source.firstName")'));
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('source.firstName');
    expect(state.logicSteps).toHaveLength(0);
  });

  it('decomposes source("x") → source entry', () => {
    const state = expectSuccess(decomposeToChainState('source("x")'));
    expect(state.sourcePath).toBe('x');
  });
});

// ---------------------------------------------------------------------------
// Static literals
// ---------------------------------------------------------------------------

describe('decomposeToChainState — static literals', () => {
  it('AE-02: decomposes "WEB" → static entry with string value', () => {
    const state = expectSuccess(decomposeToChainState('"WEB"'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'string', value: 'WEB' });
    expect(state.logicSteps).toHaveLength(0);
  });

  it('decomposes 42 → static entry with number value', () => {
    const state = expectSuccess(decomposeToChainState('42'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'number', value: 42 });
  });

  it('decomposes true → static entry with boolean value', () => {
    const state = expectSuccess(decomposeToChainState('true'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'boolean', value: true });
  });

  it('decomposes false → static entry with boolean value', () => {
    const state = expectSuccess(decomposeToChainState('false'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'boolean', value: false });
  });
});

// ---------------------------------------------------------------------------
// static() backward compat
// ---------------------------------------------------------------------------

describe('decomposeToChainState — static() backward compat', () => {
  it('decomposes static("value") → static entry with string value', () => {
    const state = expectSuccess(decomposeToChainState('static("value")'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'string', value: 'value' });
  });

  it('decomposes static("WEB") → static entry', () => {
    const state = expectSuccess(decomposeToChainState('static("WEB")'));
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'string', value: 'WEB' });
  });
});

// ---------------------------------------------------------------------------
// AE-14: Transform chain backward compat
// ---------------------------------------------------------------------------

describe('decomposeToChainState — AE-14: transform chains', () => {
  it('AE-14: decomposes upper(source("customer.name")) → source + [upper]', () => {
    const state = expectSuccess(decomposeToChainState('upper(source("customer.name"))'));
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('customer.name');
    expect(state.logicSteps).toHaveLength(1);
    expect(state.logicSteps[0]?.kind).toBe('transform');
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('upper');
      expect(state.logicSteps[0].args).toHaveLength(0);
    }
  });

  it('decomposes lower(source("x")) → source + [lower]', () => {
    const state = expectSuccess(decomposeToChainState('lower(source("x"))'));
    expect(state.sourcePath).toBe('x');
    expect(state.logicSteps).toHaveLength(1);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('lower');
    }
  });

  it('decomposes multiply(source("order.amount"), 100) → source + [multiply(100)]', () => {
    const state = expectSuccess(decomposeToChainState('multiply(source("order.amount"), 100)'));
    expect(state.sourcePath).toBe('order.amount');
    expect(state.logicSteps).toHaveLength(1);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('multiply');
      expect(state.logicSteps[0].args).toHaveLength(1);
      expect(state.logicSteps[0].args[0]).toEqual({ mode: 'literal', value: '100' });
    }
  });

  it('decomposes round(multiply(source("x"), 10), 2) → source + [multiply(10), round(2)]', () => {
    const state = expectSuccess(decomposeToChainState('round(multiply(source("x"), 10), 2)'));
    expect(state.sourcePath).toBe('x');
    expect(state.logicSteps).toHaveLength(2);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('multiply');
      expect(state.logicSteps[0].args[0]).toEqual({ mode: 'literal', value: '10' });
    }
    if (state.logicSteps[1]?.kind === 'transform') {
      expect(state.logicSteps[1].functionName).toBe('round');
      expect(state.logicSteps[1].args[0]).toEqual({ mode: 'literal', value: '2' });
    }
  });

  it('decomposes lower(trim(upper(source("x")))) → 3 transform steps', () => {
    const state = expectSuccess(decomposeToChainState('lower(trim(upper(source("x"))))'));
    expect(state.sourcePath).toBe('x');
    expect(state.logicSteps).toHaveLength(3);
    const names = state.logicSteps.map((s) => (s.kind === 'transform' ? s.functionName : ''));
    expect(names).toEqual(['upper', 'trim', 'lower']);
  });
});

// ---------------------------------------------------------------------------
// AE-15: Condition backward compat
// ---------------------------------------------------------------------------

describe('decomposeToChainState — AE-15: conditions', () => {
  it('AE-15: decomposes if(eq(source("tier"), "gold"), "VIP", "Standard") → source + condition step', () => {
    const state = expectSuccess(
      decomposeToChainState('if(eq(source("tier"), "gold"), "VIP", "Standard")'),
    );
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('tier');
    expect(state.logicSteps).toHaveLength(1);
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.kind).toBe('condition');
    expect(step.operator).toBe('eq');
    expect(step.rightOperand).toEqual({ kind: 'literal', value: 'gold' });
    expect(step.thenBranch).toEqual({ kind: 'static', value: { type: 'string', value: 'VIP' } });
    expect(step.elseBranch).toEqual({ kind: 'static', value: { type: 'string', value: 'Standard' } });
  });

  it('decomposes if(isNull(source("x")), "null", "ok") → isNull condition', () => {
    const state = expectSuccess(
      decomposeToChainState('if(isNull(source("x")), "null", "ok")'),
    );
    expect(state.sourcePath).toBe('x');
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.operator).toBe('isNull');
  });

  it('decomposes if(not(isNull(source("x"))), "ok", "null") → isNotNull condition', () => {
    const state = expectSuccess(
      decomposeToChainState('if(not(isNull(source("x"))), "ok", "null")'),
    );
    expect(state.sourcePath).toBe('x');
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.operator).toBe('isNotNull');
  });

  it('decomposes if(source("x"), "yes", "no") → isTruthy condition', () => {
    const state = expectSuccess(decomposeToChainState('if(source("x"), "yes", "no")'));
    expect(state.sourcePath).toBe('x');
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.operator).toBe('isTruthy');
    expect(step.useCurrentValue).toBe(true);
  });

  it('decomposes if(not(source("x")), "yes", "no") → isFalsy condition', () => {
    const state = expectSuccess(decomposeToChainState('if(not(source("x")), "yes", "no")'));
    expect(state.sourcePath).toBe('x');
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.operator).toBe('isFalsy');
  });

  it('decomposes if(gt(source("amount"), 100), "high", "low") → gt condition', () => {
    const state = expectSuccess(
      decomposeToChainState('if(gt(source("amount"), 100), "high", "low")'),
    );
    expect(state.sourcePath).toBe('amount');
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.operator).toBe('gt');
    expect(step.rightOperand).toEqual({ kind: 'literal', value: '100' });
  });
});

// ---------------------------------------------------------------------------
// AE-16: Value map backward compat
// ---------------------------------------------------------------------------

describe('decomposeToChainState — AE-16: value maps', () => {
  it('AE-16: decomposes valueMap(source("code"), {"A": "Active", "I": "Inactive"}, "Unknown")', () => {
    const state = expectSuccess(
      decomposeToChainState(
        'valueMap(source("code"), {"A": "Active", "I": "Inactive"}, "Unknown")',
      ),
    );
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('code');
    expect(state.logicSteps).toHaveLength(1);
    const step = state.logicSteps[0] as ValueMapLogicStep;
    expect(step.kind).toBe('valueMap');
    expect(step.mappings).toHaveLength(2);
    expect(step.mappings[0]?.whenValue).toBe('A');
    expect(step.mappings[1]?.whenValue).toBe('I');
    expect(step.defaultValue).toEqual({ kind: 'static', value: { type: 'string', value: 'Unknown' } });
  });
});

// ---------------------------------------------------------------------------
// Mixed chain: transform + condition (Q5)
// ---------------------------------------------------------------------------

describe('decomposeToChainState — mixed chains', () => {
  it('decomposes if(gt(upper(source("x")), "M"), "high", "low") → source + transform + condition', () => {
    const state = expectSuccess(
      decomposeToChainState('if(gt(upper(source("x")), "M"), "high", "low")'),
    );
    // The condition's left operand is upper(source("x")), not source("x") directly.
    // The decomposer extracts source("x") as the base and upper as a custom left operand.
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('x');
    // The condition step should be present
    expect(state.logicSteps.length).toBeGreaterThanOrEqual(1);
    const lastStep = state.logicSteps[state.logicSteps.length - 1];
    expect(lastStep?.kind).toBe('condition');
  });
});

// ---------------------------------------------------------------------------
// Failure cases
// ---------------------------------------------------------------------------

describe('decomposeToChainState — failure cases', () => {
  it('returns failure for syntax error', () => {
    const result = decomposeToChainState('source(');
    expect(result.success).toBe(false);
  });

  it('returns failure for unsupported root function (concat with multiple sources)', () => {
    // concat() is not in CHAINABLE_TRANSFORMS as a chain root (it's multi-input)
    const result = decomposeToChainState('concat(source("a"), source("b"), source("c"))');
    // concat is not chainable from a single source, so this should fail
    expect(result.success).toBe(false);
  });

  it('returns failure reason as a non-empty string', () => {
    const result = decomposeToChainState('source(');
    if (!result.success) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests: generate → decompose → compare
// ---------------------------------------------------------------------------

describe('decomposeToChainState — round-trip tests', () => {
  it('round-trip: source copy', () => {
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.firstName',
      logicSteps: [],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.entryType).toBe('source');
    expect(state.sourcePath).toBe('order.firstName');
    expect(state.logicSteps).toHaveLength(0);
  });

  it('round-trip: static string', () => {
    const original: ChainBuilderState = {
      entryType: 'static',
      staticValue: { type: 'string', value: 'WEB' },
      logicSteps: [],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.entryType).toBe('static');
    expect(state.staticValue).toEqual({ type: 'string', value: 'WEB' });
  });

  it('round-trip: source + upper transform', () => {
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.name',
      logicSteps: [{ kind: 'transform', functionName: 'upper', args: [] }],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    expect(expression).toBe('upper(source("customer.name"))');
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.sourcePath).toBe('customer.name');
    expect(state.logicSteps).toHaveLength(1);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('upper');
    }
  });

  it('round-trip: source + multiply(100)', () => {
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [{ kind: 'transform', functionName: 'multiply', args: [{ mode: 'literal', value: '100' }] }],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    expect(expression).toBe('multiply(source("order.amount"), 100)');
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.sourcePath).toBe('order.amount');
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('multiply');
      expect(state.logicSteps[0].args[0]).toEqual({ mode: 'literal', value: '100' });
    }
  });

  it('round-trip: source + condition', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'VIP' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'Standard' } },
    };
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.tier',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    expect(expression).toBe('if(eq(source("customer.tier"), "premium"), "VIP", "Standard")');
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.sourcePath).toBe('customer.tier');
    expect(state.logicSteps).toHaveLength(1);
    const step = state.logicSteps[0] as ConditionLogicStep;
    expect(step.kind).toBe('condition');
    expect(step.operator).toBe('eq');
    expect(step.rightOperand).toEqual({ kind: 'literal', value: 'premium' });
  });

  it('round-trip: source + value map', () => {
    const valueMapStep: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'static', value: { type: 'string', value: 'Active' } } },
        { whenValue: 'I', outputValue: { kind: 'static', value: { type: 'string', value: 'Inactive' } } },
      ],
      defaultValue: { kind: 'static', value: { type: 'string', value: 'Unknown' } },
    };
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status_code',
      logicSteps: [valueMapStep],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.sourcePath).toBe('order.status_code');
    expect(state.logicSteps).toHaveLength(1);
    const step = state.logicSteps[0] as ValueMapLogicStep;
    expect(step.kind).toBe('valueMap');
    expect(step.mappings).toHaveLength(2);
    expect(step.mappings[0]?.whenValue).toBe('A');
    expect(step.mappings[1]?.whenValue).toBe('I');
  });

  it('round-trip: multi-step transform chain', () => {
    const original: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        { kind: 'transform', functionName: 'trim', args: [] },
      ],
      expandedStepIndex: null,
    };
    const expression = generateExpressionFromChain(original);
    expect(expression).toBe('trim(upper(source("x")))');
    const result = decomposeToChainState(expression);
    const state = expectSuccess(result);
    expect(state.sourcePath).toBe('x');
    expect(state.logicSteps).toHaveLength(2);
    const names = state.logicSteps.map((s) => (s.kind === 'transform' ? s.functionName : ''));
    expect(names).toEqual(['upper', 'trim']);
  });
});
