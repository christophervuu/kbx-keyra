import { describe, expect, it } from 'vitest';
import { generateExpressionFromChain, generateChainExpression } from './chain-expression-generator';
import {
  createEmptyChainState,
  createSourceCopyState,
  createStaticState,
  createTransformStep,
  createEmptyConditionStep,
  createEmptyValueMapStep,
  // FS-039 factories
  createEmptyChain,
  createFieldSourceChain,
  createStaticSourceChain,
  createEmptyPredicate,
  createEmptyFS039ConditionStep,
  createEmptyFS039ValueMapStep,
} from './chain-builder-state';
import type {
  ChainBuilderState,
  ConditionLogicStep,
  ValueMapLogicStep,
  ChainBranch,
  // FS-039 types
  ChainState,
  ChainStep,
  OperandValue,
  Predicate,
  FS039ConditionStep,
  FS039ValueMapStep,
  FS039TransformStep,
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

  it('generates join(source("tags"), ",")', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'tags',
      logicSteps: [createTransformStep('join', [{ mode: 'literal', value: ',' }])],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe('join(source("tags"), ",")');
  });

  it('generates count(filter(source("items"), gt(item("discountAmount"), 0)))', () => {
    const state: ChainBuilderState = {
      entryType: 'source',
      sourcePath: 'items',
      logicSteps: [
        createTransformStep('filter', [
          {
            mode: 'expression',
            node: {
              functionName: 'gt',
              slots: [
                {
                  mode: 'expression',
                  node: {
                    functionName: 'item',
                    slots: [{ mode: 'literal', value: 'discountAmount' }],
                  },
                },
                { mode: 'literal', value: '0' },
              ],
            },
          },
        ]),
        createTransformStep('count'),
      ],
      expandedStepIndex: null,
    };
    expect(generateExpressionFromChain(state)).toBe(
      'count(filter(source("items"), gt(item("discountAmount"), 0)))',
    );
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

// ===========================================================================
// FS-039 generateChainExpression tests
// ===========================================================================

// ---------------------------------------------------------------------------
// ChainSource variants
// ---------------------------------------------------------------------------

describe('FS-039: ChainSource — none', () => {
  it('returns empty string for none source with no steps', () => {
    const chain = createEmptyChain();
    expect(generateChainExpression(chain)).toBe('');
  });
});

describe('FS-039: ChainSource — field', () => {
  it('generates source("path") for field source', () => {
    const chain = createFieldSourceChain('order.customerName');
    expect(generateChainExpression(chain)).toBe('source("order.customerName")');
  });

  it('returns empty string for field source with empty path', () => {
    const chain: ChainState = { source: { kind: 'field', path: '' }, steps: [] };
    expect(generateChainExpression(chain)).toBe('');
  });

  it('escapes double quotes in field path', () => {
    const chain = createFieldSourceChain('order."quoted"');
    expect(generateChainExpression(chain)).toBe('source("order.\\"quoted\\"")');
  });
});

describe('FS-039: ChainSource — static', () => {
  it('generates quoted string for string static source', () => {
    const chain = createStaticSourceChain({ type: 'string', value: 'WEB' });
    expect(generateChainExpression(chain)).toBe('"WEB"');
  });

  it('generates bare number for number static source', () => {
    const chain = createStaticSourceChain({ type: 'number', value: 42 });
    expect(generateChainExpression(chain)).toBe('42');
  });

  it('generates true for boolean true static source', () => {
    const chain = createStaticSourceChain({ type: 'boolean', value: true });
    expect(generateChainExpression(chain)).toBe('true');
  });

  it('generates false for boolean false static source', () => {
    const chain = createStaticSourceChain({ type: 'boolean', value: false });
    expect(generateChainExpression(chain)).toBe('false');
  });

  it('generates null for null static source', () => {
    const chain = createStaticSourceChain({ type: 'null' });
    expect(generateChainExpression(chain)).toBe('null');
  });
});

// ---------------------------------------------------------------------------
// Transform steps
// ---------------------------------------------------------------------------

describe('FS-039: TransformStep', () => {
  it('generates upper(source("path")) for unary transform', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'customer.name' },
      steps: [{ kind: 'transform', functionName: 'upper', args: [] }],
    };
    expect(generateChainExpression(chain)).toBe('upper(source("customer.name"))');
  });

  it('generates multiply(source("x"), 100) for transform with literal arg', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.amount' },
      steps: [{ kind: 'transform', functionName: 'multiply', args: [{ mode: 'literal', value: '100' }] }],
    };
    expect(generateChainExpression(chain)).toBe('multiply(source("order.amount"), 100)');
  });

  it('generates concat with source arg', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'customer.first_name' },
      steps: [
        {
          kind: 'transform',
          functionName: 'concat',
          args: [
            { mode: 'literal', value: ' ' },
            { mode: 'source', path: 'customer.last_name' },
          ],
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'concat(source("customer.first_name"), " ", source("customer.last_name"))',
    );
  });

  it('generates correct nesting for multi-step transform chain', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        { kind: 'transform', functionName: 'trim', args: [] },
        { kind: 'transform', functionName: 'lower', args: [] },
      ],
    };
    expect(generateChainExpression(chain)).toBe('lower(trim(upper(source("x"))))');
  });

  it('passes through accumulator unchanged for empty functionName', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [{ kind: 'transform', functionName: '', args: [] }],
    };
    expect(generateChainExpression(chain)).toBe('source("x")');
  });
});

