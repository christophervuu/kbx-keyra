import { describe, expect, it } from 'vitest';

import {
  createDirectCopyState,
  createFunctionCallState,
  createPendingConnectorState,
  createSourceWithTransformState,
  makeExpressionSlot,
  makeLiteralSlot,
  makeSourceSlot,
  makeSourceSlotWithTransform,
} from './expression-builder-state';
import type { ArgumentFormNode, InlineTransform } from './expression-builder-state';
import { generateExpressionFromSourceCardState } from './source-card-expression-generator';

// ---------------------------------------------------------------------------
// AE-01: DirectCopy
// ---------------------------------------------------------------------------

describe('DirectCopy (AE-01)', () => {
  it('generates source("path") for a simple direct copy', () => {
    const state = createDirectCopyState('order.customerName');
    expect(generateExpressionFromSourceCardState(state)).toBe('source("order.customerName")');
  });

  it('generates source("path") for a nested path', () => {
    const state = createDirectCopyState('order.address.city');
    expect(generateExpressionFromSourceCardState(state)).toBe('source("order.address.city")');
  });

  it('returns null for an empty source path', () => {
    const state = createDirectCopyState('');
    expect(generateExpressionFromSourceCardState(state)).toBeNull();
  });

  it('escapes double quotes in the path', () => {
    const state = createDirectCopyState('order."special"');
    expect(generateExpressionFromSourceCardState(state)).toBe('source("order.\\"special\\"")');
  });

  it('escapes backslashes in the path', () => {
    const state = createDirectCopyState('order\\name');
    expect(generateExpressionFromSourceCardState(state)).toBe('source("order\\\\name")');
  });
});

// ---------------------------------------------------------------------------
// AE-02: SourceWithTransform
// ---------------------------------------------------------------------------

