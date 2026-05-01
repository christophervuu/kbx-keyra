import { describe, expect, it } from 'vitest';

import { evaluate } from '../../../src/engine/dsl/evaluator.js';
import type { AstNode, EvaluationContext } from '../../../src/engine/dsl/types.js';
import { registerDateFunctions } from '../../../src/engine/functions/date.js';
import { createRegistry } from '../../../src/engine/registry/function-registry.js';

function createContext(): EvaluationContext {
  const registry = createRegistry();
  registerDateFunctions(registry);

  const context: EvaluationContext = {
    sourceData: {},
    scopeStack: [],
    constants: {},
    externalSources: {},
    registry,
    options: {},
    evaluate,
    addDiagnostic: () => {
      // Overridden by evaluator root context.
    },
    pushScope: (scope) => {
      context.scopeStack.push(scope);
    },
    popScope: () => context.scopeStack.pop(),
  };

  return context;
}

function callFormatDate(value: string, inputFormat: string, outputFormat: string): AstNode {
  return {
    type: 'FunctionCall',
    name: 'formatDate',
    arguments: [
      { type: 'StringLiteral', value, start: 0, end: 0 },
      { type: 'StringLiteral', value: inputFormat, start: 0, end: 0 },
      { type: 'StringLiteral', value: outputFormat, start: 0, end: 0 },
    ],
    start: 0,
    end: 1,
  };
}

describe('formatDate()', () => {
  it('AE-17: reformats ISO8601 input to token format', () => {
    const context = createContext();

    const result = evaluate(
      callFormatDate('2026-03-31T14:22:19Z', 'ISO8601', 'YYYY-MM-DD'),
      context,
    );

    expect(result.value).toBe('2026-03-31');
    expect(result.diagnostics).toEqual([]);
  });

  it('supports non-ISO token parsing and formatting', () => {
    const context = createContext();

    const usToIso = evaluate(callFormatDate('03/31/2026', 'MM/DD/YYYY', 'YYYY-MM-DD'), context);
    const isoToUs = evaluate(callFormatDate('2026-04-02', 'YYYY-MM-DD', 'MM/DD/YYYY'), context);

    expect(usToIso.value).toBe('2026-03-31');
    expect(isoToUs.value).toBe('04/02/2026');
  });

  it('covers all tokens YYYY MM DD HH mm ss', () => {
    const context = createContext();

    const result = evaluate(
      callFormatDate('2026/03/31 14:22:19', 'YYYY/MM/DD HH:mm:ss', 'DD-MM-YYYY HH:mm:ss'),
      context,
    );

    expect(result.value).toBe('31-03-2026 14:22:19');
    expect(result.diagnostics).toEqual([]);
  });

  it('parses ISO8601 variants (Z, offset, no timezone, date-only)', () => {
    const context = createContext();

    const withZ = evaluate(callFormatDate('2026-03-31T14:22:19Z', 'ISO8601', 'YYYY-MM-DD HH:mm:ss'), context);
    const withOffset = evaluate(
      callFormatDate('2026-03-31T14:22:19+05:00', 'ISO8601', 'YYYY-MM-DD HH:mm:ss'),
      context,
    );
    const noTimezone = evaluate(
      callFormatDate('2026-03-31T14:22:19', 'ISO8601', 'YYYY-MM-DD HH:mm:ss'),
      context,
    );
    const dateOnly = evaluate(callFormatDate('2026-03-31', 'ISO8601', 'YYYY-MM-DD HH:mm:ss'), context);

    expect(withZ.value).toBe('2026-03-31 14:22:19');
    expect(withOffset.value).toBe('2026-03-31 14:22:19');
    expect(noTimezone.value).toBe('2026-03-31 14:22:19');
    expect(dateOnly.value).toBe('2026-03-31 00:00:00');
  });

  it('outputs ISO8601 with Z suffix when outputFormat is ISO8601', () => {
    const context = createContext();

    const result = evaluate(
      callFormatDate('03/31/2026 14:22:19', 'MM/DD/YYYY HH:mm:ss', 'ISO8601'),
      context,
    );

    expect(result.value).toBe('2026-03-31T14:22:19Z');
    expect(result.diagnostics).toEqual([]);
  });

  it('handles adjacent tokens and identity formatting', () => {
    const context = createContext();

    const adjacent = evaluate(callFormatDate('20260331', 'YYYYMMDD', 'MM-DD-YYYY'), context);
    const identity = evaluate(callFormatDate('2026-03-31', 'YYYY-MM-DD', 'YYYY-MM-DD'), context);

    expect(adjacent.value).toBe('03-31-2026');
    expect(identity.value).toBe('2026-03-31');
    expect(adjacent.diagnostics).toEqual([]);
    expect(identity.diagnostics).toEqual([]);
  });

  it('AE-18: emits E040 on parse failure', () => {
    const context = createContext();

    const result = evaluate(callFormatDate('not-a-date', 'YYYY-MM-DD', 'MM/DD/YYYY'), context);

    expect(result.value).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E040')).toBe(true);
  });

  it('emits E040 for empty input, wrong separator, and invalid ISO token usage', () => {
    const context = createContext();

    const emptyInput = evaluate(callFormatDate('', 'YYYY-MM-DD', 'MM/DD/YYYY'), context);
    const wrongSeparator = evaluate(callFormatDate('2026/03/31', 'YYYY-MM-DD', 'MM/DD/YYYY'), context);
    const invalidIsoInInput = evaluate(
      callFormatDate('2026-03-31T14:22:19Z', 'YYYY-ISO8601-DD', 'YYYY-MM-DD'),
      context,
    );
    const invalidIsoInOutput = evaluate(
      callFormatDate('2026-03-31', 'YYYY-MM-DD', 'YYYY-ISO8601-DD'),
      context,
    );

    expect(emptyInput.value).toBeNull();
    expect(wrongSeparator.value).toBeNull();
    expect(invalidIsoInInput.value).toBeNull();
    expect(invalidIsoInOutput.value).toBeNull();

    expect(emptyInput.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E040')).toBe(true);
    expect(wrongSeparator.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E040')).toBe(true);
    expect(invalidIsoInInput.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E040')).toBe(true);
    expect(invalidIsoInOutput.diagnostics.some((diagnostic) => diagnostic.code === 'KEYRA-E040')).toBe(
      true,
    );
  });
});
