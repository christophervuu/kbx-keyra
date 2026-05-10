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
  // FS-039 factories
  createEmptyChain,
  createFieldSourceChain,
  createStaticSourceChain,
  createEmptyPredicate,
  createEmptyConditionClause,
  createEmptyFS039ConditionStep,
  createEmptyFS039ValueMapStep,
  // FS-039 type guards
  isFS039ConditionStep,
  isFS039ValueMapStep,
  isFS039TransformStep,
  isFieldSource,
  isStaticSource,
  isNoneSource,
  isCurrentValueOperand,
  isFieldOperand,
  isStaticOperand,
  isExpressionOperand,
  isExpressionBranch,
  // Types
  type ChainBuilderState,
  type TransformLogicStep,
  type ConditionLogicStep,
  type ValueMapLogicStep,
  type ChainBranch,
  type LogicStep,
  // FS-039 types
  type ChainSource,
  type ChainState,
  type OperandValue,
  type Predicate,
  type ConditionClause,
  type FS039ConditionStep,
  type FS039ValueMapStep,
  type FS039TransformStep,
  type ChainStep,
  type DraftFieldState,
  type DraftValidationState,
  type DraftRulesMap,
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

// ===========================================================================
// FS-039 Chain Model Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// ChainSource — factory and type guards
// ---------------------------------------------------------------------------

describe('FS-039 ChainSource — createEmptyChain', () => {
  it('creates chain with none source', () => {
    const chain = createEmptyChain();
    expect(chain.source.kind).toBe('none');
    expect(chain.steps).toHaveLength(0);
  });

  it('isNoneSource returns true for none source', () => {
    const chain = createEmptyChain();
    expect(isNoneSource(chain.source)).toBe(true);
    expect(isFieldSource(chain.source)).toBe(false);
    expect(isStaticSource(chain.source)).toBe(false);
  });
});

describe('FS-039 ChainSource — createFieldSourceChain', () => {
  it('creates chain with field source', () => {
    const chain = createFieldSourceChain('order.customerName');
    expect(chain.source.kind).toBe('field');
    if (chain.source.kind === 'field') {
      expect(chain.source.path).toBe('order.customerName');
    }
    expect(chain.steps).toHaveLength(0);
  });

  it('isFieldSource returns true for field source', () => {
    const chain = createFieldSourceChain('order.status');
    expect(isFieldSource(chain.source)).toBe(true);
    expect(isNoneSource(chain.source)).toBe(false);
    expect(isStaticSource(chain.source)).toBe(false);
  });
});

