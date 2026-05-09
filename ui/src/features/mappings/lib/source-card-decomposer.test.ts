import { describe, expect, it } from 'vitest';

import {
  createDirectCopyState,
  createFunctionCallState,
  createSourceWithTransformState,
  makeLiteralSlot,
  makeSourceSlot,
  makeSourceSlotWithTransform,
  makeSingleStepTransform,
} from './expression-builder-state';
import { decomposeToSourceCardState } from './source-card-decomposer';
import { generateExpressionFromSourceCardState } from './source-card-expression-generator';

// ---------------------------------------------------------------------------
// Round-trip helper
// ---------------------------------------------------------------------------

function roundTrip(expression: string): string | null {
  const state = decomposeToSourceCardState(expression);
  if (state === null) return null;
  return generateExpressionFromSourceCardState(state);
}

// ---------------------------------------------------------------------------
// AE-01: DirectCopy — source("path")
// ---------------------------------------------------------------------------

describe('DirectCopy (AE-01)', () => {
  it('decomposes source("order.customerName") → DirectCopy', () => {
    const state = decomposeToSourceCardState('source("order.customerName")');
    expect(state).toEqual(createDirectCopyState('order.customerName'));
  });

  it('decomposes source("order.address.city") → DirectCopy', () => {
    const state = decomposeToSourceCardState('source("order.address.city")');
    expect(state).toEqual(createDirectCopyState('order.address.city'));
  });

  it('round-trip: source("order.customerName")', () => {
    expect(roundTrip('source("order.customerName")')).toBe('source("order.customerName")');
  });

  it('round-trip: source("order.address.city")', () => {
    expect(roundTrip('source("order.address.city")')).toBe('source("order.address.city")');
  });
});

// ---------------------------------------------------------------------------
// AE-02: SourceWithTransform
// ---------------------------------------------------------------------------

