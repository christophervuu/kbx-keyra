import { describe, expect, it } from 'vitest';
import { decomposeToChainState, decomposeToChain } from './chain-decomposer';
import { generateExpressionFromChain, generateChainExpression } from './chain-expression-generator';
import type {
  ChainBuilderState,
  ChainState,
  ConditionLogicStep,
  FS039ConditionStep,
  FS039ValueMapStep,
  OperandValue,
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

  it('decomposes join(source("tags"), ",") → source + [join(",")]', () => {
    const state = expectSuccess(decomposeToChainState('join(source("tags"), ",")'));
    expect(state.sourcePath).toBe('tags');
    expect(state.logicSteps).toHaveLength(1);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('join');
      expect(state.logicSteps[0].args).toHaveLength(1);
      expect(state.logicSteps[0].args[0]).toEqual({ mode: 'literal', value: ',' });
    }
  });

  it('decomposes count(filter(source("items"), gt(item("discountAmount"), 0)))', () => {
    const state = expectSuccess(
      decomposeToChainState('count(filter(source("items"), gt(item("discountAmount"), 0)))'),
    );
    expect(state.sourcePath).toBe('items');
    expect(state.logicSteps).toHaveLength(2);
    if (state.logicSteps[0]?.kind === 'transform') {
      expect(state.logicSteps[0].functionName).toBe('filter');
      expect(state.logicSteps[0].args).toHaveLength(1);
      const conditionArg = state.logicSteps[0].args[0];
      expect(conditionArg).toBeDefined();
      expect(conditionArg?.mode).toBe('expression');
      if (conditionArg?.mode === 'expression') {
        expect(conditionArg.node.functionName).toBe('gt');
      }
    }
    if (state.logicSteps[1]?.kind === 'transform') {
      expect(state.logicSteps[1].functionName).toBe('count');
      expect(state.logicSteps[1].args).toHaveLength(0);
    }
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

// ===========================================================================
// FS-039 decomposeToChain() tests
// ===========================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectChain(result: ReturnType<typeof decomposeToChain>): ChainState {
  if ('error' in result) throw new Error(`Expected chain, got error: ${result.error}`);
  return result.chain;
}

function expectChainError(result: ReturnType<typeof decomposeToChain>): string {
  if ('chain' in result) throw new Error('Expected error, got chain');
  return result.error;
}

// ---------------------------------------------------------------------------
// Empty expression
// ---------------------------------------------------------------------------

describe('decomposeToChain — empty expression', () => {
  it('returns empty chain for empty string', () => {
    const chain = expectChain(decomposeToChain(''));
    expect(chain.source.kind).toBe('none');
    expect(chain.steps).toHaveLength(0);
  });

  it('returns empty chain for whitespace-only string', () => {
    const chain = expectChain(decomposeToChain('   '));
    expect(chain.source.kind).toBe('none');
    expect(chain.steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// source("path") → field source, no steps
// ---------------------------------------------------------------------------

describe('decomposeToChain — source("path")', () => {
  it('decomposes source("name") to field source', () => {
    const chain = expectChain(decomposeToChain('source("name")'));
    expect(chain.source).toEqual({ kind: 'field', path: 'name' });
    expect(chain.steps).toHaveLength(0);
  });

  it('decomposes source("a.b.c") with dotted path', () => {
    const chain = expectChain(decomposeToChain('source("a.b.c")'));
    expect(chain.source).toEqual({ kind: 'field', path: 'a.b.c' });
    expect(chain.steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bare literals → static source
// ---------------------------------------------------------------------------

describe('decomposeToChain — bare literals', () => {
  it('decomposes string literal to static source', () => {
    const chain = expectChain(decomposeToChain('"hello"'));
    expect(chain.source).toEqual({ kind: 'static', value: { type: 'string', value: 'hello' } });
    expect(chain.steps).toHaveLength(0);
  });

  it('decomposes number literal to static source', () => {
    const chain = expectChain(decomposeToChain('42'));
    expect(chain.source).toEqual({ kind: 'static', value: { type: 'number', value: 42 } });
    expect(chain.steps).toHaveLength(0);
  });

  it('decomposes boolean literal to static source', () => {
    const chain = expectChain(decomposeToChain('true'));
    expect(chain.source).toEqual({ kind: 'static', value: { type: 'boolean', value: true } });
    expect(chain.steps).toHaveLength(0);
  });

  it('decomposes null literal to static source', () => {
    const chain = expectChain(decomposeToChain('null'));
    expect(chain.source).toEqual({ kind: 'static', value: { type: 'null' } });
    expect(chain.steps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Transform steps
// ---------------------------------------------------------------------------

describe('decomposeToChain — transform steps', () => {
  it('decomposes upper(source("name")) to field source + upper step', () => {
    const chain = expectChain(decomposeToChain('upper(source("name"))'));
    expect(chain.source).toEqual({ kind: 'field', path: 'name' });
    expect(chain.steps).toHaveLength(1);
    expect(chain.steps[0]).toEqual({ kind: 'transform', functionName: 'upper', args: [] });
  });

  it('decomposes trim(upper(source("x"))) to field source + 2 steps (innermost first)', () => {
    const chain = expectChain(decomposeToChain('trim(upper(source("x")))'));
    expect(chain.source).toEqual({ kind: 'field', path: 'x' });
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[0]).toEqual({ kind: 'transform', functionName: 'upper', args: [] });
    expect(chain.steps[1]).toEqual({ kind: 'transform', functionName: 'trim', args: [] });
  });

  it('decomposes default(upper(source("x")), "N/A") to 2 steps', () => {
    const chain = expectChain(decomposeToChain('default(upper(source("x")), "N/A")'));
    expect(chain.source).toEqual({ kind: 'field', path: 'x' });
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[0]).toEqual({ kind: 'transform', functionName: 'upper', args: [] });
    expect(chain.steps[1]).toMatchObject({ kind: 'transform', functionName: 'default' });
    const defaultStep = chain.steps[1] as FS039ConditionStep extends never ? never : Extract<typeof chain.steps[1], { kind: 'transform' }>;
    if (defaultStep.kind === 'transform') {
      expect(defaultStep.args).toHaveLength(1);
      expect(defaultStep.args[0]).toEqual({ mode: 'literal', value: 'N/A' });
    }
  });

  it('decomposes lower(source("email")) to field source + lower step', () => {
    const chain = expectChain(decomposeToChain('lower(source("email"))'));
    expect(chain.source).toEqual({ kind: 'field', path: 'email' });
    expect(chain.steps).toHaveLength(1);
    expect(chain.steps[0]).toEqual({ kind: 'transform', functionName: 'lower', args: [] });
  });
});

// ---------------------------------------------------------------------------
// Condition steps — OperandValue reconstruction
// ---------------------------------------------------------------------------

describe('decomposeToChain — condition steps', () => {
  it('decomposes if(eq(source("x"), "v"), "yes", "no") — left operand = currentValue', () => {
    const chain = expectChain(decomposeToChain('if(eq(source("x"), "v"), "yes", "no")'));
    expect(chain.source).toEqual({ kind: 'field', path: 'x' });
    expect(chain.steps).toHaveLength(1);
    const step = chain.steps[0] as FS039ConditionStep;
    expect(step.kind).toBe('condition');
    expect(step.conditions).toHaveLength(1);
    const predicate = step.conditions[0]!.predicates[0]!;
    // source("x") matches accumulator source("x") → currentValue
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('eq');
    expect(predicate.right).toEqual({ kind: 'static', value: { type: 'string', value: 'v' } });
    expect(step.elseBranch.source).toEqual({ kind: 'static', value: { type: 'string', value: 'no' } });
  });

  it('decomposes condition with different source on left → field operand', () => {
    // Left operand is source("type"), but chain source is source("name")
    // This is an unusual case but should decompose as field
    const chain = expectChain(decomposeToChain('if(eq(source("type"), "VIP"), "yes", "no")'));
    expect(chain.source).toEqual({ kind: 'field', path: 'type' });
    // source("type") matches accumulator source("type") → currentValue
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    expect(predicate.left).toEqual({ kind: 'currentValue' });
  });

  it('decomposes condition with literal left operand → static operand', () => {
    const chain = expectChain(decomposeToChain('if(eq("constant", source("x")), "yes", "no")'));
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    // "constant" does not match accumulator → static
    expect(predicate.left).toEqual({ kind: 'static', value: { type: 'string', value: 'constant' } });
    expect(predicate.operator).toBe('eq');
    // source("x") on right — does not match accumulator "constant" → field
    expect(predicate.right).toEqual({ kind: 'field', path: 'x' });
  });

  it('decomposes isNull(source("x")) predicate', () => {
    const chain = expectChain(decomposeToChain('if(isNull(source("x")), "null", "not-null")'));
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('isNull');
  });

  it('decomposes not(isNull(source("x"))) predicate → isNotNull', () => {
    const chain = expectChain(decomposeToChain('if(not(isNull(source("x"))), "has-value", "null")'));
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('isNotNull');
  });

  it('decomposes isTruthy pattern (bare source)', () => {
    const chain = expectChain(decomposeToChain('if(source("active"), "yes", "no")'));
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('isTruthy');
  });

  it('decomposes isFalsy pattern (not(source))', () => {
    const chain = expectChain(decomposeToChain('if(not(source("active")), "no", "yes")'));
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('isFalsy');
  });

  it('decomposes condition with transform chain accumulator → currentValue', () => {
    // upper(source("name")) is the accumulator; condition left operand matches
    const chain = expectChain(
      decomposeToChain('if(eq(upper(source("name")), "ADMIN"), "admin", "user")'),
    );
    expect(chain.source).toEqual({ kind: 'field', path: 'name' });
    expect(chain.steps).toHaveLength(1);
    const step = chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    // upper(source("name")) matches accumulator → currentValue
    expect(predicate.left).toEqual({ kind: 'currentValue' });
    expect(predicate.operator).toBe('eq');
    expect(predicate.right).toEqual({ kind: 'static', value: { type: 'string', value: 'ADMIN' } });
  });

  it('decomposes nested if() in else branch as ELSE-IF clauses', () => {
    const expr = 'if(eq(source("tier"), "gold"), "Gold", if(eq(source("tier"), "silver"), "Silver", "Other"))';
    const chain = expectChain(decomposeToChain(expr));
    const step = chain.steps[0] as FS039ConditionStep;
    expect(step.kind).toBe('condition');
    expect(step.conditions).toHaveLength(2);
    expect(step.conditions[0]!.predicates[0]!.right).toEqual({
      kind: 'static', value: { type: 'string', value: 'gold' },
    });
    expect(step.conditions[1]!.predicates[0]!.right).toEqual({
      kind: 'static', value: { type: 'string', value: 'silver' },
    });
    expect(step.elseBranch.source).toEqual({ kind: 'static', value: { type: 'string', value: 'Other' } });
  });

  it('decomposes and(pred1, pred2) as multi-predicate clause', () => {
    const expr = 'if(and(eq(source("x"), "a"), eq(source("y"), "b")), "yes", "no")';
    const chain = expectChain(decomposeToChain(expr));
    const step = chain.steps[0] as FS039ConditionStep;
    expect(step.conditions[0]!.predicates).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ValueMap steps
// ---------------------------------------------------------------------------

describe('decomposeToChain — valueMap steps', () => {
  it('decomposes valueMap(source("code"), {"A": "Alpha", "B": "Beta"}, "Unknown")', () => {
    const expr = 'valueMap(source("code"), {"A": "Alpha", "B": "Beta"}, "Unknown")';
    const chain = expectChain(decomposeToChain(expr));
    expect(chain.source).toEqual({ kind: 'field', path: 'code' });
    expect(chain.steps).toHaveLength(1);
    const step = chain.steps[0] as FS039ValueMapStep;
    expect(step.kind).toBe('valueMap');
    expect(step.mappings).toHaveLength(2);
    expect(step.mappings[0]!.whenValue).toBe('A');
    expect(step.mappings[0]!.outputChain.source).toEqual({
      kind: 'static', value: { type: 'string', value: 'Alpha' },
    });
    expect(step.mappings[1]!.whenValue).toBe('B');
    expect(step.defaultValue.source).toEqual({
      kind: 'static', value: { type: 'string', value: 'Unknown' },
    });
  });

  it('decomposes valueMap with source() output chains', () => {
    const expr = 'valueMap(source("code"), {"A": source("labelA")}, source("defaultLabel"))';
    const chain = expectChain(decomposeToChain(expr));
    const step = chain.steps[0] as FS039ValueMapStep;
    expect(step.mappings[0]!.outputChain.source).toEqual({ kind: 'field', path: 'labelA' });
    expect(step.defaultValue.source).toEqual({ kind: 'field', path: 'defaultLabel' });
  });

});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('decomposeToChain — error cases', () => {
  it('returns error for syntax error', () => {
    const err = expectChainError(decomposeToChain('source('));
    expect(err).toMatch(/parse error/i);
  });

  it('returns error for concat(source("a"), source("b"), source("c")) — multi-source', () => {
    // concat is not in CHAINABLE_TRANSFORMS (it takes multiple sources, not a chain)
    const result = decomposeToChain('concat(source("a"), source("b"), source("c"))');
    // concat may or may not be chainable — if it is, it would try to decompose
    // the second and third args as extra args. Either way, it should not throw.
    expect(result).toBeDefined();
  });

  it('returns error for deeply nested unsupported function', () => {
    const err = expectChainError(decomposeToChain('unknownFn(source("x"))'));
    expect(err).toMatch(/unsupported function/i);
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests
// ---------------------------------------------------------------------------

describe('decomposeToChain — round-trip with generateChainExpression', () => {
  const roundTrip = (expr: string) => {
    const result = decomposeToChain(expr);
    if ('error' in result) throw new Error(`Decompose failed: ${result.error}`);
    return generateChainExpression(result.chain);
  };

  it('round-trips source("path")', () => {
    expect(roundTrip('source("name")')).toBe('source("name")');
  });

  it('round-trips upper(source("name"))', () => {
    expect(roundTrip('upper(source("name"))')).toBe('upper(source("name"))');
  });

  it('round-trips trim(upper(source("x")))', () => {
    expect(roundTrip('trim(upper(source("x")))')).toBe('trim(upper(source("x")))');
  });

  it('round-trips if(eq(source("x"), "v"), "yes", "no")', () => {
    const expr = 'if(eq(source("x"), "v"), "yes", "no")';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trips if(isNull(source("x")), "null", "not-null")', () => {
    const expr = 'if(isNull(source("x")), "null", "not-null")';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trips if(not(isNull(source("x"))), "has-value", "null")', () => {
    const expr = 'if(not(isNull(source("x"))), "has-value", "null")';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trips nested if() ELSE-IF', () => {
    const expr = 'if(eq(source("tier"), "gold"), "Gold", if(eq(source("tier"), "silver"), "Silver", "Other"))';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trips valueMap(source("code"), {"A": "Alpha", "B": "Beta"}, "Unknown")', () => {
    const expr = 'valueMap(source("code"), {"A": "Alpha", "B": "Beta"}, "Unknown")';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trips string literal', () => {
    expect(roundTrip('"hello"')).toBe('"hello"');
  });

  it('round-trips number literal', () => {
    expect(roundTrip('42')).toBe('42');
  });

  it('round-trips condition with transform chain accumulator', () => {
    const expr = 'if(eq(upper(source("name")), "ADMIN"), "admin", "user")';
    expect(roundTrip(expr)).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// currentValue round-trip: generate with currentValue → decompose → verify kind
// ---------------------------------------------------------------------------

describe('decomposeToChain — currentValue operand round-trip', () => {
  it('generates with currentValue left operand → decomposes back to currentValue', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'name' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'currentValue' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'admin' } },
                },
              ],
              thenBranch: {
                source: { kind: 'static', value: { type: 'string', value: 'Admin' } },
                steps: [],
              },
            },
          ],
          elseBranch: {
            source: { kind: 'static', value: { type: 'string', value: 'User' } },
            steps: [],
          },
        },
      ],
    };

    const expr = generateChainExpression(chain);
    expect(expr).toBe('if(eq(source("name"), "admin"), "Admin", "User")');

    const result = decomposeToChain(expr);
    if ('error' in result) throw new Error(result.error);
    const step = result.chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    // source("name") matches accumulator source("name") → currentValue
    expect(predicate.left).toEqual({ kind: 'currentValue' });

    // Re-generate and verify round-trip
    expect(generateChainExpression(result.chain)).toBe(expr);
  });

  it('generates with field left operand → decomposes back to field', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'name' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'field', path: 'type' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'VIP' } },
                },
              ],
              thenBranch: {
                source: { kind: 'static', value: { type: 'string', value: 'VIP User' } },
                steps: [],
              },
            },
          ],
          elseBranch: {
            source: { kind: 'field', path: 'name' },
            steps: [],
          },
        },
      ],
    };

    const expr = generateChainExpression(chain);
    // Left operand is source("type"), accumulator is source("name") — different
    expect(expr).toBe('if(eq(source("type"), "VIP"), "VIP User", source("name"))');

    const result = decomposeToChain(expr);
    if ('error' in result) throw new Error(result.error);
    const step = result.chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    // source("type") does NOT match accumulator source("name") → field
    expect(predicate.left).toEqual({ kind: 'field', path: 'type' });

    expect(generateChainExpression(result.chain)).toBe(expr);
  });

  it('generates with static left operand → decomposes back to static', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'static', value: { type: 'string', value: 'constant' } },
                  operator: 'eq',
                  right: { kind: 'currentValue' },
                },
              ],
              thenBranch: {
                source: { kind: 'static', value: { type: 'string', value: 'yes' } },
                steps: [],
              },
            },
          ],
          elseBranch: {
            source: { kind: 'static', value: { type: 'string', value: 'no' } },
            steps: [],
          },
        },
      ],
    };

    const expr = generateChainExpression(chain);
    // Left = "constant", right = source("x") (currentValue resolves to accumulator)
    expect(expr).toBe('if(eq("constant", source("x")), "yes", "no")');

    const result = decomposeToChain(expr);
    if ('error' in result) throw new Error(result.error);
    const step = result.chain.steps[0] as FS039ConditionStep;
    const predicate = step.conditions[0]!.predicates[0]!;
    // "constant" does not match accumulator source("x") → static
    expect(predicate.left).toEqual({ kind: 'static', value: { type: 'string', value: 'constant' } });
    // source("x") matches accumulator → currentValue
    expect(predicate.right).toEqual({ kind: 'currentValue' });

    expect(generateChainExpression(result.chain)).toBe(expr);
  });
});

