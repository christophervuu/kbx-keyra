import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExecutionSummaryBar } from './ExecutionSummaryBar';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { DiffResult } from '@/lib/types/diff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar(
  state: PreviewExecutionState,
  extra?: Partial<Omit<React.ComponentProps<typeof ExecutionSummaryBar>, 'state'>>,
) {
  return render(<ExecutionSummaryBar state={state} {...extra} />);
}

const successState: PreviewExecutionState = {
  status: 'success',
  result: {
    output: { foo: 'bar' },
    diagnostics: [],
    stats: {
      rulesEvaluated: 5,
      rulesSucceeded: 4,
      rulesFailed: 1,
      durationMs: 42,
    },
  },
};

const cleanSuccessState: PreviewExecutionState = {
  status: 'success',
  result: {
    output: { foo: 'bar' },
    diagnostics: [],
    stats: {
      rulesEvaluated: 3,
      rulesSucceeded: 3,
      rulesFailed: 0,
      durationMs: 10,
    },
  },
};

const equalDiffResult: DiffResult = {
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

const unequalDiffResult: DiffResult = {
  isEqual: false,
  entries: [{ path: 'root.name', type: 'value_mismatch', actual: 'Alice', expected: 'Bob' }],
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

describe('ExecutionSummaryBar', () => {
  // ---- Idle state (hidden) -------------------------------------------------

  describe('idle state', () => {
    it('renders nothing when idle', () => {
      const { container } = renderBar({ status: 'idle' });
      expect(container.firstChild).toBeNull();
    });
  });

  // ---- Executing state -----------------------------------------------------

  describe('executing state', () => {
    it('renders spinner for executing state', () => {
      renderBar({ status: 'executing' });
      expect(screen.getByRole('status', { name: /executing/i })).toBeInTheDocument();
      expect(screen.getByTestId('summary-executing')).toHaveTextContent('Executing…');
    });

    it('is visible when executing', () => {
      renderBar({ status: 'executing' });
      expect(screen.getByTestId('execution-summary-bar')).toBeInTheDocument();
    });
  });

  // ---- Pass state ----------------------------------------------------------

  describe('pass state', () => {
    it('renders "Passed" label for clean success', () => {
      renderBar(cleanSuccessState);
      expect(screen.getByTestId('summary-verdict-pass')).toHaveTextContent('Passed');
    });

    it('renders "Passed" when diff is equal', () => {
      renderBar(cleanSuccessState, { diffResult: equalDiffResult });
      expect(screen.getByTestId('summary-verdict-pass')).toBeInTheDocument();
    });

    it('renders "Passed" when no diffResult provided (AE-06)', () => {
      renderBar(cleanSuccessState);
      expect(screen.getByTestId('summary-verdict-pass')).toBeInTheDocument();
    });

    it('renders duration badge', () => {
      renderBar(successState);
      expect(screen.getByTestId('summary-duration')).toHaveTextContent('42ms');
    });

    it('renders rule stats', () => {
      renderBar(successState);
      const stats = screen.getByTestId('summary-rule-stats');
      expect(stats).toHaveTextContent('4/5');
      expect(stats).toHaveTextContent('rules');
    });

    it('renders singular "rule" when rulesEvaluated is 1', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [],
          stats: { rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0, durationMs: 5 },
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-rule-stats')).toHaveTextContent('rule');
      expect(screen.getByTestId('summary-rule-stats')).not.toHaveTextContent('rules');
    });

    it('does not render stats section when stats is undefined', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: { output: {}, diagnostics: [] },
      };
      renderBar(state);
      expect(screen.queryByTestId('summary-duration')).not.toBeInTheDocument();
      expect(screen.queryByTestId('summary-rule-stats')).not.toBeInTheDocument();
    });
  });

  // ---- Fail state ----------------------------------------------------------

  describe('fail state', () => {
    it('renders "Failed" when diff is not equal', () => {
      renderBar(cleanSuccessState, { diffResult: unequalDiffResult });
      expect(screen.getByTestId('summary-verdict-fail')).toHaveTextContent('Failed');
    });

    it('renders "Failed" when error diagnostics exist', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [{ code: 'E001', severity: 'error', message: 'bad' }],
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-verdict-fail')).toBeInTheDocument();
    });

    it('renders "Failed" when both error diagnostics and diff mismatch', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [{ code: 'E001', severity: 'error', message: 'bad' }],
        },
      };
      renderBar(state, { diffResult: unequalDiffResult });
      expect(screen.getByTestId('summary-verdict-fail')).toBeInTheDocument();
    });
  });

  // ---- Error state ---------------------------------------------------------

  describe('error state', () => {
    it('renders "Error" label and error message', () => {
      renderBar({ status: 'error', error: 'Something went wrong' });
      expect(screen.getByTestId('summary-verdict-error')).toHaveTextContent('Error');
      expect(screen.getByTestId('summary-error-message')).toHaveTextContent(
        'Something went wrong',
      );
    });

    it('renders "Error" label for timeout', () => {
      renderBar({ status: 'timeout' });
      expect(screen.getByTestId('summary-verdict-error')).toHaveTextContent('Error');
      expect(screen.getByTestId('summary-timeout-message')).toHaveTextContent('timed out');
    });
  });

  // ---- Diagnostic badges ---------------------------------------------------

  describe('diagnostic badges', () => {
    it('renders error badge when error diagnostics exist', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [
            { code: 'E001', severity: 'error', message: 'bad' },
            { code: 'E002', severity: 'error', message: 'also bad' },
          ],
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-diag-error')).toHaveTextContent('2');
      expect(screen.getByLabelText('2 errors')).toBeInTheDocument();
    });

    it('renders warning badge when warning diagnostics exist', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [{ code: 'W001', severity: 'warning', message: 'watch out' }],
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-diag-warning')).toHaveTextContent('1');
      expect(screen.getByLabelText('1 warning')).toBeInTheDocument();
    });

    it('renders info badge when info diagnostics exist', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [{ code: 'I001', severity: 'info', message: 'fyi' }],
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-diag-info')).toHaveTextContent('1');
    });

    it('does not render zero-count severity badges', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [{ code: 'W001', severity: 'warning', message: 'watch out' }],
        },
      };
      renderBar(state);
      expect(screen.queryByTestId('summary-diag-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('summary-diag-info')).not.toBeInTheDocument();
    });

    it('does not render diagnostics section when all counts are zero', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: { output: {}, diagnostics: [] },
      };
      renderBar(state);
      expect(screen.queryByTestId('summary-diagnostics')).not.toBeInTheDocument();
    });
  });

  // ---- Version and environment badges -------------------------------------

  describe('version and environment badges', () => {
    it('renders version badge when mappingVersion is provided', () => {
      renderBar(cleanSuccessState, { mappingVersion: 3 });
      expect(screen.getByTestId('summary-version')).toHaveTextContent('v3');
    });

    it('does not render version badge when mappingVersion is not provided', () => {
      renderBar(cleanSuccessState);
      expect(screen.queryByTestId('summary-version')).not.toBeInTheDocument();
    });

    it('renders default "Local" environment badge', () => {
      renderBar(cleanSuccessState);
      expect(screen.getByTestId('summary-environment')).toHaveTextContent('Local');
    });

    it('renders custom environment label', () => {
      renderBar(cleanSuccessState, { environmentLabel: 'Staging' });
      expect(screen.getByTestId('summary-environment')).toHaveTextContent('Staging');
    });
  });

  // ---- Diff summary label (T-04 forward-wiring) ---------------------------

  describe('diffSummaryLabel', () => {
    it('renders diff summary label badge when provided', () => {
      renderBar(cleanSuccessState, { diffSummaryLabel: '2 mismatches: 1 type, 1 value' });
      expect(screen.getByTestId('summary-diff-label')).toHaveTextContent('2 mismatches');
    });

    it('does not render diff label badge when not provided', () => {
      renderBar(cleanSuccessState);
      expect(screen.queryByTestId('summary-diff-label')).not.toBeInTheDocument();
    });
  });

  // ---- Accessibility -------------------------------------------------------

  describe('accessibility', () => {
    it('has aria-live="polite" for screen reader announcements', () => {
      renderBar({ status: 'executing' });
      expect(screen.getByTestId('execution-summary-bar')).toHaveAttribute('aria-live', 'polite');
    });
  });
});