describe('FS-039 ChainSource — createStaticSourceChain', () => {
  it('creates chain with static string source', () => {
    const chain = createStaticSourceChain({ type: 'string', value: 'WEB' });
    expect(chain.source.kind).toBe('static');
    if (chain.source.kind === 'static') {
      expect(chain.source.value).toEqual({ type: 'string', value: 'WEB' });
    }
  });

  it('creates chain with static number source', () => {
    const chain = createStaticSourceChain({ type: 'number', value: 42 });
    expect(chain.source.kind).toBe('static');
    if (chain.source.kind === 'static') {
      expect(chain.source.value).toEqual({ type: 'number', value: 42 });
    }
  });

  it('creates chain with static boolean source', () => {
    const chain = createStaticSourceChain({ type: 'boolean', value: true });
    expect(chain.source.kind).toBe('static');
  });

  it('creates chain with static null source', () => {
    const chain = createStaticSourceChain({ type: 'null' });
    expect(chain.source.kind).toBe('static');
  });

  it('isStaticSource returns true for static source', () => {
    const chain = createStaticSourceChain({ type: 'string', value: 'WEB' });
    expect(isStaticSource(chain.source)).toBe(true);
    expect(isFieldSource(chain.source)).toBe(false);
    expect(isNoneSource(chain.source)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OperandValue — all four kinds
// ---------------------------------------------------------------------------

describe('FS-039 OperandValue — createEmptyPredicate defaults', () => {
  it('AE-24: left operand defaults to currentValue kind', () => {
    const predicate = createEmptyPredicate();
    expect(predicate.left.kind).toBe('currentValue');
  });

  it('right operand defaults to expression kind with empty dsl', () => {
    const predicate = createEmptyPredicate();
    expect(predicate.right.kind).toBe('expression');
    if (predicate.right.kind === 'expression') {
      expect(predicate.right.dsl).toBe('');
    }
  });

  it('operator defaults to eq', () => {
    const predicate = createEmptyPredicate();
    expect(predicate.operator).toBe('eq');
  });
});

describe('FS-039 OperandValue — all four kinds', () => {
  it('supports currentValue kind', () => {
    const operand: OperandValue = { kind: 'currentValue' };
    expect(isCurrentValueOperand(operand)).toBe(true);
    expect(isFieldOperand(operand)).toBe(false);
    expect(isStaticOperand(operand)).toBe(false);
    expect(isExpressionOperand(operand)).toBe(false);
  });

  it('supports field kind', () => {
    const operand: OperandValue = { kind: 'field', path: 'order.status' };
    expect(isFieldOperand(operand)).toBe(true);
    expect(isCurrentValueOperand(operand)).toBe(false);
    expect(isStaticOperand(operand)).toBe(false);
    expect(isExpressionOperand(operand)).toBe(false);
    if (operand.kind === 'field') {
      expect(operand.path).toBe('order.status');
    }
  });

  it('supports static kind with string value', () => {
    const operand: OperandValue = { kind: 'static', value: { type: 'string', value: 'premium' } };
    expect(isStaticOperand(operand)).toBe(true);
    expect(isCurrentValueOperand(operand)).toBe(false);
    expect(isFieldOperand(operand)).toBe(false);
    expect(isExpressionOperand(operand)).toBe(false);
  });

  it('supports static kind with number value', () => {
    const operand: OperandValue = { kind: 'static', value: { type: 'number', value: 100 } };
    expect(isStaticOperand(operand)).toBe(true);
  });

  it('supports expression kind', () => {
    const operand: OperandValue = { kind: 'expression', dsl: 'upper(source("x"))' };
    expect(isExpressionOperand(operand)).toBe(true);
    expect(isCurrentValueOperand(operand)).toBe(false);
    expect(isFieldOperand(operand)).toBe(false);
    expect(isStaticOperand(operand)).toBe(false);
    if (operand.kind === 'expression') {
      expect(operand.dsl).toBe('upper(source("x"))');
    }
  });
});

// ---------------------------------------------------------------------------
// FS039ConditionStep — structure and non-optional elseBranch
// ---------------------------------------------------------------------------

describe('FS-039 ConditionStep — createEmptyFS039ConditionStep', () => {
  it('has kind condition', () => {
    const step = createEmptyFS039ConditionStep();
    expect(step.kind).toBe('condition');
  });

  it('starts with one IF clause', () => {
    const step = createEmptyFS039ConditionStep();
    expect(step.conditions).toHaveLength(1);
  });

  it('IF clause has one empty predicate', () => {
    const step = createEmptyFS039ConditionStep();
    expect(step.conditions[0].predicates).toHaveLength(1);
  });

  it('AE-24: IF clause predicate left operand defaults to currentValue', () => {
    const step = createEmptyFS039ConditionStep();
    expect(step.conditions[0].predicates[0].left.kind).toBe('currentValue');
  });

  it('IF clause thenBranch is an empty chain', () => {
    const step = createEmptyFS039ConditionStep();
    expect(step.conditions[0].thenBranch.source.kind).toBe('none');
    expect(step.conditions[0].thenBranch.steps).toHaveLength(0);
  });

  it('elseBranch is non-optional and is an empty chain', () => {
    const step = createEmptyFS039ConditionStep();
    // TypeScript enforces this at compile time; runtime check confirms it exists
    expect(step.elseBranch).toBeDefined();
    expect(step.elseBranch.source.kind).toBe('none');
    expect(step.elseBranch.steps).toHaveLength(0);
  });

  it('isFS039ConditionStep returns true', () => {
    const step = createEmptyFS039ConditionStep();
    expect(isFS039ConditionStep(step)).toBe(true);
    expect(isFS039ValueMapStep(step)).toBe(false);
    expect(isFS039TransformStep(step)).toBe(false);
  });
});

describe('FS-039 ConditionStep — type-level: elseBranch is non-optional', () => {
  it('FS039ConditionStep with explicit elseBranch is valid', () => {
    // This test verifies the type structure at runtime — TypeScript enforces
    // non-optionality at compile time. If elseBranch were optional, this
    // object literal would still work; the compile-time check is the real guard.
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '"premium"' } }],
          thenBranch: createFieldSourceChain('output.premium'),
        },
      ],
      elseBranch: createFieldSourceChain('output.standard'),
    };
    expect(step.elseBranch).toBeDefined();
    expect(step.elseBranch.source.kind).toBe('field');
  });

  it('supports else-if via additional conditions entries', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'premium' } } }],
          thenBranch: createFieldSourceChain('output.premium'),
        },
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'basic' } } }],
          thenBranch: createFieldSourceChain('output.basic'),
        },
      ],
      elseBranch: createFieldSourceChain('output.default'),
    };
    expect(step.conditions).toHaveLength(2);
    expect(step.elseBranch).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// FS039ValueMapStep — structure and non-optional defaultValue