// ---------------------------------------------------------------------------
// OperandValue kinds — all four
// ---------------------------------------------------------------------------

describe('FS-039: OperandValue — currentValue kind (AE-24)', () => {
  it('substitutes accumulated chain expression for currentValue left operand', () => {
    // Chain: source("order.tier") → IF(currentValue = "premium")
    // currentValue at condition step = source("order.tier")
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
              thenBranch: createStaticSourceChain({ type: 'string', value: 'VIP' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'Standard' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(source("order.tier"), "premium"), "VIP", "Standard")',
    );
  });

  it('substitutes accumulated expression after transform for currentValue', () => {
    // Chain: source("order.status") → upper() → IF(currentValue = "ACTIVE")
    // currentValue at condition step = upper(source("order.status"))
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'currentValue' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'ACTIVE' } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(upper(source("order.status")), "ACTIVE"), "yes", "no")',
    );
  });

  it('AE-21: substitutes multi-step accumulator for currentValue', () => {
    // Chain: source("name") → upper() → trim() → IF(currentValue = "ADMIN")
    // currentValue = trim(upper(source("name")))
    const chain: ChainState = {
      source: { kind: 'field', path: 'name' },
      steps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        { kind: 'transform', functionName: 'trim', args: [] },
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'currentValue' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'ADMIN' } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'admin' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'user' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(trim(upper(source("name"))), "ADMIN"), "admin", "user")',
    );
  });
});

describe('FS-039: OperandValue — field kind', () => {
  it('generates source("path") for field operand', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.amount' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'field', path: 'customer.type' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'VIP' } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(source("customer.type"), "VIP"), "yes", "no")',
    );
  });
});

describe('FS-039: OperandValue — static kind', () => {
  it('generates literal DSL for static operand', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'static', value: { type: 'number', value: 100 } },
                  operator: 'gt',
                  right: { kind: 'static', value: { type: 'number', value: 50 } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'big' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'small' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe('if(gt(100, 50), "big", "small")');
  });
});

describe('FS-039: OperandValue — expression kind', () => {
  it('passes through raw DSL for expression operand', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'expression', dsl: 'upper(source("order.name"))' },
                  operator: 'eq',
                  right: { kind: 'expression', dsl: '"ADMIN"' },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(upper(source("order.name")), "ADMIN"), "yes", "no")',
    );
  });
});

