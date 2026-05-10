import { describe, expect, it } from 'vitest';
import { generateExpressionFromChain } from './chain-expression-generator';
import {
  createEmptyChainState,
  createSourceCopyState,
  createStaticState,
  createTransformStep,
  createEmptyConditionStep,
  createEmptyValueMapStep,
} from './chain-builder-state';
import type {
  ChainBuilderState,
  ConditionLogicStep,
  ValueMapLogicStep,
  ChainBranch,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// AE-01: Direct source copy
// ---------------------------------------------------------------------------

describe('AE-01: direct source copy', () => {
  it('generates source("path") for a source copy state', () => {
    const state = createSourceCopyState('source.firstName');
    expect(generateExpressionFromChain(state)).toBe('source("source.firstName")');
  });

  it('returns empty string for source state with no path', () => {
    const state = createEmptyChainState();
    expect(generateExpressionFromChain(state)).toBe('');
  });

  it('returns empty string for source state with whitespace-only path', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: '   ',
      logicSteps: [],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('');
  });

  it('escapes double quotes in source path', () => {
    const state = createSourceCopyState('source."quoted"');
    expect(generateExpressionFromChain(state)).toBe('source("source.\\"quoted\\"")');
  });
});

// ---------------------------------------------------------------------------
// AE-02: Static entry
// ---------------------------------------------------------------------------

describe('AE-02: static entry', () => {
  it('generates quoted string for string static value', () => {
    const state = createStaticState({ type: 'string', value: 'WEB' });
    expect(generateExpressionFromChain(state)).toBe('"WEB"');
  });

  it('generates bare number for number static value', () => {
    const state = createStaticState({ type: 'number', value: 42 });
    expect(generateExpressionFromChain(state)).toBe('42');
  });

  it('generates true for boolean true static value', () => {
    const state = createStaticState({ type: 'boolean', value: true });
    expect(generateExpressionFromChain(state)).toBe('true');
  });

  it('generates false for boolean false static value', () => {
    const state = createStaticState({ type: 'boolean', value: false });
    expect(generateExpressionFromChain(state)).toBe('false');
  });

  it('generates null for null static value', () => {
    const state = createStaticState({ type: 'null' });
    expect(generateExpressionFromChain(state)).toBe('null');
  });

  it('returns empty string for static state with no value', () => {
    const state = createStaticState();
    expect(generateExpressionFromChain(state)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// External entry
// ---------------------------------------------------------------------------

describe('external entry', () => {
  it('returns empty string for external entry (placeholder)', () => {
    const state: ChainBuilderState = {
      entryType: 'external',
      logicSteps: [],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// AE-05: Source + unary transform
// ---------------------------------------------------------------------------

describe('AE-05: source + unary transform', () => {
  it('generates upper(source("customer.name"))', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.name',
      logicSteps: [createTransformStep('upper')],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('upper(source("customer.name"))');
  });

  it('generates lower(source("x"))', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [createTransformStep('lower')],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('lower(source("x"))');
  });
});

// ---------------------------------------------------------------------------
// AE-06: Source + transform with additional arg
// ---------------------------------------------------------------------------

describe('AE-06: source + transform with additional arg', () => {
  it('generates multiply(source("order.amount"), 100)', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [createTransformStep('multiply', [{ mode: 'literal', value: '100' }])],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('multiply(source("order.amount"), 100)');
  });

  it('generates round(source("x"), 2)', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [createTransformStep('round', [{ mode: 'literal', value: '2' }])],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('round(source("x"), 2)');
  });
});

// ---------------------------------------------------------------------------
// AE-07: Source + concat with additional source inputs
// ---------------------------------------------------------------------------

describe('AE-07: source + concat with additional source inputs', () => {
  it('generates concat(source("customer.first_name"), " ", source("customer.last_name"))', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.first_name',
      logicSteps: [
        createTransformStep('concat', [
          { mode: 'literal', value: ' ' },
          { mode: 'source', path: 'customer.last_name' },
        ]),
      ],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'concat(source("customer.first_name"), " ", source("customer.last_name"))',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-08: Source + condition step
// ---------------------------------------------------------------------------

describe('AE-08: source + condition step', () => {
  it('generates if(eq(source("customer.tier"), "premium"), "VIP", "Standard")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'VIP' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'Standard' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.tier',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("customer.tier"), "premium"), "VIP", "Standard")',
    );
  });

  it('generates isTruthy condition: if(source("x"), "yes", "no")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isTruthy',
      rightOperand: { kind: 'literal', value: '' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'yes' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'no' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('if(source("x"), "yes", "no")');
  });

  it('generates isFalsy condition: if(not(source("x")), "yes", "no")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isFalsy',
      rightOperand: { kind: 'literal', value: '' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'yes' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'no' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('if(not(source("x")), "yes", "no")');
  });

  it('generates isNull condition: if(isNull(source("x")), "null", "ok")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isNull',
      rightOperand: { kind: 'literal', value: '' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'null' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'ok' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('if(isNull(source("x")), "null", "ok")');
  });

  it('generates isNotNull condition: if(not(isNull(source("x"))), "ok", "null")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isNotNull',
      rightOperand: { kind: 'literal', value: '' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'ok' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'null' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(not(isNull(source("x"))), "ok", "null")',
    );
  });

  it('uses custom left operand when useCurrentValue is false', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: false,
      customLeftOperand: { kind: 'source', path: 'order.status' },
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'active' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'yes' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'no' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("order.status"), "active"), "yes", "no")',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-09: Source + value map step
// ---------------------------------------------------------------------------

describe('AE-09: source + value map step', () => {
  it('generates valueMap(source("order.status_code"), {"A": "Active", "I": "Inactive"}, "Unknown")', () => {
    const valueMapStep: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'static', value: { type: 'string', value: 'Active' } } },
        { whenValue: 'I', outputValue: { kind: 'static', value: { type: 'string', value: 'Inactive' } } },
      ],
      defaultValue: { kind: 'static', value: { type: 'string', value: 'Unknown' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status_code',
      logicSteps: [valueMapStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'valueMap(source("order.status_code"), {"A": "Active", "I": "Inactive"}, "Unknown")',
    );
  });

  it('generates empty object {} when all mappings have empty whenValue', () => {
    const valueMapStep: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [{ whenValue: '', outputValue: { kind: 'expression', raw: '"x"' } }],
      defaultValue: { kind: 'static', value: { type: 'string', value: 'default' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [valueMapStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('valueMap(source("x"), {}, "default")');
  });
});

// ---------------------------------------------------------------------------
// AE-18: Source + transform + condition (multi-step chain, Q5)
// ---------------------------------------------------------------------------

describe('AE-18: multi-step chain (transform + condition)', () => {
  it('generates if(gt(multiply(source("order.amount"), 100), 1000), multiply(source("order.amount"), 100), 0)', () => {
    // This is the AE-18 example: source + multiply(100) + condition gt 1000
    // The condition's left operand is the accumulated value (multiply result)
    // The then branch references the same accumulated expression
    const multiplyStep = createTransformStep('multiply', [{ mode: 'literal', value: '100' }]);
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'gt',
      rightOperand: { kind: 'literal', value: '1000' },
      thenBranch: { kind: 'expression', raw: 'multiply(source("order.amount"), 100)' },
      elseBranch: { kind: 'static', value: { type: 'number', value: 0 } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [multiplyStep, conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(gt(multiply(source("order.amount"), 100), 1000), multiply(source("order.amount"), 100), 0)',
    );
  });

  it('Q5: generates correct nested wrapping for source → upper → lower chain', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [createTransformStep('upper'), createTransformStep('lower')],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('lower(upper(source("x")))');
  });

  it('Q5: generates correct nesting for 3-step chain', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [
        createTransformStep('upper'),
        createTransformStep('trim'),
        createTransformStep('lower'),
      ],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('lower(trim(upper(source("x"))))');
  });
});

// ---------------------------------------------------------------------------
// ChainBranch generation
// ---------------------------------------------------------------------------

describe('ChainBranch generation in condition branches', () => {
  it('source branch with no steps generates source("path")', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'x' },
      thenBranch: { kind: 'source', path: 'order.name', steps: [] },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'default' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("order.status"), "x"), source("order.name"), "default")',
    );
  });

  it('source branch with transform steps generates wrapped expression', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'x' },
      thenBranch: {
        kind: 'source',
        path: 'order.name',
        steps: [{ kind: 'transform', functionName: 'upper', args: [] }],
      },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'default' } },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("order.status"), "x"), upper(source("order.name")), "default")',
    );
  });

  it('expression branch passes raw string through', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'x' },
      thenBranch: { kind: 'expression', raw: 'concat(source("a"), source("b"))' },
      elseBranch: { kind: 'expression', raw: 'null' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("order.status"), "x"), concat(source("a"), source("b")), null)',
    );
  });
});

