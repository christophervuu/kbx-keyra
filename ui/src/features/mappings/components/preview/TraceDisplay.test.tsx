import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';

import { TraceDisplay } from './TraceDisplay';
import type { TraceEntry } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<TraceEntry> = {}): TraceEntry {
  return {
    ruleIndex: 0,
    targetPath: 'output.name',
    expression: 'source.firstName',
    inputValue: { firstName: 'Alice' },
    outputValue: 'Alice',
    durationMs: 1.23,
    ...overrides,
  } as TraceEntry;
}

function renderTrace(
  trace: readonly TraceEntry[] | undefined,
  traceEnabled: boolean,
) {
  return render(createElement(TraceDisplay, { trace, traceEnabled }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceDisplay', () => {
  it('trace disabled: shows enable-trace message', () => {
    renderTrace(undefined, false);
    expect(screen.getByTestId('trace-disabled')).toBeInTheDocument();
    expect(screen.getByText(/Enable/)).toBeInTheDocument();
    expect(screen.getByText('Trace')).toBeInTheDocument();
  });

  it('trace enabled, no entries: shows "Run a mapping to see trace"', () => {
    renderTrace([], true);
    expect(screen.getByTestId('trace-empty')).toBeInTheDocument();
    expect(screen.getByText('Run a mapping to see trace')).toBeInTheDocument();
  });

  it('trace enabled, undefined: shows empty state', () => {
    renderTrace(undefined, true);
    expect(screen.getByTestId('trace-empty')).toBeInTheDocument();
  });

  it('renders list with correct entry count', () => {
    const entries = [
      makeEntry({ ruleIndex: 0, targetPath: 'output.name' }),
      makeEntry({ ruleIndex: 1, targetPath: 'output.age', expression: 'source.age', outputValue: 30 }),
      makeEntry({ ruleIndex: 2, targetPath: 'output.active', expression: 'true', outputValue: true }),
    ];
    renderTrace(entries, true);

    expect(screen.getByTestId('trace-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('trace-entry-1')).toBeInTheDocument();
    expect(screen.getByTestId('trace-entry-2')).toBeInTheDocument();
  });

  it('each row shows sequence number and target path', () => {
    const entries = [
      makeEntry({ targetPath: 'output.foo' }),
      makeEntry({ ruleIndex: 1, targetPath: 'output.bar' }),
    ];
    renderTrace(entries, true);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('output.foo')).toBeInTheDocument();
    expect(screen.getByText('output.bar')).toBeInTheDocument();
  });

  it('row shows formatted duration', () => {
    renderTrace([makeEntry({ durationMs: 2.5 })], true);
    expect(screen.getByText('2.50ms')).toBeInTheDocument();
  });

  it('row shows em-dash when durationMs is absent', () => {
    const entry = makeEntry();
    // Remove durationMs
    const { durationMs: _omit, ...rest } = entry;
    renderTrace([rest as TraceEntry], true);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('row is collapsed by default — detail not visible', () => {
    renderTrace([makeEntry()], true);
    expect(screen.queryByTestId('trace-detail-0')).not.toBeInTheDocument();
  });

  it('clicking a row expands it showing expression and value', () => {
    renderTrace([makeEntry({ expression: 'source.firstName', outputValue: 'Alice' })], true);

    fireEvent.click(screen.getByTestId('trace-row-0'));

    expect(screen.getByTestId('trace-detail-0')).toBeInTheDocument();
    expect(screen.getByText('source.firstName')).toBeInTheDocument();
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it('clicking expanded row collapses it', () => {
    renderTrace([makeEntry()], true);

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(screen.getByTestId('trace-detail-0')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(screen.queryByTestId('trace-detail-0')).not.toBeInTheDocument();
  });

  it('row button has aria-expanded attribute', () => {
    renderTrace([makeEntry()], true);

    const btn = screen.getByTestId('trace-row-0');
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('expanding one row does not expand others', () => {
    const entries = [makeEntry(), makeEntry({ ruleIndex: 1, targetPath: 'output.b' })];
    renderTrace(entries, true);

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(screen.getByTestId('trace-detail-0')).toBeInTheDocument();
    expect(screen.queryByTestId('trace-detail-1')).not.toBeInTheDocument();
  });

  it('list container has overflow-auto', () => {
    renderTrace([makeEntry()], true);
    const container = screen.getByTestId('trace-list-container');
    expect(container.className).toContain('overflow-auto');
  });

  it('list has singular aria-label for one entry', () => {
    renderTrace([makeEntry()], true);
    expect(screen.getByRole('list', { name: '1 trace entry' })).toBeInTheDocument();
  });

  it('list has plural aria-label for multiple entries', () => {
    renderTrace([makeEntry(), makeEntry({ ruleIndex: 1, targetPath: 'output.b' })], true);
    expect(screen.getByRole('list', { name: '2 trace entries' })).toBeInTheDocument();
  });
});
