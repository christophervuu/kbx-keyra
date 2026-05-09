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
  // Type guards
  isDirectCopy,
  isSourceWithTransform,
  isFunctionCall,
  isPendingConnector,
  // Types (used for type assertions)
  type ArgumentSlot,
  type ArgumentFormNode,
  type InlineTransform,
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
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const state = createSourceWithTransformState('order.email', transform);
    expect(state.variant).toBe('sourceWithTransform');
    expect(state.sourcePath).toBe('order.email');
    expect(state.transform).toBe(transform);
  });

  it('AE-02: represents formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")', () => {
    const transform: InlineTransform = {
      functionName: 'formatDate',
      args: [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')],
    };
    const state = createSourceWithTransformState('order.createdAt', transform);
    expect(state.variant).toBe('sourceWithTransform');
    expect(state.sourcePath).toBe('order.createdAt');
    expect(state.transform.functionName).toBe('formatDate');
    expect(state.transform.args).toHaveLength(2);
    expect(state.transform.args[0]).toEqual({ mode: 'literal', value: 'ISO8601' });
    expect(state.transform.args[1]).toEqual({ mode: 'literal', value: 'YYYY-MM-DD' });
  });

  it('AE-06: unary transform (upper) has empty args', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const state = createSourceWithTransformState('order.email', transform);
    expect(state.transform.args).toHaveLength(0);
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
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const slot = makeSourceSlotWithTransform('order.name', transform);
    expect(slot.mode).toBe('source');
    if (slot.mode === 'source') {
      expect(slot.path).toBe('order.name');
      expect(slot.transform).toBe(transform);
    }
  });

  it('AE-07: represents upper(source("firstName")) as a slot', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const slot = makeSourceSlotWithTransform('firstName', transform);
    expect(slot).toEqual({ mode: 'source', path: 'firstName', transform: { functionName: 'upper', args: [] } });
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
  const sourceWithTransform = createSourceWithTransformState('a', { functionName: 'upper', args: [] });
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
    const upperTransform: InlineTransform = { functionName: 'upper', args: [] };
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
      expect(s1.transform?.functionName).toBe('upper');
      expect(s1.transform?.args).toHaveLength(0);
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