// ---------------------------------------------------------------------------
// ElseIf steps
// ---------------------------------------------------------------------------

describe('elseIf steps', () => {
  it('generates nested if() for a single elseIf step', () => {
    const conditionStep: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'gold' },
      thenBranch: { kind: 'static', value: { type: 'string', value: 'VIP' } },
      elseBranch: { kind: 'static', value: { type: 'string', value: 'Standard' } },
      elseIfSteps: [
        {
          useCurrentValue: true,
          operator: 'eq',
          rightOperand: { kind: 'literal', value: 'silver' },
          thenBranch: { kind: 'static', value: { type: 'string', value: 'Premium' } },
        },
      ],
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'customer.tier',
      logicSteps: [conditionStep],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'if(eq(source("customer.tier"), "gold"), "VIP", if(eq(source("customer.tier"), "silver"), "Premium", "Standard"))',
    );
  });
});

// ---------------------------------------------------------------------------
// Literal arg type detection
// ---------------------------------------------------------------------------

describe('literal arg type detection', () => {
  it('emits bare number for numeric literal arg', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [createTransformStep('multiply', [{ mode: 'literal', value: '3.14' }])],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('multiply(source("x"), 3.14)');
  });

  it('emits bare boolean for "true" literal arg', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'x',
      logicSteps: [createTransformStep('cast', [{ mode: 'literal', value: 'true' }])],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('cast(source("x"), true)');
  });

  it('emits quoted string for whitespace literal arg (space separator)', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'first',
      logicSteps: [
        createTransformStep('concat', [
          { mode: 'literal', value: ' ' },
          { mode: 'source', path: 'last' },
        ]),
      ],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('concat(source("first"), " ", source("last"))');
  });
});
