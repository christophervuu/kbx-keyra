import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExecutionSummaryBar } from './ExecutionSummaryBar';
import type { PreviewExecutionState } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar(state: PreviewExecutionState) {
  return render(<ExecutionSummaryBar state={state} />);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExecutionSummaryBar', () => {
  describe('idle state', () => {
    it('renders "No results yet" for idle state', () => {
      renderBar({ status: 'idle' });
      expect(screen.getByTestId('summary-idle')).toHaveTextContent('No results yet');
    });
  });

  describe('executing state', () => {
    it('renders spinner for executing state', () => {
      renderBar({ status: 'executing' });
      expect(screen.getByRole('status', { name: /executing/i })).toBeInTheDocument();
      expect(screen.getByTestId('summary-executing')).toHaveTextContent('Executing…');
    });
  });

  describe('success state', () => {
    it('renders "Success" label', () => {
      renderBar(successState);
      expect(screen.getByTestId('summary-success')).toHaveTextContent('Success');
    });

    it('renders duration badge', () => {
      renderBar(successState);
      expect(screen.getByTestId('summary-duration')).toHaveTextContent('42ms');
    });

    it('renders rule stats with passed and failed counts', () => {
      renderBar(successState);
      const stats = screen.getByTestId('summary-rule-stats');
      expect(stats).toHaveTextContent('5 rules');
      expect(stats).toHaveTextContent('4 passed');
      expect(stats).toHaveTextContent('1 failed');
    });

    it('does not render "failed" text when rulesFailed is 0', () => {
      const state: PreviewExecutionState = {
        status: 'success',
        result: {
          output: {},
          diagnostics: [],
          stats: { rulesEvaluated: 3, rulesSucceeded: 3, rulesFailed: 0, durationMs: 10 },
        },
      };
      renderBar(state);
      expect(screen.getByTestId('summary-rule-stats')).not.toHaveTextContent('failed');
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
      expect(screen.getByTestId('summary-rule-stats')).toHaveTextContent('1 rule:');
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

  describe('error state', () => {
    it('renders "Error" label and error message', () => {
      renderBar({ status: 'error', error: 'Something went wrong' });
      expect(screen.getByTestId('summary-error')).toHaveTextContent('Error');
      expect(screen.getByTestId('summary-error-message')).toHaveTextContent(
        'Something went wrong',
      );
    });
  });

  describe('timeout state', () => {
    it('renders "Timeout" label', () => {
      renderBar({ status: 'timeout' });
      expect(screen.getByTestId('summary-timeout')).toHaveTextContent('Timeout');
    });
  });

  describe('accessibility', () => {
    it('has aria-live="polite" for screen reader announcements', () => {
      renderBar({ status: 'idle' });
      expect(screen.getByTestId('execution-summary-bar')).toHaveAttribute('aria-live', 'polite');
    });
  });
});
