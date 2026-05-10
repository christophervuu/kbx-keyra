import { describe, expect, it } from 'vitest';
import {
  // Factory functions
  createEmptyChainState,
  createSourceCopyState,
  createStaticState,
  createEmptyTransformStep,
  createTransformStep,
  createEmptyConditionStep,
  createEmptyValueMapStep,
  // Completeness
  isChainComplete,
  // Summaries
  summarizeLogicStep,
  // Type guards
  isTransformStep,
  isConditionStep,
  isValueMapStep,
  isStaticBranch,
  isSourceBranch,
  isExpressionBranch,
  // Types
  type ChainBuilderState,
  type TransformLogicStep,
  type ConditionLogicStep,
  type ValueMapLogicStep,
  type ChainBranch,
  type LogicStep,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// Factory: createEmptyChainState
// ---------------------------------------------------------------------------

describe('createEmptyChainState', () => {
  it('returns source entry type', () => {
    const state = createEmptyChainState();
    expect(state.entryType).toBe('source');
  });

  it('has no sourcePath', () => {
    const state = createEmptyChainState();
    expect(state.sourcePath).toBeUndefined();
  });

  it('has empty logicSteps', () => {
    const state = createEmptyChainState();
    expect(state.logicSteps).toHaveLength(0);
  });

  it('has null expandedStepIndex', () => {
    const state = createEmptyChainState();
    expect(state.expandedStepIndex).toBeNull();
  });

  it('has no staticValue', () => {
    const state = createEmptyChainState();
    expect(state.staticValue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Factory: createSourceCopyState
// ---------------------------------------------------------------------------

describe('createSourceCopyState', () => {
  it('AE-01: sets source entry type', () => {
    const state = createSourceCopyState('order.customerName');
    expect(state.entryType).toBe('source');
  });

  it('AE-01: sets sourcePath', () => {
    const state = createSourceCopyState('order.customerName');
    expect(state.sourcePath).toBe('order.customerName');
  });

  it('has empty logicSteps', () => {
    const state = createSourceCopyState('order.customerName');
    expect(state.logicSteps).toHaveLength(0);
  });

  it('has null expandedStepIndex', () => {
    const state = createSourceCopyState('order.customerName');
    expect(state.expandedStepIndex).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Factory: createStaticState
// ---------------------------------------------------------------------------

describe('createStaticState', () => {
  it('AE-02: sets static entry type', () => {
    const state = createStaticState({ type: 'string', value: 'WEB' });
    expect(state.entryType).toBe('static');
  });

  it('AE-02: sets staticValue when provided', () => {
    const state = createStaticState({ type: 'string', value: 'WEB' });
    expect(state.staticValue).toEqual({ type: 'string', value: 'WEB' });
  });

  it('AE-02: staticValue is undefined when not provided', () => {
    const state = createStaticState();
    expect(state.staticValue).toBeUndefined();
  });

  it('has empty logicSteps', () => {
    const state = createStaticState({ type: 'number', value: 42 });
    expect(state.logicSteps).toHaveLength(0);
  });

  it('supports boolean static value', () => {
    const state = createStaticState({ type: 'boolean', value: true });
    expect(state.staticValue).toEqual({ type: 'boolean', value: true });
  });

  it('supports null static value', () => {
    const state = createStaticState({ type: 'null' });
    expect(state.staticValue).toEqual({ type: 'null' });
  });
});

// ---------------------------------------------------------------------------
// Factory: createEmptyTransformStep
// ---------------------------------------------------------------------------

describe('createEmptyTransformStep', () => {
  it('has kind transform', () => {
    const step = createEmptyTransformStep();
    expect(step.kind).toBe('transform');
  });

  it('has empty functionName', () => {
    const step = createEmptyTransformStep();
    expect(step.functionName).toBe('');
  });

  it('has empty args', () => {
    const step = createEmptyTransformStep();
    expect(step.args).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Factory: createTransformStep
// ---------------------------------------------------------------------------

describe('createTransformStep', () => {
  it('sets functionName', () => {
    const step = createTransformStep('upper');
    expect(step.functionName).toBe('upper');
  });

  it('defaults to empty args', () => {
    const step = createTransformStep('upper');
    expect(step.args).toHaveLength(0);
  });

  it('accepts additional args', () => {
    const step = createTransformStep('multiply', [{ mode: 'literal', value: '100' }]);
    expect(step.args).toHaveLength(1);
    expect(step.args[0]).toEqual({ mode: 'literal', value: '100' });
  });
});

// ---------------------------------------------------------------------------
// Factory: createEmptyConditionStep
// ---------------------------------------------------------------------------

describe('createEmptyConditionStep', () => {
  it('has kind condition', () => {
    const step = createEmptyConditionStep();
    expect(step.kind).toBe('condition');
  });

  it('Q1/Q6: useCurrentValue defaults to true', () => {
    const step = createEmptyConditionStep();
    expect(step.useCurrentValue).toBe(true);
  });

  it('has no customLeftOperand', () => {
    const step = createEmptyConditionStep();
    expect(step.customLeftOperand).toBeUndefined();
  });

  it('defaults operator to eq', () => {
    const step = createEmptyConditionStep();
    expect(step.operator).toBe('eq');
  });

  it('has empty rightOperand literal', () => {
    const step = createEmptyConditionStep();
    expect(step.rightOperand).toEqual({ kind: 'literal', value: '' });
  });

  it('has empty thenBranch expression', () => {
    const step = createEmptyConditionStep();
    expect(step.thenBranch).toEqual({ kind: 'expression', raw: '' });
  });

  it('has empty elseBranch expression', () => {
    const step = createEmptyConditionStep();
    expect(step.elseBranch).toEqual({ kind: 'expression', raw: '' });
  });

  it('has empty elseIfSteps', () => {
    const step = createEmptyConditionStep();
    expect(step.elseIfSteps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Factory: createEmptyValueMapStep
// ---------------------------------------------------------------------------

describe('createEmptyValueMapStep', () => {
  it('has kind valueMap', () => {
    const step = createEmptyValueMapStep();
    expect(step.kind).toBe('valueMap');
  });

  it('starts with one empty mapping row', () => {
    const step = createEmptyValueMapStep();
    expect(step.mappings).toHaveLength(1);
    expect(step.mappings[0].whenValue).toBe('');
  });

  it('has empty defaultValue expression', () => {
    const step = createEmptyValueMapStep();
    expect(step.defaultValue).toEqual({ kind: 'expression', raw: '' });
  });
});

// ---------------------------------------------------------------------------
// isChainComplete — base value checks
// ---------------------------------------------------------------------------

describe('isChainComplete — base value', () => {
  it('returns false for empty source state (no sourcePath)', () => {
    const state = createEmptyChainState();
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true for valid source copy state', () => {
    const state = createSourceCopyState('order.firstName');
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false for source state with empty string path', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: '   ',
      logicSteps: [],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true for static state with value defined', () => {
    const state = createStaticState({ type: 'string', value: 'WEB' });
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false for static state with no value', () => {
    const state = createStaticState();
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns false for external entry type (placeholder)', () => {
    const state: ChainBuilderState = {
      entryType: 'external',
      logicSteps: [],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChainComplete — transform step checks
// ---------------------------------------------------------------------------

describe('isChainComplete — transform steps', () => {
  it('returns false when transform step has no functionName', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [createEmptyTransformStep()],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true for source with complete unary transform', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [createTransformStep('upper')],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false when transform has incomplete literal arg', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [createTransformStep('multiply', [{ mode: 'literal', value: '' }])],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true when transform has complete literal arg', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [createTransformStep('multiply', [{ mode: 'literal', value: '100' }])],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false when transform has incomplete source arg', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.amount',
      logicSteps: [createTransformStep('add', [{ mode: 'source', path: '' }])],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChainComplete — condition step checks
// ---------------------------------------------------------------------------

describe('isChainComplete — condition steps', () => {
  const validThenBranch: ChainBranch = { kind: 'expression', raw: 'source("x")' };
  const validElseBranch: ChainBranch = { kind: 'expression', raw: 'static("default")' };

  it('returns false for empty condition step (empty rightOperand)', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [createEmptyConditionStep()],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns false when thenBranch is empty', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: { kind: 'expression', raw: '' },
      elseBranch: validElseBranch,
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns false when elseBranch is empty', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: validThenBranch,
      elseBranch: { kind: 'expression', raw: '' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true for complete condition step using current value', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: validThenBranch,
      elseBranch: validElseBranch,
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false when useCurrentValue is false and no customLeftOperand', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: false,
      customLeftOperand: undefined,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: validThenBranch,
      elseBranch: validElseBranch,
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true when useCurrentValue is false and customLeftOperand is complete', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: false,
      customLeftOperand: { kind: 'source', path: 'order.status' },
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: validThenBranch,
      elseBranch: validElseBranch,
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false when elseIf step has empty thenBranch', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: validThenBranch,
      elseBranch: validElseBranch,
      elseIfSteps: [
        {
          useCurrentValue: true,
          operator: 'eq',
          rightOperand: { kind: 'literal', value: 'basic' },
          thenBranch: { kind: 'expression', raw: '' },
        },
      ],
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.tier',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChainComplete — value map step checks
// ---------------------------------------------------------------------------

describe('isChainComplete — value map steps', () => {
  it('returns false for empty value map step (empty whenValue)', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [createEmptyValueMapStep()],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns false when default value is empty', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'expression', raw: 'static("Active")' } },
      ],
      defaultValue: { kind: 'expression', raw: '' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns true for complete value map step', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'expression', raw: 'static("Active")' } },
        { whenValue: 'I', outputValue: { kind: 'expression', raw: 'static("Inactive")' } },
      ],
      defaultValue: { kind: 'expression', raw: 'static("Unknown")' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('returns false when a mapping row has empty whenValue', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'expression', raw: 'static("Active")' } },
        { whenValue: '', outputValue: { kind: 'expression', raw: 'static("Inactive")' } },
      ],
      defaultValue: { kind: 'expression', raw: 'static("Unknown")' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });

  it('returns false when mappings array is empty', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [],
      defaultValue: { kind: 'expression', raw: 'static("Unknown")' },
    };
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [step],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChainComplete — multi-step chains (Q5: post-condition transforms)
// ---------------------------------------------------------------------------

describe('isChainComplete — multi-step chains', () => {
  it('Q5: returns true for source → transform → condition chain when all complete', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [
        createTransformStep('upper'),
        {
          kind: 'condition',
          useCurrentValue: true,
          operator: 'eq',
          rightOperand: { kind: 'literal', value: 'PREMIUM' },
          thenBranch: { kind: 'expression', raw: 'static("yes")' },
          elseBranch: { kind: 'expression', raw: 'static("no")' },
        },
      ],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(true);
  });

  it('Q5: returns false when second step is incomplete in a multi-step chain', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'order.status',
      logicSteps: [
        createTransformStep('upper'),
        createEmptyConditionStep(), // incomplete
      ],
      expandedStepIndex: null,
    };
    expect(isChainComplete(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// summarizeLogicStep — transform
// ---------------------------------------------------------------------------

describe('summarizeLogicStep — transform', () => {
  it('returns functionName for unary transform', () => {
    const step = createTransformStep('upper');
    expect(summarizeLogicStep(step)).toBe('upper');
  });

  it('returns functionName(arg) for transform with one literal arg', () => {
    const step = createTransformStep('multiply', [{ mode: 'literal', value: '100' }]);
    expect(summarizeLogicStep(step)).toBe('multiply(100)');
  });

  it('returns functionName(arg1, arg2) for transform with two args', () => {
    const step = createTransformStep('concat', [
      { mode: 'literal', value: ' ' },
      { mode: 'source', path: 'order.lastName' },
    ]);
    expect(summarizeLogicStep(step)).toBe('concat( , order.lastName)');
  });

  it('returns placeholder for unconfigured transform', () => {
    const step = createEmptyTransformStep();
    expect(summarizeLogicStep(step)).toBe('Transform (not configured)');
  });
});

// ---------------------------------------------------------------------------
// summarizeLogicStep — condition
// ---------------------------------------------------------------------------

describe('summarizeLogicStep — condition', () => {
  it('uses "current value" as left when useCurrentValue is true', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'eq',
      rightOperand: { kind: 'literal', value: 'premium' },
      thenBranch: { kind: 'expression', raw: 'source("x")' },
      elseBranch: { kind: 'expression', raw: 'source("y")' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('current value');
    expect(summary).toContain('=');
    expect(summary).toContain('premium');
  });

  it('uses custom left operand path when useCurrentValue is false', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: false,
      customLeftOperand: { kind: 'source', path: 'order.status' },
      operator: 'neq',
      rightOperand: { kind: 'literal', value: 'cancelled' },
      thenBranch: { kind: 'expression', raw: 'source("x")' },
      elseBranch: { kind: 'expression', raw: 'source("y")' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('order.status');
    expect(summary).toContain('≠');
  });

  it('formats isNull operator correctly', () => {
    const step: ConditionLogicStep = {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isNull',
      rightOperand: { kind: 'currentValue' },
      thenBranch: { kind: 'expression', raw: 'source("x")' },
      elseBranch: { kind: 'expression', raw: 'source("y")' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('is null');
  });
});

// ---------------------------------------------------------------------------
// summarizeLogicStep — value map
// ---------------------------------------------------------------------------

describe('summarizeLogicStep — value map', () => {
  it('shows up to 2 mapping pairs', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'expression', raw: 'static("Active")' } },
        { whenValue: 'I', outputValue: { kind: 'expression', raw: 'static("Inactive")' } },
      ],
      defaultValue: { kind: 'expression', raw: 'static("Unknown")' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('A →');
    expect(summary).toContain('I →');
    expect(summary).toContain('default:');
  });

  it('shows +N more when more than 2 mappings', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputValue: { kind: 'expression', raw: 'static("Active")' } },
        { whenValue: 'I', outputValue: { kind: 'expression', raw: 'static("Inactive")' } },
        { whenValue: 'P', outputValue: { kind: 'expression', raw: 'static("Pending")' } },
      ],
      defaultValue: { kind: 'expression', raw: 'static("Unknown")' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('+1 more');
  });

  it('shows placeholder for empty whenValue', () => {
    const step: ValueMapLogicStep = {
      kind: 'valueMap',
      mappings: [{ whenValue: '', outputValue: { kind: 'expression', raw: '' } }],
      defaultValue: { kind: 'expression', raw: '' },
    };
    const summary = summarizeLogicStep(step);
    expect(summary).toContain('… →');
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type guards', () => {
  it('isTransformStep returns true for transform', () => {
    const step = createTransformStep('upper');
    expect(isTransformStep(step)).toBe(true);
    expect(isConditionStep(step)).toBe(false);
    expect(isValueMapStep(step)).toBe(false);
  });

  it('isConditionStep returns true for condition', () => {
    const step = createEmptyConditionStep();
    expect(isConditionStep(step)).toBe(true);
    expect(isTransformStep(step)).toBe(false);
    expect(isValueMapStep(step)).toBe(false);
  });

  it('isValueMapStep returns true for valueMap', () => {
    const step = createEmptyValueMapStep();
    expect(isValueMapStep(step)).toBe(true);
    expect(isTransformStep(step)).toBe(false);
    expect(isConditionStep(step)).toBe(false);
  });

  it('isStaticBranch returns true for static branch', () => {
    const branch: ChainBranch = { kind: 'static', value: { type: 'string', value: 'WEB' } };
    expect(isStaticBranch(branch)).toBe(true);
    expect(isSourceBranch(branch)).toBe(false);
    expect(isExpressionBranch(branch)).toBe(false);
  });

  it('isSourceBranch returns true for source branch', () => {
    const branch: ChainBranch = { kind: 'source', path: 'order.name', steps: [] };
    expect(isSourceBranch(branch)).toBe(true);
    expect(isStaticBranch(branch)).toBe(false);
    expect(isExpressionBranch(branch)).toBe(false);
  });

  it('isExpressionBranch returns true for expression branch', () => {
    const branch: ChainBranch = { kind: 'expression', raw: 'upper(source("x"))' };
    expect(isExpressionBranch(branch)).toBe(true);
    expect(isStaticBranch(branch)).toBe(false);
    expect(isSourceBranch(branch)).toBe(false);
  });
});