// ---------------------------------------------------------------------------

describe('FS-039 ValueMapStep — createEmptyFS039ValueMapStep', () => {
  it('has kind valueMap', () => {
    const step = createEmptyFS039ValueMapStep();
    expect(step.kind).toBe('valueMap');
  });

  it('starts with one empty mapping row', () => {
    const step = createEmptyFS039ValueMapStep();
    expect(step.mappings).toHaveLength(1);
    expect(step.mappings[0].whenValue).toBe('');
  });

  it('defaultValue is non-optional and is an empty chain', () => {
    const step = createEmptyFS039ValueMapStep();
    expect(step.defaultValue).toBeDefined();
    expect(step.defaultValue.source.kind).toBe('none');
    expect(step.defaultValue.steps).toHaveLength(0);
  });

  it('isFS039ValueMapStep returns true', () => {
    const step = createEmptyFS039ValueMapStep();
    expect(isFS039ValueMapStep(step)).toBe(true);
    expect(isFS039ConditionStep(step)).toBe(false);
    expect(isFS039TransformStep(step)).toBe(false);
  });
});

describe('FS-039 ValueMapStep — type-level: defaultValue is non-optional', () => {
  it('FS039ValueMapStep with explicit defaultValue is valid', () => {
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'A', outputChain: createFieldSourceChain('output.active') },
        { whenValue: 'I', outputChain: createFieldSourceChain('output.inactive') },
      ],
      defaultValue: createFieldSourceChain('output.unknown'),
    };
    expect(step.defaultValue).toBeDefined();
    expect(step.defaultValue.source.kind).toBe('field');
    expect(step.mappings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ChainState — structural composition
// ---------------------------------------------------------------------------

describe('FS-039 ChainState — structural composition', () => {
  it('represents simple field source chain', () => {
    const chain: ChainState = createFieldSourceChain('order.customerName');
    expect(chain.source.kind).toBe('field');
    expect(chain.steps).toHaveLength(0);
  });

  it('represents source + transform steps', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        { kind: 'transform', functionName: 'trim', args: [] },
      ],
    };
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[0].kind).toBe('transform');
  });

  it('represents source + condition step with currentValue operand', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'currentValue' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'premium' } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    const condStep = chain.steps[0] as FS039ConditionStep;
    expect(condStep.conditions[0].predicates[0].left.kind).toBe('currentValue');
    expect(condStep.elseBranch).toBeDefined();
  });

  it('represents source + valueMap step', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [
            { whenValue: 'A', outputChain: createStaticSourceChain({ type: 'string', value: 'Active' }) },
          ],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'Unknown' }),
        },
      ],
    };
    const vmStep = chain.steps[0] as FS039ValueMapStep;
    expect(vmStep.defaultValue).toBeDefined();
    expect(vmStep.mappings).toHaveLength(1);
  });

  it('represents nested condition branches with their own chains', () => {
    // Condition step where thenBranch itself has a transform step
    const innerChain: ChainState = {
      source: { kind: 'field', path: 'output.premium' },
      steps: [{ kind: 'transform', functionName: 'upper', args: [] }],
    };
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '"premium"' } }],
              thenBranch: innerChain,
            },
          ],
          elseBranch: createEmptyChain(),
        },
      ],
    };
    const condStep = chain.steps[0] as FS039ConditionStep;
    expect(condStep.conditions[0].thenBranch.steps).toHaveLength(1);
    expect(condStep.conditions[0].thenBranch.steps[0].kind).toBe('transform');
  });

  it('AE-22/AE-23: supports steps after condition step', () => {
    // Post-condition transform step — structurally valid
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '"premium"' } }],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
        { kind: 'transform', functionName: 'upper', args: [] },
      ],
    };
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[1].kind).toBe('transform');
  });

  it('AE-22/AE-23: supports steps after valueMap step', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [{ whenValue: 'A', outputChain: createStaticSourceChain({ type: 'string', value: 'Active' }) }],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'Unknown' }),
        },
        { kind: 'transform', functionName: 'trim', args: [] },
      ],
    };
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[1].kind).toBe('transform');
  });
});