describe('SourceWithTransform (AE-02)', () => {
  it('decomposes upper(source("order.name")) → SourceWithTransform', () => {
    const state = decomposeToSourceCardState('upper(source("order.name"))');
    const expected = createSourceWithTransformState('order.name', makeSingleStepTransform('upper'));
    expect(state).toEqual(expected);
  });

  it('decomposes lower(source("order.email")) → SourceWithTransform', () => {
    const state = decomposeToSourceCardState('lower(source("order.email"))');
    expect(state).toEqual(
      createSourceWithTransformState('order.email', makeSingleStepTransform('lower')),
    );
  });

  it('decomposes formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD") → SourceWithTransform (AE-02 canonical)', () => {
    const state = decomposeToSourceCardState(
      'formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")',
    );
    const expected = createSourceWithTransformState(
      'order.createdAt',
      makeSingleStepTransform('formatDate', [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')]),
    );
    expect(state).toEqual(expected);
  });

  it('decomposes trim(source("order.notes")) → SourceWithTransform', () => {
    const state = decomposeToSourceCardState('trim(source("order.notes"))');
    expect(state).toEqual(
      createSourceWithTransformState('order.notes', makeSingleStepTransform('trim')),
    );
  });

  it('decomposes cast(source("order.amount"), "string") → SourceWithTransform', () => {
    const state = decomposeToSourceCardState('cast(source("order.amount"), "string")');
    expect(state).toEqual(
      createSourceWithTransformState(
        'order.amount',
        makeSingleStepTransform('cast', [makeLiteralSlot('string')]),
      ),
    );
  });

  it('decomposes dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601") → SourceWithTransform', () => {
    const state = decomposeToSourceCardState(
      'dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601")',
    );
    expect(state).toEqual(
      createSourceWithTransformState(
        'lastRun.startedAt',
        makeSingleStepTransform('dateDiffSeconds', [
          makeSourceSlot('lastRun.endedAt'),
          makeLiteralSlot('ISO8601'),
        ]),
      ),
    );
  });

  it('round-trip: upper(source("order.name"))', () => {
    expect(roundTrip('upper(source("order.name"))')).toBe('upper(source("order.name"))');
  });

  it('round-trip: formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD") (AE-02)', () => {
    expect(
      roundTrip('formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")'),
    ).toBe('formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")');
  });

  it('round-trip: cast(source("order.amount"), "string")', () => {
    expect(roundTrip('cast(source("order.amount"), "string")')).toBe(
      'cast(source("order.amount"), "string")',
    );
  });

  it('round-trip: dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601")', () => {
    expect(
      roundTrip('dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601")'),
    ).toBe('dateDiffSeconds(source("lastRun.startedAt"), source("lastRun.endedAt"), "ISO8601")');
  });
});

// ---------------------------------------------------------------------------
// AE-03: FunctionCall with mixed slots
// ---------------------------------------------------------------------------

describe('FunctionCall — mixed slots (AE-03)', () => {
  it('decomposes concat(source("firstName"), " ", source("lastName")) → FunctionCall', () => {
    const state = decomposeToSourceCardState(
      'concat(source("firstName"), " ", source("lastName"))',
    );
    const expected = createFunctionCallState('concat', [
      makeSourceSlot('firstName'),
      makeLiteralSlot(' '),
      makeSourceSlot('lastName'),
    ]);
    expect(state).toEqual(expected);
  });

  it('decomposes add(source("order.qty"), source("order.bonus")) → FunctionCall', () => {
    const state = decomposeToSourceCardState(
      'add(source("order.qty"), source("order.bonus"))',
    );
    const expected = createFunctionCallState('add', [
      makeSourceSlot('order.qty'),
      makeSourceSlot('order.bonus'),
    ]);
    expect(state).toEqual(expected);
  });

  it('decomposes coalesce(source("preferredName"), source("firstName")) → FunctionCall', () => {
    const state = decomposeToSourceCardState(
      'coalesce(source("preferredName"), source("firstName"))',
    );
    const expected = createFunctionCallState('coalesce', [
      makeSourceSlot('preferredName'),
      makeSourceSlot('firstName'),
    ]);
    expect(state).toEqual(expected);
  });

  it('round-trip: concat(source("firstName"), " ", source("lastName")) (AE-03)', () => {
    expect(
      roundTrip('concat(source("firstName"), " ", source("lastName"))'),
    ).toBe('concat(source("firstName"), " ", source("lastName"))');
  });

  it('round-trip: add(source("order.qty"), source("order.bonus"))', () => {
    expect(roundTrip('add(source("order.qty"), source("order.bonus"))')).toBe(
      'add(source("order.qty"), source("order.bonus"))',
    );
  });

  it('round-trip: coalesce(source("preferredName"), source("firstName"), "Unknown")', () => {
    expect(
      roundTrip('coalesce(source("preferredName"), source("firstName"), "Unknown")'),
    ).toBe('coalesce(source("preferredName"), source("firstName"), "Unknown")');
  });
});

// ---------------------------------------------------------------------------
// AE-07: Nested inline transforms within argument slots
// ---------------------------------------------------------------------------

describe('FunctionCall — nested inline transforms (AE-07)', () => {
  it('decomposes concat(upper(source("firstName")), source("lastName")) → FunctionCall with source+transform slot', () => {
    const state = decomposeToSourceCardState(
      'concat(upper(source("firstName")), source("lastName"))',
    );
    const expected = createFunctionCallState('concat', [
      makeSourceSlotWithTransform('firstName', makeSingleStepTransform('upper')),
      makeSourceSlot('lastName'),
    ]);
    expect(state).toEqual(expected);
  });

  it('decomposes concat(upper(source("a")), lower(source("b"))) → FunctionCall with two transform slots', () => {
    const state = decomposeToSourceCardState(
      'concat(upper(source("a")), lower(source("b")))',
    );
    const expected = createFunctionCallState('concat', [
      makeSourceSlotWithTransform('a', makeSingleStepTransform('upper')),
      makeSourceSlotWithTransform('b', makeSingleStepTransform('lower')),
    ]);
    expect(state).toEqual(expected);
  });

  it('decomposes concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC") → FunctionCall with transform+extra-args slot', () => {
    const state = decomposeToSourceCardState(
      'concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC")',
    );
    const expected = createFunctionCallState('concat', [
      makeSourceSlotWithTransform(
        'order.createdAt',
        makeSingleStepTransform('formatDate', [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')]),
      ),
      makeLiteralSlot(' UTC'),
    ]);
    expect(state).toEqual(expected);
  });

  it('round-trip: concat(upper(source("firstName")), source("lastName")) (AE-07)', () => {
    expect(
      roundTrip('concat(upper(source("firstName")), source("lastName"))'),
    ).toBe('concat(upper(source("firstName")), source("lastName"))');
  });

  it('round-trip: concat(upper(source("a")), lower(source("b")))', () => {
    expect(roundTrip('concat(upper(source("a")), lower(source("b")))')).toBe(
      'concat(upper(source("a")), lower(source("b")))',
    );
  });

  it('round-trip: concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC")', () => {
    expect(
      roundTrip('concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC")'),
    ).toBe('concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC")');
  });
});

// ---------------------------------------------------------------------------
// Expression slots (general nested function calls)
// ---------------------------------------------------------------------------

describe('Expression slots — general nested function calls', () => {
  it('decomposes concat(upper(source("order.name")), "!") where upper is a slot → source+transform slot', () => {
    // upper(source("x")) as a slot → source slot with InlineTransform (not expression slot)
    const state = decomposeToSourceCardState('concat(upper(source("order.name")), "!")');
    expect(state).not.toBeNull();
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    const slot0 = state.node.slots[0];
    expect(slot0.mode).toBe('source');
    if (slot0.mode === 'source') {
      expect(slot0.path).toBe('order.name');
      expect(slot0.transform?.steps[0]?.functionName).toBe('upper');
    }
  });

  it('decomposes concat(concat(source("a"), source("b")), source("c")) → FunctionCall with expression slot', () => {
    // Inner concat(source("a"), source("b")) is not a source-wrapping transform → expression slot
    const state = decomposeToSourceCardState(
      'concat(concat(source("a"), source("b")), source("c"))',
    );
    expect(state).not.toBeNull();
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    const slot0 = state.node.slots[0];
    expect(slot0.mode).toBe('expression');
    if (slot0.mode === 'expression') {
      expect(slot0.node.functionName).toBe('concat');
      expect(slot0.node.slots).toHaveLength(2);
    }
  });

  it('round-trip: concat(concat(source("a"), source("b")), source("c"))', () => {
    expect(roundTrip('concat(concat(source("a"), source("b")), source("c"))')).toBe(
      'concat(concat(source("a"), source("b")), source("c"))',
    );
  });

  it('round-trip: count(filter(source("mappings"), eq(item("enabled"), true)))', () => {
    expect(roundTrip('count(filter(source("mappings"), eq(item("enabled"), true)))')).toBe(
      'count(filter(source("mappings"), eq(item("enabled"), true)))',
    );
  });

  it('round-trip: count(filter(source("mappings"), eq(item("enabled"), false)))', () => {
    expect(roundTrip('count(filter(source("mappings"), eq(item("enabled"), false)))')).toBe(
      'count(filter(source("mappings"), eq(item("enabled"), false)))',
    );
  });

  it('round-trip: count(filter(source("mappings"), eq(item("required"), true)))', () => {
    expect(roundTrip('count(filter(source("mappings"), eq(item("required"), true)))')).toBe(
      'count(filter(source("mappings"), eq(item("required"), true)))',
    );
  });
});

// ---------------------------------------------------------------------------
// Literal slot types
// ---------------------------------------------------------------------------

describe('Literal slot decomposition', () => {
  it('decomposes string literal slot', () => {
    const state = decomposeToSourceCardState('concat(source("a"), "hello")');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.slots[1]).toEqual(makeLiteralSlot('hello'));
  });

  it('decomposes number literal slot', () => {
    const state = decomposeToSourceCardState('add(source("order.qty"), 5)');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.slots[1]).toEqual(makeLiteralSlot('5'));
  });

  it('decomposes boolean literal slot: true', () => {
    const state = decomposeToSourceCardState('someFunc(source("x"), true)');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.slots[1]).toEqual(makeLiteralSlot('true'));
  });

  it('decomposes boolean literal slot: false', () => {
    const state = decomposeToSourceCardState('someFunc(source("x"), false)');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.slots[1]).toEqual(makeLiteralSlot('false'));
  });

  it('decomposes empty string literal slot', () => {
    const state = decomposeToSourceCardState('concat(source("a"), "")');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.slots[1]).toEqual(makeLiteralSlot(''));
  });

  it('round-trip: add(source("order.qty"), 5)', () => {
    expect(roundTrip('add(source("order.qty"), 5)')).toBe('add(source("order.qty"), 5)');
  });
});

