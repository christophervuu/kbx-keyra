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

  it('AE-05: age value_mismatch (amber), active extra_field (amber)', () => {
    renderDiff(makeSuccessState({ name: 'Alice', age: 30, active: true }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', age: 31 }) },
    });

    const list = screen.getByTestId('diff-entries-list');
    expect(list).toBeInTheDocument();

    // Two entries: age value_mismatch, active extra_field
    const entries = screen.getAllByTestId(/^diff-entry-/);
    expect(entries).toHaveLength(2);

    // Find the value_mismatch entry (age)
    const valueMismatchEntry = entries.find((el) => el.getAttribute('data-entry-type') === 'value_mismatch');
    expect(valueMismatchEntry).toBeDefined();
    expect(valueMismatchEntry!.className).toMatch(/amber/);

    // Find the extra_field entry (active — in actual but not in expected)
    const extraFieldEntry = entries.find((el) => el.getAttribute('data-entry-type') === 'extra_field');
    expect(extraFieldEntry).toBeDefined();
    expect(extraFieldEntry!.className).toMatch(/amber/);
  });

  it('missing_field entry has red styling', () => {
    renderDiff(makeSuccessState({ name: 'Alice' }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', extra: 'field' }) },
    });

    const missingEntry = screen.getByTestId('diff-entry-0');
    expect(missingEntry.getAttribute('data-entry-type')).toBe('missing_field');
    expect(missingEntry.className).toMatch(/red/);
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
    // a: value_mismatch, b: extra_field, c: missing_field
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

  // ---- T-02: Diff summary header ------------------------------------------

  it('renders diff summary header when there are mismatches', () => {
    renderDiff(makeSuccessState({ a: 1 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 2 }) },
    });

    expect(screen.getByTestId('diff-summary-header')).toBeInTheDocument();
  });

  it('summary header shows total mismatch count', () => {
    renderDiff(makeSuccessState({ a: 1, b: 2 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 99, c: 3 }) },
    });

    // a: value_mismatch, b: extra_field, c: missing_field → 3 mismatches
    const header = screen.getByTestId('diff-summary-header');
    expect(header).toHaveTextContent('3 mismatches');
  });

  it('summary header shows singular "mismatch" for one entry', () => {
    renderDiff(makeSuccessState({ a: 1 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 2 }) },
    });

    const header = screen.getByTestId('diff-summary-header');
    expect(header).toHaveTextContent('1 mismatch');
    expect(header).not.toHaveTextContent('mismatches');
  });

  it('summary header does not render when outputs match', () => {
    renderDiff(makeSuccessState({ a: 1 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ a: 1 }) },
    });

    expect(screen.queryByTestId('diff-summary-header')).not.toBeInTheDocument();
  });

  // ---- T-02: Type annotation for type_mismatch ----------------------------

  it('type_mismatch entry shows actualType → expectedType annotation', () => {
    renderDiff(makeSuccessState({ age: '30' }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ age: 30 }) },
    });

    const entry = screen.getByTestId('diff-entry-0');
    expect(entry.getAttribute('data-entry-type')).toBe('type_mismatch');
    // Should show "string → number"
    expect(entry).toHaveTextContent('string');
    expect(entry).toHaveTextContent('number');
  });

  // ---- T-02: Value display per category -----------------------------------

  it('missing_field entry shows expected value only', () => {
    renderDiff(makeSuccessState({ name: 'Alice' }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice', role: 'admin' }) },
    });

    const entry = screen.getByTestId('diff-entry-0');
    expect(entry.getAttribute('data-entry-type')).toBe('missing_field');
    expect(entry).toHaveTextContent('"admin"');
    expect(entry).toHaveTextContent('expected');
  });

  it('extra_field entry shows actual value only', () => {
    renderDiff(makeSuccessState({ name: 'Alice', extra: true }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ name: 'Alice' }) },
    });

    const entry = screen.getByTestId('diff-entry-0');
    expect(entry.getAttribute('data-entry-type')).toBe('extra_field');
    expect(entry).toHaveTextContent('true');
    expect(entry).toHaveTextContent('actual');
  });

  it('value_mismatch entry shows both actual and expected values', () => {
    renderDiff(makeSuccessState({ score: 80 }));
    fireEvent.change(getExpectedInput(), {
      target: { value: JSON.stringify({ score: 100 }) },
    });

    const entry = screen.getByTestId('diff-entry-0');
    expect(entry.getAttribute('data-entry-type')).toBe('value_mismatch');
    expect(entry).toHaveTextContent('80');
    expect(entry).toHaveTextContent('100');
  });
});
