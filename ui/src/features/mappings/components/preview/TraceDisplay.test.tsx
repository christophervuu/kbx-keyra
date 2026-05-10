import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

import { TraceDisplay } from './TraceDisplay';
import type { TraceEntry } from '@keyra/engine';
import type { DebugSelection } from '@/features/mappings/types';

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
  extra?: Partial<React.ComponentProps<typeof TraceDisplay>>,
) {
  return render(createElement(TraceDisplay, { trace, traceEnabled, ...extra }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceDisplay', () => {
  // -------------------------------------------------------------------------
  // Existing state-variant tests (backward-compatible)
  // -------------------------------------------------------------------------

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

  it('clicking the expand button expands it showing expression and value', () => {
    renderTrace([makeEntry({ expression: 'source.firstName', outputValue: 'Alice' })], true);

    fireEvent.click(screen.getByTestId('trace-row-0'));

    expect(screen.getByTestId('trace-detail-0')).toBeInTheDocument();
    expect(screen.getByText('source.firstName')).toBeInTheDocument();
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it('clicking expanded toggle button collapses it', () => {
    renderTrace([makeEntry()], true);

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(screen.getByTestId('trace-detail-0')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(screen.queryByTestId('trace-detail-0')).not.toBeInTheDocument();
  });

  it('toggle button has aria-expanded attribute', () => {
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
    const scrollDiv = container.querySelector('.overflow-auto');
    expect(scrollDiv).not.toBeNull();
  });

  it('list has singular aria-label for one entry', () => {
    renderTrace([makeEntry()], true);
    expect(screen.getByRole('list', { name: '1 trace entry' })).toBeInTheDocument();
  });

  it('list has plural aria-label for multiple entries', () => {
    renderTrace([makeEntry(), makeEntry({ ruleIndex: 1, targetPath: 'output.b' })], true);
    expect(screen.getByRole('list', { name: '2 trace entries' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Click-to-select (onSelect)
  // -------------------------------------------------------------------------

  it('clicking a trace row fires onSelect with correct DebugSelection', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderTrace(
      [makeEntry({ ruleIndex: 2, targetPath: 'output.foo' })],
      true,
      { onSelect },
    );

    fireEvent.click(screen.getByTestId('trace-entry-0'));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({
      targetPath: 'output.foo',
      ruleIndex: 2,
      source: 'trace',
    });
  });

  it('keyboard Enter on a trace row fires onSelect', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderTrace([makeEntry()], true, { onSelect });

    fireEvent.keyDown(screen.getByTestId('trace-entry-0'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('keyboard Space on a trace row fires onSelect', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderTrace([makeEntry()], true, { onSelect });

    fireEvent.keyDown(screen.getByTestId('trace-entry-0'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('trace row has role=button when onSelect is provided', () => {
    const onSelect = vi.fn();
    renderTrace([makeEntry()], true, { onSelect });
    expect(screen.getByTestId('trace-entry-0')).toHaveAttribute('role', 'button');
  });

  it('clicking expand button does not fire onSelect (stopPropagation)', () => {
    const onSelect = vi.fn();
    renderTrace([makeEntry()], true, { onSelect });

    fireEvent.click(screen.getByTestId('trace-row-0'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Highlight state
  // -------------------------------------------------------------------------

  it('row matching selectedRuleIndex renders highlight class', () => {
    renderTrace(
      [makeEntry({ ruleIndex: 0 }), makeEntry({ ruleIndex: 1, targetPath: 'output.b' })],
      true,
      { selectedRuleIndex: 1, onSelect: vi.fn() },
    );

    expect(screen.getByTestId('trace-entry-1').className).toContain('bg-blue-500/15');
    expect(screen.getByTestId('trace-entry-0').className).not.toContain('bg-blue-500/15');
  });

  it('row matching selectedTargetPath renders highlight class', () => {
    renderTrace(
      [makeEntry({ targetPath: 'output.name' }), makeEntry({ ruleIndex: 1, targetPath: 'output.age' })],
      true,
      { selectedTargetPath: 'output.age', onSelect: vi.fn() },
    );

    expect(screen.getByTestId('trace-entry-1').className).toContain('bg-blue-500/15');
    expect(screen.getByTestId('trace-entry-0').className).not.toContain('bg-blue-500/15');
  });

  it('row has aria-pressed=true when selected', () => {
    renderTrace(
      [makeEntry({ ruleIndex: 0 })],
      true,
      { selectedRuleIndex: 0, onSelect: vi.fn() },
    );
    expect(screen.getByTestId('trace-entry-0')).toHaveAttribute('aria-pressed', 'true');
  });

  // -------------------------------------------------------------------------
  // Status filter chips
  // -------------------------------------------------------------------------

  it('Failed and Success chips render', () => {
    renderTrace([makeEntry()], true);
    expect(screen.getByTestId('status-chip-failed')).toBeInTheDocument();
    expect(screen.getByTestId('status-chip-success')).toBeInTheDocument();
  });

  it('Failed filter shows only entries with diagnostics', () => {
    const failedEntry = makeEntry({
      ruleIndex: 0,
      targetPath: 'output.a',
      diagnostics: [{ code: 'E001', severity: 'error', message: 'fail' }],
    });
    const successEntry = makeEntry({ ruleIndex: 1, targetPath: 'output.b' });

    renderTrace([failedEntry, successEntry], true);
    fireEvent.click(screen.getByTestId('status-chip-failed'));

    expect(screen.getByTestId('trace-entry-0')).toBeInTheDocument();
    expect(screen.queryByTestId('trace-entry-1')).not.toBeInTheDocument();
  });

  it('Success filter shows only entries without diagnostics', () => {
    const failedEntry = makeEntry({
      ruleIndex: 0,
      targetPath: 'output.a',
      diagnostics: [{ code: 'E001', severity: 'error', message: 'fail' }],
    });
    const successEntry = makeEntry({ ruleIndex: 1, targetPath: 'output.b' });

    renderTrace([failedEntry, successEntry], true);
    fireEvent.click(screen.getByTestId('status-chip-success'));

    expect(screen.queryByTestId('trace-entry-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-entry-1')).toBeInTheDocument();
  });

  it('chip has aria-pressed=true when active', () => {
    renderTrace([makeEntry()], true);
    const chip = screen.getByTestId('status-chip-failed');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  // -------------------------------------------------------------------------
  // Search input
  // -------------------------------------------------------------------------

  it('search input renders with correct placeholder', () => {
    renderTrace([makeEntry()], true);
    expect(screen.getByTestId('trace-search')).toHaveAttribute(
      'placeholder',
      'Filter by target path…',
    );
  });

  it('search input has aria-label', () => {
    renderTrace([makeEntry()], true);
    expect(screen.getByLabelText('Filter trace entries')).toBeInTheDocument();
  });

  it('search filters by targetPath substring (after debounce)', async () => {
    vi.useFakeTimers();
    renderTrace(
      [makeEntry({ targetPath: 'output.name' }), makeEntry({ ruleIndex: 1, targetPath: 'output.age' })],
      true,
    );

    fireEvent.change(screen.getByTestId('trace-search'), {
      target: { value: 'age' },
    });

    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.queryByTestId('trace-entry-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('trace-entry-1')).toBeInTheDocument();

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Count display
  // -------------------------------------------------------------------------

  it('count display is hidden when no filter is active', () => {
    renderTrace([makeEntry(), makeEntry({ ruleIndex: 1, targetPath: 'output.b' })], true);
    expect(screen.queryByTestId('trace-count')).not.toBeInTheDocument();
  });

  it('count display shows correct numbers when filter is active', () => {
    const failedEntry = makeEntry({
      ruleIndex: 0,
      targetPath: 'output.a',
      diagnostics: [{ code: 'E001', severity: 'error', message: 'fail' }],
    });
    const successEntry = makeEntry({ ruleIndex: 1, targetPath: 'output.b' });

    renderTrace([failedEntry, successEntry], true);
    fireEvent.click(screen.getByTestId('status-chip-failed'));

    const count = screen.getByTestId('trace-count');
    expect(count).toHaveTextContent('1 of 2 trace steps');
  });

  it('shows "no results" message when filter matches nothing', () => {
    renderTrace([makeEntry()], true);
    fireEvent.click(screen.getByTestId('status-chip-failed'));
    expect(screen.getByTestId('trace-no-results')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Failure indicator
  // -------------------------------------------------------------------------

  it('shows failure indicator on entries with diagnostics', () => {
    const failedEntry = makeEntry({
      diagnostics: [{ code: 'E001', severity: 'error', message: 'fail' }],
    });
    renderTrace([failedEntry], true);
    expect(screen.getByTestId('trace-failure-indicator-0')).toBeInTheDocument();
  });

  it('does not show failure indicator on entries without diagnostics', () => {
    renderTrace([makeEntry()], true);
    expect(screen.queryByTestId('trace-failure-indicator-0')).not.toBeInTheDocument();
  });
});
