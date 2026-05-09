import { describe, expect, it } from 'vitest';

import { deriveExecutionVerdict, formatDiffSummary } from '../execution-result-utils';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { DiffResult } from '@/lib/types/diff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessState(
  diagnostics: { code: string; severity: 'error' | 'warning' | 'info'; message: string }[] = [],
): PreviewExecutionState {
  return {
    status: 'success',
    result: {
      output: {},
      diagnostics,
      stats: { rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0, durationMs: 5 },
    },
  };
}

const equalDiff: DiffResult = {
  isEqual: true,
  entries: [],
  summary: {
    total: 0,
    byCategory: {
      missing_field: 0,
      extra_field: 0,
      value_mismatch: 0,
      type_mismatch: 0,
      null_mismatch: 0,
      structural_mismatch: 0,
    },
  },
};

const unequalDiff: DiffResult = {
  isEqual: false,
  entries: [{ path: 'root.x', type: 'value_mismatch', actual: 1, expected: 2 }],
  summary: {
    total: 1,
    byCategory: {
      missing_field: 0,
      extra_field: 0,
      value_mismatch: 1,
      type_mismatch: 0,
      null_mismatch: 0,
      structural_mismatch: 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveExecutionVerdict', () => {
  it('returns "idle" for idle state', () => {
    expect(deriveExecutionVerdict({ status: 'idle' })).toBe('idle');
  });

  it('returns "executing" for executing state', () => {
    expect(deriveExecutionVerdict({ status: 'executing' })).toBe('executing');
  });

  it('returns "error" for error state', () => {
    expect(deriveExecutionVerdict({ status: 'error', error: 'boom' })).toBe('error');
  });

  it('returns "error" for timeout state', () => {
    expect(deriveExecutionVerdict({ status: 'timeout' })).toBe('error');
  });

  it('returns "pass" for success with no error diagnostics and no diffResult', () => {
    expect(deriveExecutionVerdict(makeSuccessState())).toBe('pass');
  });

  it('returns "pass" for success with no error diagnostics and equal diff (AE-06)', () => {
    expect(deriveExecutionVerdict(makeSuccessState(), equalDiff)).toBe('pass');
  });

  it('returns "pass" when diffResult is undefined (no expected output — AE-06)', () => {
    expect(deriveExecutionVerdict(makeSuccessState(), undefined)).toBe('pass');
  });

  it('returns "pass" when diffResult is null', () => {
    expect(deriveExecutionVerdict(makeSuccessState(), null)).toBe('pass');
  });

  it('returns "fail" when success has error diagnostics', () => {
    expect(
      deriveExecutionVerdict(
        makeSuccessState([{ code: 'E001', severity: 'error', message: 'bad' }]),
      ),
    ).toBe('fail');
  });

  it('returns "fail" when diff is not equal', () => {
    expect(deriveExecutionVerdict(makeSuccessState(), unequalDiff)).toBe('fail');
  });

  it('returns "fail" when both error diagnostics and diff mismatch', () => {
    expect(
      deriveExecutionVerdict(
        makeSuccessState([{ code: 'E001', severity: 'error', message: 'bad' }]),
        unequalDiff,
      ),
    ).toBe('fail');
  });

  it('returns "pass" when warnings exist but no errors (warnings do not fail)', () => {
    expect(
      deriveExecutionVerdict(
        makeSuccessState([{ code: 'W001', severity: 'warning', message: 'watch out' }]),
      ),
    ).toBe('pass');
  });

  it('returns "pass" when info diagnostics exist but no errors', () => {
    expect(
      deriveExecutionVerdict(
        makeSuccessState([{ code: 'I001', severity: 'info', message: 'fyi' }]),
      ),
    ).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// formatDiffSummary
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<Record<string, number>> = {}) {
  const base = {
    missing_field: 0,
    extra_field: 0,
    value_mismatch: 0,
    type_mismatch: 0,
    null_mismatch: 0,
    structural_mismatch: 0,
    ...overrides,
  };
  const total = Object.values(base).reduce((a, b) => a + b, 0);
  return { total, byCategory: base as Record<string, number> };
}

describe('formatDiffSummary', () => {
  it('returns empty string when total is 0', () => {
    expect(formatDiffSummary(makeSummary() as never)).toBe('');
  });

  it('returns singular "mismatch" for total of 1', () => {
    const result = formatDiffSummary(makeSummary({ type_mismatch: 1 }) as never);
    expect(result).toBe('1 mismatch: 1 type');
  });

  it('returns plural "mismatches" for total > 1', () => {
    const result = formatDiffSummary(makeSummary({ missing_field: 1, value_mismatch: 2 }) as never);
    expect(result).toContain('3 mismatches');
  });

  it('lists all non-zero categories', () => {
    const result = formatDiffSummary(
      makeSummary({ missing_field: 1, value_mismatch: 2 }) as never,
    );
    expect(result).toContain('1 missing');
    expect(result).toContain('2 value');
  });

  it('uses short category labels', () => {
    const result = formatDiffSummary(makeSummary({ structural_mismatch: 1 }) as never);
    expect(result).toContain('structural');
    expect(result).not.toContain('structural_mismatch');
  });

  it('omits zero-count categories from the label', () => {
    const result = formatDiffSummary(makeSummary({ type_mismatch: 1 }) as never);
    expect(result).not.toContain('missing');
    expect(result).not.toContain('extra');
    expect(result).not.toContain('value');
  });
});