// ---------------------------------------------------------------------------
// AND-combined predicates
// ---------------------------------------------------------------------------

describe('FS-039: AND-combined predicates', () => {
  it('wraps two predicates in and()', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                {
                  left: { kind: 'currentValue' },
                  operator: 'eq',
                  right: { kind: 'static', value: { type: 'string', value: 'active' } },
                },
                {
                  left: { kind: 'field', path: 'order.amount' },
                  operator: 'gt',
                  right: { kind: 'static', value: { type: 'number', value: 100 } },
                },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(and(eq(source("order.status"), "active"), gt(source("order.amount"), 100)), "yes", "no")',
    );
  });

  it('emits single predicate directly without and() wrapper', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [
                { left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'a' } } },
              ],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
        },
      ],
    };
    const result = generateChainExpression(chain);
    expect(result).not.toContain('and(');
    expect(result).toBe('if(eq(source("x"), "a"), "yes", "no")');
  });
});

// ---------------------------------------------------------------------------
// Else-if (multiple ConditionClause entries)
// ---------------------------------------------------------------------------

describe('FS-039: else-if via multiple conditions entries', () => {
  it('generates nested if() for two clauses + else', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'customer.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'gold' } } }],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'VIP' }),
            },
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'silver' } } }],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'Premium' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'Standard' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(source("customer.tier"), "gold"), "VIP", if(eq(source("customer.tier"), "silver"), "Premium", "Standard"))',
    );
  });
});

// ---------------------------------------------------------------------------
// ValueMapStep
// ---------------------------------------------------------------------------

describe('FS-039: ValueMapStep', () => {
  it('generates valueMap(accumulator, {mappings}, default)', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status_code' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [
            { whenValue: 'A', outputChain: createStaticSourceChain({ type: 'string', value: 'Active' }) },
            { whenValue: 'I', outputChain: createStaticSourceChain({ type: 'string', value: 'Inactive' }) },
          ],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'Unknown' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'valueMap(source("order.status_code"), {"A": "Active", "I": "Inactive"}, "Unknown")',
    );
  });

  it('generates {} for empty mappings', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'default' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe('valueMap(source("x"), {}, "default")');
  });

  it('skips mapping rows with empty whenValue', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [
            { whenValue: 'A', outputChain: createStaticSourceChain({ type: 'string', value: 'Active' }) },
            { whenValue: '', outputChain: createStaticSourceChain({ type: 'string', value: 'Empty' }) },
          ],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'Unknown' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'valueMap(source("x"), {"A": "Active"}, "Unknown")',
    );
  });

  it('uses accumulated expression as first arg (after transform)', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        { kind: 'transform', functionName: 'upper', args: [] },
        {
          kind: 'valueMap',
          mappings: [
            { whenValue: 'ACTIVE', outputChain: createStaticSourceChain({ type: 'string', value: 'Active' }) },
          ],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'Unknown' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'valueMap(upper(source("order.status")), {"ACTIVE": "Active"}, "Unknown")',
    );
  });

  it('output chains in mappings are recursively generated', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'x' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [
            {
              whenValue: 'A',
              outputChain: {
                source: { kind: 'field', path: 'output.active' },
                steps: [{ kind: 'transform', functionName: 'upper', args: [] }],
              },
            },
          ],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'default' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'valueMap(source("x"), {"A": upper(source("output.active"))}, "default")',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-22/AE-23: Steps after condition / value map
// ---------------------------------------------------------------------------

describe('FS-039: AE-22 — steps after condition step', () => {
  it('wraps condition output in subsequent transform', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'premium' } } }],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'vip' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'standard' }),
        },
        { kind: 'transform', functionName: 'upper', args: [] },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'upper(if(eq(source("order.tier"), "premium"), "vip", "standard"))',
    );
  });
});

