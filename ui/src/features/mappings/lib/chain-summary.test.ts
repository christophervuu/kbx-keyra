/**
 * chain-summary.test.ts — FS-039 T-07
 *
 * Unit tests for summarizeStep and summarizeChain pure functions.
 * Covers all Verification Requirements from T-07.md.
 */

import { describe, expect, it } from 'vitest';
import { summarizeStep, summarizeSource, summarizeChain } from './chain-summary';
import {
  createEmptyChain,
  createEmptyFS039ConditionStep,
  createEmptyFS039ValueMapStep,
  createFieldSourceChain,
} from './chain-builder-state';
import type {
  FS039TransformStep,
  FS039ConditionStep,
  FS039ValueMapStep,
  ChainState,
} from './chain-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransformStep(functionName: string, args: FS039TransformStep['args'] = []): FS039TransformStep {
  return { kind: 'transform', functionName, args };
}

function makeConditionStep(overrides: Partial<FS039ConditionStep> = {}): FS039ConditionStep {
  return { ...createEmptyFS039ConditionStep(), ...overrides };
}

function makeValueMapStep(overrides: Partial<FS039ValueMapStep> = {}): FS039ValueMapStep {
  return { ...createEmptyFS039ValueMapStep(), ...overrides };
}

// ---------------------------------------------------------------------------
// summarizeSource
// ---------------------------------------------------------------------------

describe('summarizeSource', () => {
  it('returns source("path") for field source', () => {
    expect(summarizeSource({ kind: 'field', path: 'customer.name' })).toBe('source("customer.name")');
  });

  it('returns quoted string for static string source', () => {
    expect(summarizeSource({ kind: 'static', value: { type: 'string', value: 'hello' } })).toBe('"hello"');
  });

  it('returns number string for static number source', () => {
    expect(summarizeSource({ kind: 'static', value: { type: 'number', value: 42 } })).toBe('42');
  });

  it('returns boolean string for static boolean source', () => {
    expect(summarizeSource({ kind: 'static', value: { type: 'boolean', value: true } })).toBe('true');
  });

  it('returns null for static null source', () => {
    expect(summarizeSource({ kind: 'static', value: { type: 'null' } })).toBe('null');
  });

  it('returns (no source) for none source', () => {
    expect(summarizeSource({ kind: 'none' })).toBe('(no source)');
  });
});

// ---------------------------------------------------------------------------
// summarizeStep — transform
// ---------------------------------------------------------------------------

describe('summarizeStep — transform', () => {
  it('returns functionName() for transform with no args', () => {
    expect(summarizeStep(makeTransformStep('upper'))).toBe('upper()');
  });

  it('returns functionName() for transform with empty args array', () => {
    expect(summarizeStep(makeTransformStep('trim', []))).toBe('trim()');
  });

  it('returns functionName("arg") for transform with literal arg', () => {
    expect(summarizeStep(makeTransformStep('default', [{ mode: 'literal', value: 'N/A' }]))).toBe('default("N/A")');
  });

  it('returns functionName(source("path")) for transform with source arg', () => {
    expect(summarizeStep(makeTransformStep('concat', [{ mode: 'source', path: 'other.field' }]))).toBe('concat(source("other.field"))');
  });

  it('returns functionName(arg1, arg2) for multiple args', () => {
    expect(summarizeStep(makeTransformStep('cast', [{ mode: 'literal', value: 'number' }]))).toBe('cast("number")');
  });

  it('returns (no function selected) for empty functionName', () => {
    expect(summarizeStep(makeTransformStep(''))).toBe('(no function selected)');
  });

  it('truncates long summaries at ~80 chars with ellipsis', () => {
    const longName = 'a'.repeat(70);
    const result = summarizeStep(makeTransformStep(longName));
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeStep — condition
// ---------------------------------------------------------------------------

describe('summarizeStep — condition', () => {
  it('renders If ... then ... else ... for basic condition', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [
            {
              left: { kind: 'currentValue' },
              operator: 'eq',
              right: { kind: 'static', value: { type: 'string', value: 'VIP' } },
            },
          ],
          thenBranch: { source: { kind: 'static', value: { type: 'string', value: 'premium' } }, steps: [] },
        },
      ],
      elseBranch: { source: { kind: 'static', value: { type: 'string', value: 'standard' } }, steps: [] },
    };
    const result = summarizeStep(step);
    expect(result).toContain('If');
    expect(result).toContain('current value');
    expect(result).toContain('=');
    expect(result).toContain('"VIP"');
    expect(result).toContain('then');
    expect(result).toContain('"premium"');
    expect(result).toContain('else');
    expect(result).toContain('"standard"');
  });

  it('includes else-if count when multiple clauses', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '"A"' } }],
          thenBranch: createEmptyChain(),
        },
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '"B"' } }],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    const result = summarizeStep(step);
    expect(result).toContain('+1 else-if');
  });

  it('uses unary operator label without right operand for isNull', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'isNull', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    const result = summarizeStep(step);
    expect(result).toContain('is null');
    // Should NOT contain a right operand reference
    expect(result).not.toContain('(expression)');
  });

  it('truncates long condition summaries', () => {
    const step = createEmptyFS039ConditionStep();
    const result = summarizeStep(step);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// summarizeStep — value map
// ---------------------------------------------------------------------------

describe('summarizeStep — value map', () => {
  it('renders Map N values, default: ... for value map', () => {
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'US', outputChain: createEmptyChain() },
        { whenValue: 'UK', outputChain: createEmptyChain() },
      ],
      defaultValue: { source: { kind: 'field', path: 'country' }, steps: [] },
    };
    const result = summarizeStep(step);
    expect(result).toBe('Map 2 values, default: source("country")');
  });

  it('uses singular "value" for 1 mapping', () => {
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [{ whenValue: 'US', outputChain: createEmptyChain() }],
      defaultValue: createEmptyChain(),
    };
    const result = summarizeStep(step);
    expect(result).toContain('Map 1 value,');
  });

  it('truncates long value map summaries', () => {
    const step = createEmptyFS039ValueMapStep();
    const result = summarizeStep(step);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// summarizeChain
// ---------------------------------------------------------------------------

describe('summarizeChain', () => {
  it('returns source summary for chain with no steps', () => {
    const chain: ChainState = { source: { kind: 'field', path: 'customer.name' }, steps: [] };
    expect(summarizeChain(chain)).toBe('source("customer.name")');
  });

  it('returns last step summary for chain with steps', () => {
    const chain: ChainState = {
      source: { kind: 'field', path: 'name' },
      steps: [
        makeTransformStep('upper'),
        makeTransformStep('trim'),
      ],
    };
    expect(summarizeChain(chain)).toBe('trim()');
  });

  it('returns (no source) for empty chain', () => {
    expect(summarizeChain(createEmptyChain())).toBe('(no source)');
  });
});