// ---------------------------------------------------------------------------
// DraftFieldState and DraftRulesMap — type-level tests
// ---------------------------------------------------------------------------

describe('FS-039 DraftFieldState', () => {
  it('can represent a valid draft field state', () => {
    const draft: DraftFieldState = {
      targetPath: 'output.customerName',
      expression: 'upper(source("order.name"))',
      isDirty: true,
      validation: { status: 'valid' },
    };
    expect(draft.targetPath).toBe('output.customerName');
    expect(draft.isDirty).toBe(true);
    expect(draft.validation.status).toBe('valid');
  });

  it('can represent an invalid draft field state', () => {
    const draft: DraftFieldState = {
      targetPath: 'output.status',
      expression: 'upper(',
      isDirty: true,
      validation: { status: 'invalid', errors: ['Unexpected end of expression'] },
    };
    expect(draft.validation.status).toBe('invalid');
    if (draft.validation.status === 'invalid') {
      expect(draft.validation.errors).toHaveLength(1);
    }
  });

  it('can represent a pending draft field state', () => {
    const draft: DraftFieldState = {
      targetPath: 'output.amount',
      expression: 'multiply(source("order.amount"), 100)',
      isDirty: false,
      validation: { status: 'pending' },
    };
    expect(draft.validation.status).toBe('pending');
  });
});

describe('FS-039 DraftRulesMap', () => {
  it('is a Map<string, string>', () => {
    const map: DraftRulesMap = new Map<string, string>();
    map.set('output.name', 'upper(source("order.name"))');
    map.set('output.status', '');
    expect(map.get('output.name')).toBe('upper(source("order.name"))');
    // Empty string means "delete this rule on save"
    expect(map.get('output.status')).toBe('');
    expect(map.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// FS-039 ChainStep type guard — isFS039TransformStep
// ---------------------------------------------------------------------------

describe('FS-039 ChainStep type guards', () => {
  it('isFS039TransformStep returns true for transform step', () => {
    const step: ChainStep = { kind: 'transform', functionName: 'upper', args: [] };
    expect(isFS039TransformStep(step)).toBe(true);
    expect(isFS039ConditionStep(step)).toBe(false);
    expect(isFS039ValueMapStep(step)).toBe(false);
  });

  it('isFS039ConditionStep returns true for condition step', () => {
    const step: ChainStep = createEmptyFS039ConditionStep();
    expect(isFS039ConditionStep(step)).toBe(true);
    expect(isFS039TransformStep(step)).toBe(false);
    expect(isFS039ValueMapStep(step)).toBe(false);
  });

  it('isFS039ValueMapStep returns true for value map step', () => {
    const step: ChainStep = createEmptyFS039ValueMapStep();
    expect(isFS039ValueMapStep(step)).toBe(true);
    expect(isFS039TransformStep(step)).toBe(false);
    expect(isFS039ConditionStep(step)).toBe(false);
  });
});
