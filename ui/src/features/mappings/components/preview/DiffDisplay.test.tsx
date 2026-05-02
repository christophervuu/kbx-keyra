import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';

import { DiffDisplay } from './DiffDisplay';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { ExecutionResult } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessState(output: unknown): PreviewExecutionState {
  return {
    status: 'success',
    result: {
      output,
      diagnostics: [],
      trace: [],
      stats: { durationMs: 5, rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0 },
    } as unknown as ExecutionResult,
  };
}

function renderDiff(state: PreviewExecutionState) {
  return render(createElement(DiffDisplay, { state }));
}

function getExpectedInput() {
  return screen.getByTestId('diff-expected-input') as HTMLTextAreaElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiffDisplay', () => {
  // ---- Empty states -------------------------------------------------------

  it('idle: shows "Run a mapping first to compare output"', () => {
    renderDiff({ status: 'idle' });
    expect(screen.getByTestId('diff-no-execution')).toBeInTheDocument();
    expect(screen.getByText('Run a mapping first to compare output')).toBeInTheDocument();
  });

  it('executing: shows executing placeholder', () => {
    renderDiff({ status: 'executing' });
    expect(screen.getByTestId('diff-executing')).toBeInTheDocument();
  });

  it('timeout: shows timeout message', () => {
    renderDiff({ status: 'timeout' });
    expect(screen.getByTestId('diff-timeout')).toBeInTheDocument();
    expect(screen.getByText(/Execution timed out/)).toBeInTheDocument();
  });

  it('error: shows error message', () => {
    renderDiff({ status: 'error', error: 'Engine threw' });
    expect(screen.getByTestId('diff-error')).toBeInTheDocument();
  });

  it('success, no expected entered: shows "Enter expected output to compare"', () => {
    renderDiff(makeSuccessState({ name: 'Alice' }));
    expect(screen.getByTestId('diff-no-expected')).toBeInTheDocument();
    expect(screen.getByText('Enter expected output to compare')).toBeInTheDocument();
  });

  // ---- Expected input -----------------------------------------------------

  it('expected input is always rendered', () => {
    renderDiff({ status: 'idle' });
    expect(getExpectedInput()).toBeInTheDocument();
  });

  it('expected input has correct placeholder', () => {
    renderDiff({ status: 'idle' });
    expect(getExpectedInput()).toHaveAttribute('placeholder', 'Paste expected output JSON...');
  });

  it('invalid expected JSON shows inline error with role=alert', () => {
    renderDiff(makeSuccessState({ x: 1 }));

    fireEvent.change(getExpectedInput(), { target: { value: '{bad json' } });

    const err = screen.getByTestId('diff-expected-error');
    expect(err).toBeInTheDocument();
    expect(err).toHaveAttribute('role', 'alert');
  });

  it('invalid expected JSON sets aria-invalid on textarea', () => {
    renderDiff(makeSuccessState({ x: 1 }));
    fireEvent.change(getExpectedInput(), { target: { value: '{bad' } });
    expect(getExpectedInput()).toHaveAttribute('aria-invalid', 'true');
  });

  it('clearing invalid input removes error', () => {
    renderDiff(makeSuccessState({ x: 1 }));
    fireEvent.change(getExpectedInput(), { target: { value: '{bad' } });
    expect(screen.getByTestId('diff-expected-error')).toBeInTheDocument();

    fireEvent.change(getExpectedInput(), { target: { value: '' } });
    expect(screen.queryByTestId('diff-expected-error')).not.toBeInTheDocument();
  });

  // ---- Diff equal state ---------------------------------------------------

  it('matching outputs: shows "Output matches expected"', () => {
    renderDiff(makeSuccessState({ name: 'Alice', age: 30 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', age: 30 }) },
    });

    expect(screen.getByTestId('diff-equal')).toBeInTheDocument();
    expect(screen.getByText('Output matches expected')).toBeInTheDocument();
  });

  // ---- AE-05: actual {"name":"Alice","age":30,"active":true} vs expected {"name":"Alice","age":31} ----

  it('AE-05: age changed (amber), active added (green)', () => {
    renderDiff(makeSuccessState({ name: 'Alice', age: 30, active: true }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', age: 31 }) },
    });

    const list = screen.getByTestId('diff-entries-list');
    expect(list).toBeInTheDocument();

    // Two entries: age changed, active added
    const entries = screen.getAllByTestId(/^diff-entry-/);
    expect(entries).toHaveLength(2);

    // Find the changed entry (age)
    const changedEntry = entries.find((el) => el.getAttribute('data-entry-type') === 'changed');
    expect(changedEntry).toBeDefined();
    expect(changedEntry!.className).toMatch(/amber/);

    // Find the added entry (active)
    const addedEntry = entries.find((el) => el.getAttribute('data-entry-type') === 'added');
    expect(addedEntry).toBeDefined();
    expect(addedEntry!.className).toMatch(/green/);
  });

  it('removed entry has red styling', () => {
    renderDiff(makeSuccessState({ name: 'Alice' }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', extra: 'field' }) },
    });

    const removedEntry = screen.getByTestId('diff-entry-0');
    expect(removedEntry.getAttribute('data-entry-type')).toBe('removed');
    expect(removedEntry.className).toMatch(/red/);
  });

  it('diff list has accessible aria-label with count', () => {
    renderDiff(makeSuccessState({ a: 1, b: 2 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 1 }) },
    });

    // b is added
    expect(screen.getByRole('list', { name: '1 difference' })).toBeInTheDocument();
  });

  it('plural aria-label for multiple differences', () => {
    renderDiff(makeSuccessState({ a: 1, b: 2 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 99, c: 3 }) },
    });
    // a changed, b added, c removed
    const list = screen.getByTestId('diff-entries-list');
    expect(list.getAttribute('aria-label')).toMatch(/differences/);
  });

  it('diff display container is scrollable', () => {
    renderDiff(makeSuccessState({ name: 'Alice', age: 30 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Bob' }) },
    });
    const container = screen.getByTestId('diff-display');
    expect(container).toBeInTheDocument();
    // The inner result area has overflow-auto
    const overflowArea = container.querySelector('.overflow-auto');
    expect(overflowArea).not.toBeNull();
  });
});
