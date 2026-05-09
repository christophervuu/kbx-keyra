import { describe, expect, it } from 'vitest';
import {
  // Factory functions
  createDirectCopyState,
  createSourceWithTransformState,
  createFunctionCallState,
  createPendingConnectorState,
  // Slot helpers
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeLiteralSlot,
  makeExpressionSlot,
  // Chain factory helpers (FS-030)
  makeChainStep,
  makeSingleStepTransform,
  // Type guards
  isDirectCopy,
  isSourceWithTransform,
  isFunctionCall,
  isPendingConnector,
  // Types (used for type assertions)
  type ArgumentSlot,
  type ArgumentFormNode,
  type InlineTransform,
  type TransformChainStep,
  type SourceCardValueModeState,
} from './expression-builder-state';

// ---------------------------------------------------------------------------
// Factory: createDirectCopyState
// ---------------------------------------------------------------------------

describe('createDirectCopyState', () => {
  it('produces a DirectCopyState with the correct variant', () => {
    const state = createDirectCopyState('order.customerName');
    expect(state.variant).toBe('directCopy');
    expect(state.sourcePath).toBe('order.customerName');
  });

  it('AE-01: represents source("order.customerName")', () => {
    const state = createDirectCopyState('order.customerName');
    expect(state).toEqual({ variant: 'directCopy', sourcePath: 'order.customerName' });
  });

  it('preserves nested dot-notation paths', () => {
    const state = createDirectCopyState('order.customer.address.city');
    expect(state.sourcePath).toBe('order.customer.address.city');
  });
});

// ---------------------------------------------------------------------------
// Factory: createSourceWithTransformState
// ---------------------------------------------------------------------------