describe('SourceWithTransform (AE-02)', () => {
  it('generates unary transform: upper(source("name"))', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const state = createSourceWithTransformState('order.name', transform);
    expect(generateExpressionFromSourceCardState(state)).toBe('upper(source("order.name"))');
  });

  it('generates unary transform: lower(source("email"))', () => {
    const transform: InlineTransform = { functionName: 'lower', args: [] };
    const state = createSourceWithTransformState('order.email', transform);
    expect(generateExpressionFromSourceCardState(state)).toBe('lower(source("order.email"))');
  });

  it('generates formatDate with literal args (AE-02 canonical)', () => {
    const transform: InlineTransform = {
      functionName: 'formatDate',
      args: [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')],
    };
    const state = createSourceWithTransformState('order.createdAt', transform);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")',
    );
  });

  it('returns null for an empty source path', () => {
    const transform: InlineTransform = { functionName: 'upper', args: [] };
    const state = createSourceWithTransformState('', transform);
    expect(generateExpressionFromSourceCardState(state)).toBeNull();
  });

  it('generates trim(source("notes")) with no extra args', () => {
    const transform: InlineTransform = { functionName: 'trim', args: [] };
    const state = createSourceWithTransformState('order.notes', transform);
    expect(generateExpressionFromSourceCardState(state)).toBe('trim(source("order.notes"))');
  });

  it('generates transform with numeric literal arg', () => {
    const transform: InlineTransform = {
      functionName: 'round',
      args: [makeLiteralSlot('2')],
    };
    const state = createSourceWithTransformState('order.amount', transform);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'round(source("order.amount"), 2)',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-03: FunctionCall with mixed slots
// ---------------------------------------------------------------------------

describe('FunctionCall — mixed slots (AE-03)', () => {
  it('generates concat(source("firstName"), " ", source("lastName"))', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('firstName'),
      makeLiteralSlot(' '),
      makeSourceSlot('lastName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("firstName"), " ", source("lastName"))',
    );
  });

  it('generates concat with only source slots', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('order.firstName'),
      makeSourceSlot('order.lastName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("order.firstName"), source("order.lastName"))',
    );
  });

  it('generates add(source("qty"), source("bonus"))', () => {
    const state = createFunctionCallState('add', [
      makeSourceSlot('order.qty'),
      makeSourceSlot('order.bonus'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'add(source("order.qty"), source("order.bonus"))',
    );
  });

  it('generates function call with all literal slots', () => {
    const state = createFunctionCallState('concat', [
      makeLiteralSlot('Hello'),
      makeLiteralSlot(', '),
      makeLiteralSlot('World'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat("Hello", ", ", "World")',
    );
  });

  it('generates function call with empty slots list', () => {
    const state = createFunctionCallState('concat', []);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat()');
  });

  it('generates cast(source("amount"), "string")', () => {
    const state = createFunctionCallState('cast', [
      makeSourceSlot('order.amount'),
      makeLiteralSlot('string'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'cast(source("order.amount"), "string")',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-04: FunctionCall from connector (2 sources merged)
// ---------------------------------------------------------------------------

describe('FunctionCall — from connector (AE-04)', () => {
  it('generates concat(source("order.firstName"), source("order.lastName"))', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('order.firstName'),
      makeSourceSlot('order.lastName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("order.firstName"), source("order.lastName"))',
    );
  });

  it('generates coalesce(source("preferredName"), source("firstName"))', () => {
    const state = createFunctionCallState('coalesce', [
      makeSourceSlot('order.preferredName'),
      makeSourceSlot('order.firstName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'coalesce(source("order.preferredName"), source("order.firstName"))',
    );
  });

  it('generates add(source("a"), source("b"))', () => {
    const state = createFunctionCallState('add', [
      makeSourceSlot('order.a'),
      makeSourceSlot('order.b'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'add(source("order.a"), source("order.b"))',
    );
  });
});

// ---------------------------------------------------------------------------
// AE-07: Nested inline transforms within argument slots
// ---------------------------------------------------------------------------

describe('FunctionCall — nested inline transforms (AE-07)', () => {
  it('generates concat(upper(source("firstName")), source("lastName"))', () => {
    const upperTransform: InlineTransform = { functionName: 'upper', args: [] };
    const state = createFunctionCallState('concat', [
      makeSourceSlotWithTransform('firstName', upperTransform),
      makeSourceSlot('lastName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(upper(source("firstName")), source("lastName"))',
    );
  });

  it('generates concat(upper(source("a")), lower(source("b")))', () => {
    const upperTransform: InlineTransform = { functionName: 'upper', args: [] };
    const lowerTransform: InlineTransform = { functionName: 'lower', args: [] };
    const state = createFunctionCallState('concat', [
      makeSourceSlotWithTransform('a', upperTransform),
      makeSourceSlotWithTransform('b', lowerTransform),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(upper(source("a")), lower(source("b")))',
    );
  });

  it('generates nested transform with extra args: formatDate(source("date"), "ISO8601", "YYYY-MM-DD") as a slot', () => {
    const formatTransform: InlineTransform = {
      functionName: 'formatDate',
      args: [makeLiteralSlot('ISO8601'), makeLiteralSlot('YYYY-MM-DD')],
    };
    const state = createFunctionCallState('concat', [
      makeSourceSlotWithTransform('order.createdAt', formatTransform),
      makeLiteralSlot(' UTC'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD"), " UTC")',
    );
  });

  it('generates concat("v", cast(source("sourceSchema.version"), "string")) for nested cast transform', () => {
    const castTransform: InlineTransform = {
      functionName: 'cast',
      args: [makeLiteralSlot('string')],
    };

    const state = createFunctionCallState('concat', [
      makeLiteralSlot('v'),
      makeSourceSlotWithTransform('sourceSchema.version', castTransform),
    ]);

    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat("v", cast(source("sourceSchema.version"), "string"))',
    );
  });
});

// ---------------------------------------------------------------------------
// Expression slots (recursive sub-expressions)
// ---------------------------------------------------------------------------

describe('FunctionCall — expression slots (recursive)', () => {
  it('generates nested function call via expression slot', () => {
    const innerNode: ArgumentFormNode = {
      functionName: 'upper',
      slots: [makeSourceSlot('order.name')],
    };
    const state = createFunctionCallState('concat', [
      makeExpressionSlot(innerNode),
      makeLiteralSlot('!'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(upper(source("order.name")), "!")',
    );
  });

  it('generates deeply nested expression slots', () => {
    const innerNode: ArgumentFormNode = {
      functionName: 'trim',
      slots: [makeSourceSlot('order.notes')],
    };
    const outerNode: ArgumentFormNode = {
      functionName: 'upper',
      slots: [makeExpressionSlot(innerNode)],
    };
    const state = createFunctionCallState('concat', [
      makeExpressionSlot(outerNode),
      makeLiteralSlot(' end'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(upper(trim(source("order.notes"))), " end")',
    );
  });

  it('generates count(filter(source("mappings"), eq(item("enabled"), true)))', () => {
    const conditionNode: ArgumentFormNode = {
      functionName: 'eq',
      slots: [
        makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot('enabled')] }),
        makeLiteralSlot('true'),
      ],
    };

    const filterNode: ArgumentFormNode = {
      functionName: 'filter',
      slots: [
        makeSourceSlot('mappings'),
        makeExpressionSlot(conditionNode),
      ],
    };

    const state = createFunctionCallState('count', [makeExpressionSlot(filterNode)]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'count(filter(source("mappings"), eq(item("enabled"), true)))',
    );
  });

  it('generates count(filter(source("mappings"), eq(item("enabled"), false)))', () => {
    const conditionNode: ArgumentFormNode = {
      functionName: 'eq',
      slots: [
        makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot('enabled')] }),
        makeLiteralSlot('false'),
      ],
    };

    const filterNode: ArgumentFormNode = {
      functionName: 'filter',
      slots: [
        makeSourceSlot('mappings'),
        makeExpressionSlot(conditionNode),
      ],
    };

    const state = createFunctionCallState('count', [makeExpressionSlot(filterNode)]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'count(filter(source("mappings"), eq(item("enabled"), false)))',
    );
  });

  it('generates count(filter(source("mappings"), eq(item("required"), true)))', () => {
    const conditionNode: ArgumentFormNode = {
      functionName: 'eq',
      slots: [
        makeExpressionSlot({ functionName: 'item', slots: [makeLiteralSlot('required')] }),
        makeLiteralSlot('true'),
      ],
    };

    const filterNode: ArgumentFormNode = {
      functionName: 'filter',
      slots: [
        makeSourceSlot('mappings'),
        makeExpressionSlot(conditionNode),
      ],
    };

    const state = createFunctionCallState('count', [makeExpressionSlot(filterNode)]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'count(filter(source("mappings"), eq(item("required"), true)))',
    );
  });
});

// ---------------------------------------------------------------------------
// PendingConnector
// ---------------------------------------------------------------------------

describe('PendingConnector', () => {
  it('returns null for pending connector with 2 sources', () => {
    const state = createPendingConnectorState(['order.firstName', 'order.lastName']);
    expect(generateExpressionFromSourceCardState(state)).toBeNull();
  });

  it('returns null for pending connector with 3 sources', () => {
    const state = createPendingConnectorState(['a', 'b', 'c']);
    expect(generateExpressionFromSourceCardState(state)).toBeNull();
  });

  it('returns null for pending connector with empty sources', () => {
    const state = createPendingConnectorState([]);
    expect(generateExpressionFromSourceCardState(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Literal value type detection
// ---------------------------------------------------------------------------

describe('Literal value type detection', () => {
  it('bare number: integer', () => {
    const state = createFunctionCallState('add', [
      makeSourceSlot('order.qty'),
      makeLiteralSlot('5'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe('add(source("order.qty"), 5)');
  });

  it('bare number: float', () => {
    const state = createFunctionCallState('add', [
      makeSourceSlot('order.price'),
      makeLiteralSlot('3.14'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe('add(source("order.price"), 3.14)');
  });

  it('bare number: zero', () => {
    const state = createFunctionCallState('add', [
      makeSourceSlot('order.qty'),
      makeLiteralSlot('0'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe('add(source("order.qty"), 0)');
  });

  it('bare boolean: true', () => {
    const state = createFunctionCallState('someFunc', [
      makeSourceSlot('order.flag'),
      makeLiteralSlot('true'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'someFunc(source("order.flag"), true)',
    );
  });

  it('bare boolean: false', () => {
    const state = createFunctionCallState('someFunc', [
      makeSourceSlot('order.flag'),
      makeLiteralSlot('false'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'someFunc(source("order.flag"), false)',
    );
  });

  it('quoted string: plain text', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('order.name'),
      makeLiteralSlot('hello'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("order.name"), "hello")',
    );
  });

  it('quoted string: empty string', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('order.name'),
      makeLiteralSlot(''),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("order.name"), "")',
    );
  });

  it('quoted string: single whitespace remains a string literal (not 0)', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('order.firstName'),
      makeLiteralSlot(' '),
      makeSourceSlot('order.lastName'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("order.firstName"), " ", source("order.lastName"))',
    );
  });

  it('quoted string: multi-whitespace literal remains quoted', () => {
    const state = createFunctionCallState('concat', [
      makeLiteralSlot('   '),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat("   ")');
  });

  it('quoted string: string that looks like a number with leading zero', () => {
    // "007" — not a valid bare number (leading zero changes meaning)
    // Number("007") === 7, so this would be treated as number 7
    // The generator uses Number() heuristic — document this behaviour
    const state = createFunctionCallState('concat', [makeLiteralSlot('007')]);
    // Number("007") = 7, isFinite = true → bare number 7
    expect(generateExpressionFromSourceCardState(state)).toBe('concat(7)');
  });

  it('quoted string: string with special chars', () => {
    const state = createFunctionCallState('concat', [
      makeLiteralSlot('say "hello"'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat("say \\"hello\\"")');
  });

  it('quoted string: ISO8601 format token', () => {
    const state = createFunctionCallState('concat', [makeLiteralSlot('ISO8601')]);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat("ISO8601")');
  });
});

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

describe('String escaping', () => {
  it('escapes backslash in literal', () => {
    const state = createFunctionCallState('concat', [makeLiteralSlot('a\\b')]);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat("a\\\\b")');
  });

  it('escapes double quote in literal', () => {
    const state = createFunctionCallState('concat', [makeLiteralSlot('say "hi"')]);
    expect(generateExpressionFromSourceCardState(state)).toBe('concat("say \\"hi\\"")');
  });

  it('escapes double quote in source path', () => {
    const state = createDirectCopyState('field."quoted"');
    expect(generateExpressionFromSourceCardState(state)).toBe('source("field.\\"quoted\\"")');
  });
});

// ---------------------------------------------------------------------------
// Variadic functions
// ---------------------------------------------------------------------------

describe('Variadic functions', () => {
  it('generates concat with 4 slots', () => {
    const state = createFunctionCallState('concat', [
      makeSourceSlot('a'),
      makeLiteralSlot('-'),
      makeSourceSlot('b'),
      makeLiteralSlot('-'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'concat(source("a"), "-", source("b"), "-")',
    );
  });

  it('generates coalesce with 3 source slots', () => {
    const state = createFunctionCallState('coalesce', [
      makeSourceSlot('order.preferredName'),
      makeSourceSlot('order.firstName'),
      makeLiteralSlot('Unknown'),
    ]);
    expect(generateExpressionFromSourceCardState(state)).toBe(
      'coalesce(source("order.preferredName"), source("order.firstName"), "Unknown")',
    );
  });
});