describe('FS-039: AE-23 — steps after value map step', () => {
  it('wraps value map output in subsequent transform', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.status' },
      steps: [
        {
          kind: 'valueMap',
          mappings: [{ whenValue: 'A', outputChain: createStaticSourceChain({ type: 'string', value: 'active' }) }],
          defaultValue: createStaticSourceChain({ type: 'string', value: 'unknown' }),
        },
        { kind: 'transform', functionName: 'upper', args: [] },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'upper(valueMap(source("order.status"), {"A": "active"}, "unknown"))',
    );
  });
});

// ---------------------------------------------------------------------------
// Nested condition branches with their own chains
// ---------------------------------------------------------------------------

describe('FS-039: nested condition branches with chains', () => {
  it('generates correct DSL for condition with chain in thenBranch', () => {
    const thenChain: ChainState = {
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
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'premium' } } }],
              thenBranch: thenChain,
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'standard' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(source("order.tier"), "premium"), upper(source("output.premium")), "standard")',
    );
  });

  it('generates correct DSL for deeply nested conditions', () => {
    // Outer: IF tier = premium → inner condition, ELSE standard
    // Inner: IF amount > 1000 → "platinum", ELSE "gold"
    const innerChain: ChainState = {
      source: { kind: 'field', path: 'order.amount' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'gt', right: { kind: 'static', value: { type: 'number', value: 1000 } } }],
              thenBranch: createStaticSourceChain({ type: 'string', value: 'platinum' }),
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'gold' }),
        },
      ],
    };
    const chain: ChainState = {
      source: { kind: 'field', path: 'order.tier' },
      steps: [
        {
          kind: 'condition',
          conditions: [
            {
              predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'static', value: { type: 'string', value: 'premium' } } }],
              thenBranch: innerChain,
            },
          ],
          elseBranch: createStaticSourceChain({ type: 'string', value: 'standard' }),
        },
      ],
    };
    expect(generateChainExpression(chain)).toBe(
      'if(eq(source("order.tier"), "premium"), if(gt(source("order.amount"), 1000), "platinum", "gold"), "standard")',
    );
  });
});

// ---------------------------------------------------------------------------
// Operator variants
// ---------------------------------------------------------------------------

describe('FS-039: operator variants', () => {
  const makeChain = (operator: FS039ConditionStep['conditions'][0]['predicates'][0]['operator']): ChainState => ({
    source: { kind: 'field', path: 'x' },
    steps: [
      {
        kind: 'condition',
        conditions: [
          {
            predicates: [{ left: { kind: 'currentValue' }, operator, right: { kind: 'static', value: { type: 'string', value: 'v' } } }],
            thenBranch: createStaticSourceChain({ type: 'string', value: 'yes' }),
          },
        ],
        elseBranch: createStaticSourceChain({ type: 'string', value: 'no' }),
      },
    ],
  });

  it('isTruthy: emits bare left operand', () => {
    expect(generateChainExpression(makeChain('isTruthy'))).toBe('if(source("x"), "yes", "no")');
  });

  it('isFalsy: wraps in not()', () => {
    expect(generateChainExpression(makeChain('isFalsy'))).toBe('if(not(source("x")), "yes", "no")');
  });

  it('isNull: wraps in isNull()', () => {
    expect(generateChainExpression(makeChain('isNull'))).toBe('if(isNull(source("x")), "yes", "no")');
  });

  it('isNotNull: wraps in not(isNull())', () => {
    expect(generateChainExpression(makeChain('isNotNull'))).toBe('if(not(isNull(source("x"))), "yes", "no")');
  });

  it('neq: emits neq(left, right)', () => {
    expect(generateChainExpression(makeChain('neq'))).toBe('if(neq(source("x"), "v"), "yes", "no")');
  });

  it('gt: emits gt(left, right)', () => {
    expect(generateChainExpression(makeChain('gt'))).toBe('if(gt(source("x"), "v"), "yes", "no")');
  });

  it('lte: emits lte(left, right)', () => {
    expect(generateChainExpression(makeChain('lte'))).toBe('if(lte(source("x"), "v"), "yes", "no")');
  });
});