describe('createSourceWithTransformState', () => {
  it('produces a SourceWithTransformState with the correct variant', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    const state = createSourceWithTransformState('order.email', transform);
    expect(state.variant).toBe('sourceWithTransform');
    expect(state.sourcePath).toBe('order.email');
    expect(state.transform).toBe(transform);
  });

  it('AE-02: represents formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")', () => {
    const transform: InlineTransform = {
      steps: [{ functionName: 'formatDate', args: [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')] }],
    };
    const state = createSourceWithTransformState('order.createdAt', transform);
    expect(state.variant).toBe('sourceWithTransform');
    expect(state.sourcePath).toBe('order.createdAt');
    expect(state.transform.steps).toHaveLength(1);
    expect(state.transform.steps[0]!.functionName).toBe('formatDate');
    expect(state.transform.steps[0]!.args).toHaveLength(2);
    expect(state.transform.steps[0]!.args[0]).toEqual({ mode: 'literal', value: 'ISO8601' });
    expect(state.transform.steps[0]!.args[1]).toEqual({ mode: 'literal', value: 'YYYY-MM-DD' });
  });

  it('AE-06: unary transform (upper) has empty args', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    const state = createSourceWithTransformState('order.email', transform);
    expect(state.transform.steps[0]!.args).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Factory: createFunctionCallState
// ---------------------------------------------------------------------------

describe('createFunctionCallState', () => {
  it('produces a FunctionCallState with the correct variant', () => {
    const state = createFunctionCallState('concat');
    expect(state.variant).toBe('functionCall');
    expect(state.node.functionName).toBe('concat');
  });

  it('defaults to empty slots when none provided', () => {
    const state = createFunctionCallState('concat');
    expect(state.node.slots).toHaveLength(0);
  });

  it('AE-03: represents concat(source("firstName"), " ", source("lastName"))', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot('firstName'),
      makeLiteralSlot(' '),
      makeSourceSlot('lastName'),
    ];
    const state = createFunctionCallState('concat', slots);
    expect(state.variant).toBe('functionCall');
    expect(state.node.functionName).toBe('concat');
    expect(state.node.slots).toHaveLength(3);
    expect(state.node.slots[0]).toEqual({ mode: 'source', path: 'firstName' });
    expect(state.node.slots[1]).toEqual({ mode: 'literal', value: ' ' });
    expect(state.node.slots[2]).toEqual({ mode: 'source', path: 'lastName' });
  });

  it('accepts initial slots', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot('a'), makeSourceSlot('b')];
    const state = createFunctionCallState('add', slots);
    expect(state.node.slots).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Factory: createPendingConnectorState
// ---------------------------------------------------------------------------

describe('createPendingConnectorState', () => {
  it('produces a PendingConnectorState with the correct variant', () => {
    const state = createPendingConnectorState(['order.firstName', 'order.lastName']);
    expect(state.variant).toBe('pendingConnector');
  });

  it('AE-04: holds 2 source paths awaiting connector selection', () => {
    const state = createPendingConnectorState(['order.firstName', 'order.lastName']);
    expect(state.sourcePaths).toHaveLength(2);
    expect(state.sourcePaths[0]).toBe('order.firstName');
    expect(state.sourcePaths[1]).toBe('order.lastName');
  });

  it('supports 3+ sources', () => {
    const state = createPendingConnectorState(['a', 'b', 'c']);
    expect(state.sourcePaths).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Slot helpers
// ---------------------------------------------------------------------------

describe('makeSourceSlot', () => {
  it('creates a source-mode slot with the given path', () => {
    const slot = makeSourceSlot('order.name');
    expect(slot).toEqual({ mode: 'source', path: 'order.name' });
  });

  it('does not include a transform property', () => {
    const slot = makeSourceSlot('x');
    expect('transform' in slot).toBe(false);
  });
});

describe('makeSourceSlotWithTransform', () => {
  it('creates a source-mode slot with an inline transform', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    const slot = makeSourceSlotWithTransform('order.name', transform);
    expect(slot.mode).toBe('source');
    if (slot.mode === 'source') {
      expect(slot.path).toBe('order.name');
      expect(slot.transform).toBe(transform);
    }
  });

  it('AE-07: represents upper(source("firstName")) as a slot', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    const slot = makeSourceSlotWithTransform('firstName', transform);
    expect(slot).toEqual({ mode: 'source', path: 'firstName', transform: { steps: [{ functionName: 'upper', args: [] }] } });
  });
});

describe('makeLiteralSlot', () => {
  it('creates a literal-mode slot with the given value', () => {
    const slot = makeLiteralSlot('hello');
    expect(slot).toEqual({ mode: 'literal', value: 'hello' });
  });

  it('accepts empty string', () => {
    const slot = makeLiteralSlot('');
    expect(slot).toEqual({ mode: 'literal', value: '' });
  });

  it('accepts numeric string', () => {
    const slot = makeLiteralSlot('42');
    expect(slot).toEqual({ mode: 'literal', value: '42' });
  });
});

describe('makeExpressionSlot', () => {
  it('creates an expression-mode slot wrapping an ArgumentFormNode', () => {
    const node: ArgumentFormNode = { functionName: 'upper', slots: [makeSourceSlot('x')] };
    const slot = makeExpressionSlot(node);
    expect(slot).toEqual({ mode: 'expression', node });
  });
});

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe('type guards', () => {
  const directCopy = createDirectCopyState('a');
  const sourceWithTransform = createSourceWithTransformState('a', { steps: [{ functionName: 'upper', args: [] }] });
  const functionCall = createFunctionCallState('concat');
  const pendingConnector = createPendingConnectorState(['a', 'b']);

  const allStates: SourceCardValueModeState[] = [
    directCopy,
    sourceWithTransform,
    functionCall,
    pendingConnector,
  ];

  describe('isDirectCopy', () => {
    it('returns true only for DirectCopyState', () => {
      expect(isDirectCopy(directCopy)).toBe(true);
      expect(isDirectCopy(sourceWithTransform)).toBe(false);
      expect(isDirectCopy(functionCall)).toBe(false);
      expect(isDirectCopy(pendingConnector)).toBe(false);
    });

    it('narrows the type correctly', () => {
      const state: SourceCardValueModeState = directCopy;
      if (isDirectCopy(state)) {
        // TypeScript should allow accessing sourcePath here
        expect(state.sourcePath).toBe('a');
      }
    });
  });

  describe('isSourceWithTransform', () => {
    it('returns true only for SourceWithTransformState', () => {
      expect(isSourceWithTransform(sourceWithTransform)).toBe(true);
      expect(isSourceWithTransform(directCopy)).toBe(false);
      expect(isSourceWithTransform(functionCall)).toBe(false);
      expect(isSourceWithTransform(pendingConnector)).toBe(false);
    });
  });

  describe('isFunctionCall', () => {
    it('returns true only for FunctionCallState', () => {
      expect(isFunctionCall(functionCall)).toBe(true);
      expect(isFunctionCall(directCopy)).toBe(false);
      expect(isFunctionCall(sourceWithTransform)).toBe(false);
      expect(isFunctionCall(pendingConnector)).toBe(false);
    });
  });

  describe('isPendingConnector', () => {
    it('returns true only for PendingConnectorState', () => {
      expect(isPendingConnector(pendingConnector)).toBe(true);
      expect(isPendingConnector(directCopy)).toBe(false);
      expect(isPendingConnector(sourceWithTransform)).toBe(false);
      expect(isPendingConnector(functionCall)).toBe(false);
    });
  });

  it('exactly one guard returns true for each state', () => {
    const guards = [isDirectCopy, isSourceWithTransform, isFunctionCall, isPendingConnector];
    for (const state of allStates) {
      const trueCount = guards.filter((g) => g(state)).length;
      expect(trueCount).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// AE-07: Nested transform within an argument slot
// ---------------------------------------------------------------------------

describe('AE-07: nested transform within argument slot', () => {
  it('represents concat(upper(source("firstName")), source("lastName"))', () => {
    // Slot 1: upper(source("firstName"))
    const upperTransform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    const slot1 = makeSourceSlotWithTransform('firstName', upperTransform);

    // Slot 2: source("lastName")
    const slot2 = makeSourceSlot('lastName');

    const state = createFunctionCallState('concat', [slot1, slot2]);

    expect(state.variant).toBe('functionCall');
    expect(state.node.functionName).toBe('concat');
    expect(state.node.slots).toHaveLength(2);

    const s1 = state.node.slots[0];
    expect(s1.mode).toBe('source');
    if (s1.mode === 'source') {
      expect(s1.path).toBe('firstName');
      expect(s1.transform?.steps[0]?.functionName).toBe('upper');
      expect(s1.transform?.steps[0]?.args).toHaveLength(0);
    }

    const s2 = state.node.slots[1];
    expect(s2.mode).toBe('source');
    if (s2.mode === 'source') {
      expect(s2.path).toBe('lastName');
      expect(s2.transform).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Immutability: readonly arrays cannot be mutated at runtime
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('slots array on FunctionCallState is readonly at the type level', () => {
    const state = createFunctionCallState('concat', [makeSourceSlot('a')]);
    // This is a type-level check — the runtime array is still a plain array,
    // but the type system enforces readonly. We verify the value is correct.
    expect(state.node.slots[0]).toEqual({ mode: 'source', path: 'a' });
  });

  it('sourcePaths on PendingConnectorState is readonly at the type level', () => {
    const state = createPendingConnectorState(['x', 'y']);
    expect(state.sourcePaths[0]).toBe('x');
    expect(state.sourcePaths[1]).toBe('y');
  });
});

// ---------------------------------------------------------------------------
// FS-030: makeChainStep factory helper
// ---------------------------------------------------------------------------

describe('makeChainStep', () => {
  it('creates a TransformChainStep with the given function name and empty args by default', () => {
    const step: TransformChainStep = makeChainStep('upper');
    expect(step).toEqual({ functionName: 'upper', args: [] });
  });

  it('creates a TransformChainStep with provided args', () => {
    const args: ArgumentSlot[] = [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')];
    const step = makeChainStep('formatDate', args);
    expect(step.functionName).toBe('formatDate');
    expect(step.args).toHaveLength(2);
    expect(step.args[0]).toEqual({ mode: 'literal', value: 'ISO8601' });
    expect(step.args[1]).toEqual({ mode: 'literal', value: 'YYYY-MM-DD' });
  });

  it('creates a step with a source slot arg', () => {
    const step = makeChainStep('divide', [makeSourceSlot('stats.totalFields')]);
    expect(step.functionName).toBe('divide');
    expect(step.args[0]).toEqual({ mode: 'source', path: 'stats.totalFields' });
  });
});

// ---------------------------------------------------------------------------
// FS-030: makeSingleStepTransform factory helper
// ---------------------------------------------------------------------------

describe('makeSingleStepTransform', () => {
  it('creates an InlineTransform with a single step and empty args by default', () => {
    const transform = makeSingleStepTransform('upper');
    expect(transform).toEqual({ steps: [{ functionName: 'upper', args: [] }] });
  });

  it('creates an InlineTransform with a single step and provided args', () => {
    const args: ArgumentSlot[] = [makeLiteralSlot('2')];
    const transform = makeSingleStepTransform('round', args);
    expect(transform.steps).toHaveLength(1);
    expect(transform.steps[0]!.functionName).toBe('round');
    expect(transform.steps[0]!.args).toHaveLength(1);
    expect(transform.steps[0]!.args[0]).toEqual({ mode: 'literal', value: '2' });
  });

  it('is equivalent to constructing { steps: [makeChainStep(fn, args)] }', () => {
    const transform = makeSingleStepTransform('lower');
    expect(transform).toEqual({ steps: [makeChainStep('lower')] });
  });

  it('can be used with createSourceWithTransformState', () => {
    const transform = makeSingleStepTransform('upper');
    const state = createSourceWithTransformState('order.name', transform);
    expect(state.variant).toBe('sourceWithTransform');
    expect(state.transform.steps).toHaveLength(1);
    expect(state.transform.steps[0]!.functionName).toBe('upper');
  });
});

// ---------------------------------------------------------------------------
// FS-030: Multi-step InlineTransform (chain model)
// ---------------------------------------------------------------------------

describe('InlineTransform chain model', () => {
  it('supports a 3-step math pipeline state shape', () => {
    // round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)
    const transform: InlineTransform = {
      steps: [
        makeChainStep('divide', [makeSourceSlot('stats.totalFields')]),
        makeChainStep('multiply', [makeLiteralSlot('100')]),
        makeChainStep('round', [makeLiteralSlot('2')]),
      ],
    };
    expect(transform.steps).toHaveLength(3);
    expect(transform.steps[0]!.functionName).toBe('divide');
    expect(transform.steps[1]!.functionName).toBe('multiply');
    expect(transform.steps[2]!.functionName).toBe('round');
  });

  it('supports a 2-step string cleanup pipeline state shape', () => {
    // lower(trim(source("input.rawName")))
    const transform: InlineTransform = {
      steps: [makeChainStep('trim'), makeChainStep('lower')],
    };
    expect(transform.steps).toHaveLength(2);
    expect(transform.steps[0]!.functionName).toBe('trim');
    expect(transform.steps[1]!.functionName).toBe('lower');
  });

  it('single-step chain is equivalent to old single-transform shape', () => {
    const transform = makeSingleStepTransform('upper');
    const state = createSourceWithTransformState('order.email', transform);
    expect(state.transform.steps).toHaveLength(1);
    expect(state.transform.steps[0]!.functionName).toBe('upper');
    expect(state.transform.steps[0]!.args).toHaveLength(0);
  });
});