// ---------------------------------------------------------------------------
// Null / unsupported inputs
// ---------------------------------------------------------------------------

describe('Null / unsupported inputs', () => {
  it('returns null for empty string', () => {
    expect(decomposeToSourceCardState('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(decomposeToSourceCardState('   ')).toBeNull();
  });

  it('returns null for syntax error', () => {
    expect(decomposeToSourceCardState('concat(source("a",')).toBeNull();
  });

  it('returns null for bare string literal at root', () => {
    // The parser may not accept a bare string as a root expression — returns null
    expect(decomposeToSourceCardState('"hello"')).toBeNull();
  });

  it('returns null for bare number literal at root', () => {
    expect(decomposeToSourceCardState('42')).toBeNull();
  });

  it('returns null for NullLiteral argument slot', () => {
    // null is not representable as a slot in the new model
    expect(decomposeToSourceCardState('concat(source("a"), null)')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SourceWithTransform vs FunctionCall heuristic
// ---------------------------------------------------------------------------

describe('SourceWithTransform vs FunctionCall heuristic', () => {
  it('upper(source("x")) → SourceWithTransform (single-input transform)', () => {
    const state = decomposeToSourceCardState('upper(source("x"))');
    expect(state?.variant).toBe('sourceWithTransform');
  });

  it('concat(source("a"), source("b")) → FunctionCall (multi-input, not in SINGLE_INPUT_TRANSFORMS)', () => {
    const state = decomposeToSourceCardState('concat(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });

  it('add(source("a"), source("b")) → FunctionCall (add is multi-input in this context)', () => {
    // add with two source args → FunctionCall (not SourceWithTransform)
    // because add is NOT in SINGLE_INPUT_TRANSFORMS
    const state = decomposeToSourceCardState('add(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });

  it('formatDate(source("date"), "ISO8601", "YYYY-MM-DD") → SourceWithTransform', () => {
    const state = decomposeToSourceCardState(
      'formatDate(source("date"), "ISO8601", "YYYY-MM-DD")',
    );
    expect(state?.variant).toBe('sourceWithTransform');
  });

  it('coalesce(source("a"), source("b")) → FunctionCall (coalesce is multi-input)', () => {
    const state = decomposeToSourceCardState('coalesce(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });
});

// ---------------------------------------------------------------------------
// Variadic functions
// ---------------------------------------------------------------------------

describe('Variadic functions', () => {
  it('decomposes concat with 4 slots', () => {
    const state = decomposeToSourceCardState(
      'concat(source("a"), "-", source("b"), "-")',
    );
    const expected = createFunctionCallState('concat', [
      makeSourceSlot('a'),
      makeLiteralSlot('-'),
      makeSourceSlot('b'),
      makeLiteralSlot('-'),
    ]);
    expect(state).toEqual(expected);
  });

  it('round-trip: concat(source("a"), "-", source("b"), "-")', () => {
    expect(roundTrip('concat(source("a"), "-", source("b"), "-")')).toBe(
      'concat(source("a"), "-", source("b"), "-")',
    );
  });

  it('decomposes coalesce with 3 slots', () => {
    const state = decomposeToSourceCardState(
      'coalesce(source("order.preferredName"), source("order.firstName"), "Unknown")',
    );
    const expected = createFunctionCallState('coalesce', [
      makeSourceSlot('order.preferredName'),
      makeSourceSlot('order.firstName'),
      makeLiteralSlot('Unknown'),
    ]);
    expect(state).toEqual(expected);
  });

  it('round-trip: coalesce(source("order.preferredName"), source("order.firstName"), "Unknown")', () => {
    expect(
      roundTrip('coalesce(source("order.preferredName"), source("order.firstName"), "Unknown")'),
    ).toBe('coalesce(source("order.preferredName"), source("order.firstName"), "Unknown")');
  });
});

// ---------------------------------------------------------------------------
// String escaping round-trips
// ---------------------------------------------------------------------------

describe('String escaping round-trips', () => {
  it('round-trip: source path with escaped double quote', () => {
    const expr = 'source("field.\\"quoted\\"")';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('round-trip: literal with escaped double quote', () => {
    const expr = 'concat(source("a"), "say \\"hi\\"")';
    expect(roundTrip(expr)).toBe(expr);
  });
});

// ---------------------------------------------------------------------------
// FS-030: Transform chain decomposition
// ---------------------------------------------------------------------------

describe('FS-030: Chain decomposition — SourceWithTransform multi-step (AE-04)', () => {
  it('AE-04: decomposes 3-step math pipeline → SourceWithTransform with 3-step chain', () => {
    const expr = 'round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)';
    const state = decomposeToSourceCardState(expr);
    expect(state?.variant).toBe('sourceWithTransform');
    if (state?.variant !== 'sourceWithTransform') throw new Error('Expected sourceWithTransform');
    expect(state.sourcePath).toBe('stats.mappedFields');
    expect(state.transform.steps).toHaveLength(3);
    expect(state.transform.steps[0]!.functionName).toBe('divide');
    expect(state.transform.steps[0]!.args).toHaveLength(1);
    expect(state.transform.steps[0]!.args[0]).toEqual(makeSourceSlot('stats.totalFields'));
    expect(state.transform.steps[1]!.functionName).toBe('multiply');
    expect(state.transform.steps[1]!.args).toHaveLength(1);
    expect(state.transform.steps[1]!.args[0]).toEqual(makeLiteralSlot('100'));
    expect(state.transform.steps[2]!.functionName).toBe('round');
    expect(state.transform.steps[2]!.args).toHaveLength(1);
    expect(state.transform.steps[2]!.args[0]).toEqual(makeLiteralSlot('2'));
  });

  it('AE-04: round-trip: round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)', () => {
    const expr = 'round(multiply(divide(source("stats.mappedFields"), source("stats.totalFields")), 100), 2)';
    expect(roundTrip(expr)).toBe(expr);
  });

  it('AE-06: decomposes 2-step string pipeline → SourceWithTransform with 2-step chain', () => {
    const state = decomposeToSourceCardState('lower(trim(source("input.rawName")))');
    expect(state?.variant).toBe('sourceWithTransform');
    if (state?.variant !== 'sourceWithTransform') throw new Error('Expected sourceWithTransform');
    expect(state.sourcePath).toBe('input.rawName');
    expect(state.transform.steps).toHaveLength(2);
    expect(state.transform.steps[0]!.functionName).toBe('trim');
    expect(state.transform.steps[0]!.args).toHaveLength(0);
    expect(state.transform.steps[1]!.functionName).toBe('lower');
    expect(state.transform.steps[1]!.args).toHaveLength(0);
  });

  it('AE-06: round-trip: lower(trim(source("input.rawName")))', () => {
    expect(roundTrip('lower(trim(source("input.rawName")))')).toBe(
      'lower(trim(source("input.rawName")))',
    );
  });

  it('AE-03: single-step chain (upper) → SourceWithTransform with 1-step chain', () => {
    const state = decomposeToSourceCardState('upper(source("order.name"))');
    expect(state?.variant).toBe('sourceWithTransform');
    if (state?.variant !== 'sourceWithTransform') throw new Error('Expected sourceWithTransform');
    expect(state.transform.steps).toHaveLength(1);
    expect(state.transform.steps[0]!.functionName).toBe('upper');
    expect(state.transform.steps[0]!.args).toHaveLength(0);
  });

  it('AE-03: decomposes to expected state shape using factory helpers', () => {
    const state = decomposeToSourceCardState('upper(source("order.name"))');
    const expected = createSourceWithTransformState('order.name', makeSingleStepTransform('upper'));
    expect(state).toEqual(expected);
  });
});

describe('FS-030: Chain decomposition — backward compatibility (AE-08)', () => {
  it('AE-08: divide(source("a"), source("b")) → FunctionCall (not SourceWithTransform)', () => {
    // divide is chainable but NOT in SINGLE_INPUT_TRANSFORMS, so 1-step chain → FunctionCall
    const state = decomposeToSourceCardState('divide(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });

  it('AE-08: round-trip: divide(source("a"), source("b"))', () => {
    expect(roundTrip('divide(source("a"), source("b"))')).toBe('divide(source("a"), source("b"))');
  });

  it('multiply(source("a"), source("b")) → FunctionCall (1-step, not in SINGLE_INPUT_TRANSFORMS)', () => {
    const state = decomposeToSourceCardState('multiply(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });

  it('add(source("a"), source("b")) → FunctionCall (1-step, not in SINGLE_INPUT_TRANSFORMS)', () => {
    const state = decomposeToSourceCardState('add(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });
});

describe('FS-030: Chain decomposition — non-linear fallback (AE-05)', () => {
  it('AE-05: round(concat(source("a"), source("b")), 2) → FunctionCall (concat not chainable)', () => {
    // concat is not in CHAINABLE_TRANSFORMS, so chain-walking fails → FunctionCall
    const state = decomposeToSourceCardState('round(concat(source("a"), source("b")), 2)');
    expect(state?.variant).toBe('functionCall');
  });

  it('AE-05: round-trip: round(concat(source("a"), source("b")), 2)', () => {
    expect(roundTrip('round(concat(source("a"), source("b")), 2)')).toBe(
      'round(concat(source("a"), source("b")), 2)',
    );
  });

  it('non-linear: coalesce(source("a"), source("b")) → FunctionCall', () => {
    const state = decomposeToSourceCardState('coalesce(source("a"), source("b"))');
    expect(state?.variant).toBe('functionCall');
  });
});

describe('FS-030: Chain decomposition — nested slot with chain (AE-07 chain variant)', () => {
  it('AE-07: decomposes concat(round(multiply(source("x"), 100), 2), "suffix") → FunctionCall with chain slot', () => {
    const state = decomposeToSourceCardState(
      'concat(round(multiply(source("x"), 100), 2), "suffix")',
    );
    expect(state?.variant).toBe('functionCall');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    expect(state.node.functionName).toBe('concat');
    expect(state.node.slots).toHaveLength(2);

    const slot0 = state.node.slots[0];
    expect(slot0.mode).toBe('source');
    if (slot0.mode === 'source') {
      expect(slot0.path).toBe('x');
      expect(slot0.transform?.steps).toHaveLength(2);
      expect(slot0.transform?.steps[0]?.functionName).toBe('multiply');
      expect(slot0.transform?.steps[0]?.args[0]).toEqual(makeLiteralSlot('100'));
      expect(slot0.transform?.steps[1]?.functionName).toBe('round');
      expect(slot0.transform?.steps[1]?.args[0]).toEqual(makeLiteralSlot('2'));
    }

    const slot1 = state.node.slots[1];
    expect(slot1).toEqual(makeLiteralSlot('suffix'));
  });

  it('AE-07: round-trip: concat(round(multiply(source("x"), 100), 2), "suffix")', () => {
    expect(roundTrip('concat(round(multiply(source("x"), 100), 2), "suffix")')).toBe(
      'concat(round(multiply(source("x"), 100), 2), "suffix")',
    );
  });

  it('decomposes concat(upper(source("firstName")), " ", source("lastName")) — single-step chain in slot', () => {
    const state = decomposeToSourceCardState(
      'concat(upper(source("firstName")), " ", source("lastName"))',
    );
    expect(state?.variant).toBe('functionCall');
    if (state?.variant !== 'functionCall') throw new Error('Expected functionCall');
    const slot0 = state.node.slots[0];
    expect(slot0.mode).toBe('source');
    if (slot0.mode === 'source') {
      expect(slot0.path).toBe('firstName');
      expect(slot0.transform?.steps).toHaveLength(1);
      expect(slot0.transform?.steps[0]?.functionName).toBe('upper');
    }
  });
});
