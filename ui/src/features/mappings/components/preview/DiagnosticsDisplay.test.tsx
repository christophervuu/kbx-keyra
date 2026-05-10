import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

import { DiagnosticsDisplay } from './DiagnosticsDisplay';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { ExecutionResult, Diagnostic, TraceEntry } from '@keyra/engine';
import type { DebugSelection, FailureExplanation } from '@/features/mappings/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(diagnostics: Diagnostic[]): ExecutionResult {
  return {
    output: {},
    diagnostics,
    trace: [],
    stats: { durationMs: 5, rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0 },
  } as unknown as ExecutionResult;
}

function renderState(
  state: PreviewExecutionState,
  extra?: Partial<React.ComponentProps<typeof DiagnosticsDisplay>>,
) {
  return render(createElement(DiagnosticsDisplay, { state, ...extra }));
}

const errorDiag: Diagnostic = {
  code: 'KEYRA-E030',
  severity: 'error',
  message: "Path 'source.missing' not found",
  ruleIndex: 0,
  targetPath: 'output.value',
  expression: 'source.missing',
};

const warningDiag: Diagnostic = {
  code: 'KEYRA-W006',
  severity: 'warning',
  message: 'Duplicate target path detected',
  ruleIndex: 1,
  targetPath: 'output.name',
};

const infoDiag: Diagnostic = {
  code: 'KEYRA-I001',
  severity: 'info',
  message: 'Optional field omitted',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiagnosticsDisplay', () => {
  // -------------------------------------------------------------------------
  // Existing state-variant tests (backward-compatible)
  // -------------------------------------------------------------------------

  it('idle: shows "Run a mapping to see diagnostics"', () => {
    renderState({ status: 'idle' });
    expect(screen.getByTestId('diagnostics-idle')).toBeInTheDocument();
    expect(screen.getByText('Run a mapping to see diagnostics')).toBeInTheDocument();
  });

  it('executing: shows executing placeholder', () => {
    renderState({ status: 'executing' });
    expect(screen.getByTestId('diagnostics-executing')).toBeInTheDocument();
  });

  it('timeout: shows timeout message', () => {
    renderState({ status: 'timeout' });
    expect(screen.getByTestId('diagnostics-timeout')).toBeInTheDocument();
    expect(screen.getByText(/Execution timed out/)).toBeInTheDocument();
  });

  it('error: shows error message', () => {
    renderState({ status: 'error', error: 'Engine threw' });
    expect(screen.getByTestId('diagnostics-error')).toBeInTheDocument();
    expect(screen.getByText(/Execution failed/)).toBeInTheDocument();
  });

  it('success with no diagnostics: shows "No issues found"', () => {
    renderState({ status: 'success', result: makeResult([]) });
    expect(screen.getByTestId('diagnostics-empty')).toBeInTheDocument();
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('success with diagnostics: renders list items', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    expect(screen.getByTestId('diagnostics-list')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-2')).toBeInTheDocument();
  });

  it('error diagnostic: icon labeled Error, message in red', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });

    const icon = screen.getByRole('img', { name: 'Error' });
    expect(icon.className).toContain('text-red-400');

    const message = screen.getByText(errorDiag.message);
    expect(message.className).toContain('text-red-400');
  });

  it('warning diagnostic: icon labeled Warning, message in amber', () => {
    renderState({ status: 'success', result: makeResult([warningDiag]) });

    const icon = screen.getByRole('img', { name: 'Warning' });
    expect(icon.className).toContain('text-amber-400');

    const message = screen.getByText(warningDiag.message);
    expect(message.className).toContain('text-amber-400');
  });

  it('info diagnostic: icon labeled Info, message in blue', () => {
    renderState({ status: 'success', result: makeResult([infoDiag]) });

    const icon = screen.getByRole('img', { name: 'Info' });
    expect(icon.className).toContain('text-blue-400');
  });

  it('shows targetPath when present', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('diagnostic-path-0')).toHaveTextContent('output.value');
  });

  it('shows expression when present', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('diagnostic-expression-0')).toHaveTextContent('source.missing');
  });

  it('does not show path element when targetPath is absent', () => {
    renderState({ status: 'success', result: makeResult([infoDiag]) });
    expect(screen.queryByTestId('diagnostic-path-0')).not.toBeInTheDocument();
  });

  it('list container has overflow-auto for scrollable output', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    // The inner scroll div (not the outer flex container) carries overflow-auto
    const container = screen.getByTestId('diagnostics-list-container');
    // The scroll div is a child of the container
    const scrollDiv = container.querySelector('.overflow-auto');
    expect(scrollDiv).not.toBeNull();
  });

  it('list has accessible aria-label with count', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    const list = screen.getByRole('list', { name: '2 diagnostics' });
    expect(list).toBeInTheDocument();
  });

  it('singular aria-label for one diagnostic', () => {
    renderState({ status: 'success', result: makeResult([warningDiag]) });
    expect(screen.getByRole('list', { name: '1 diagnostic' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Click-to-select (onSelect)
  // -------------------------------------------------------------------------

  it('clicking a diagnostic row fires onSelect with correct DebugSelection', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { onSelect },
    );

    fireEvent.click(screen.getByTestId('diagnostic-item-0'));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({
      targetPath: 'output.value',
      ruleIndex: 0,
      source: 'diagnostics',
    });
  });

  it('keyboard Enter on a diagnostic row fires onSelect', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { onSelect },
    );

    fireEvent.keyDown(screen.getByTestId('diagnostic-item-0'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('keyboard Space on a diagnostic row fires onSelect', () => {
    const onSelect = vi.fn<[DebugSelection], void>();
    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { onSelect },
    );

    fireEvent.keyDown(screen.getByTestId('diagnostic-item-0'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('diagnostic row has role=button and tabIndex=0 when onSelect is provided', () => {
    const onSelect = vi.fn();
    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { onSelect },
    );

    const item = screen.getByTestId('diagnostic-item-0');
    expect(item).toHaveAttribute('role', 'button');
    expect(item).toHaveAttribute('tabindex', '0');
  });

  it('does not fire onSelect when prop is absent', () => {
    // Should render without errors and have no role=button
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    const item = screen.getByTestId('diagnostic-item-0');
    expect(item).not.toHaveAttribute('role', 'button');
  });

  // -------------------------------------------------------------------------
  // Highlight state
  // -------------------------------------------------------------------------

  it('row matching selectedTargetPath renders highlight class', () => {
    renderState(
      { status: 'success', result: makeResult([errorDiag, warningDiag]) },
      { selectedTargetPath: 'output.value', onSelect: vi.fn() },
    );

    const highlighted = screen.getByTestId('diagnostic-item-0');
    expect(highlighted.className).toContain('bg-blue-500/15');

    const notHighlighted = screen.getByTestId('diagnostic-item-1');
    expect(notHighlighted.className).not.toContain('bg-blue-500/15');
  });

  it('row matching selectedRuleIndex renders highlight class', () => {
    renderState(
      { status: 'success', result: makeResult([errorDiag, warningDiag]) },
      { selectedRuleIndex: 1, onSelect: vi.fn() },
    );

    const highlighted = screen.getByTestId('diagnostic-item-1');
    expect(highlighted.className).toContain('bg-blue-500/15');

    const notHighlighted = screen.getByTestId('diagnostic-item-0');
    expect(notHighlighted.className).not.toContain('bg-blue-500/15');
  });

  it('row has aria-pressed=true when selected', () => {
    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { selectedTargetPath: 'output.value', onSelect: vi.fn() },
    );

    expect(screen.getByTestId('diagnostic-item-0')).toHaveAttribute('aria-pressed', 'true');
  });

  // -------------------------------------------------------------------------
  // Severity filter chips
  // -------------------------------------------------------------------------

  it('severity chips render for Error, Warning, Info', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('severity-chip-error')).toBeInTheDocument();
    expect(screen.getByTestId('severity-chip-warning')).toBeInTheDocument();
    expect(screen.getByTestId('severity-chip-info')).toBeInTheDocument();
  });

  it('toggling Error chip shows only error diagnostics', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-error'));

    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-item-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-item-2')).not.toBeInTheDocument();
  });

  it('toggling Warning chip shows only warning diagnostics', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-warning'));

    expect(screen.queryByTestId('diagnostic-item-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-item-2')).not.toBeInTheDocument();
  });

  it('toggling multiple chips applies AND filter (shows both matched severities)', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-error'));
    fireEvent.click(screen.getByTestId('severity-chip-warning'));

    // Both error and warning should be visible; info should not
    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-item-2')).not.toBeInTheDocument();
  });

  it('toggling a chip off restores its entries', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-error'));
    expect(screen.queryByTestId('diagnostic-item-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('severity-chip-error'));
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();
  });

  it('chip has aria-pressed=true when active', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    const chip = screen.getByTestId('severity-chip-error');
    expect(chip).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  // -------------------------------------------------------------------------
  // Search input
  // -------------------------------------------------------------------------

  it('search input renders with correct placeholder', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('diagnostics-search')).toHaveAttribute(
      'placeholder',
      'Filter by path or message…',
    );
  });

  it('search input has aria-label', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByLabelText('Filter diagnostics')).toBeInTheDocument();
  });

  it('search filters by targetPath substring (after debounce)', async () => {
    vi.useFakeTimers();
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    fireEvent.change(screen.getByTestId('diagnostics-search'), {
      target: { value: 'output.value' },
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-item-1')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('search filters by message substring (after debounce)', async () => {
    vi.useFakeTimers();
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    fireEvent.change(screen.getByTestId('diagnostics-search'), {
      target: { value: 'Duplicate' },
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByTestId('diagnostic-item-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('clearing search restores full list', async () => {
    vi.useFakeTimers();
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    const input = screen.getByTestId('diagnostics-search');
    fireEvent.change(input, { target: { value: 'output.value' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    fireEvent.change(input, { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(250); });

    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Count display
  // -------------------------------------------------------------------------

  it('count display is hidden when no filter is active', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });
    expect(screen.queryByTestId('diagnostics-count')).not.toBeInTheDocument();
  });

  it('count display shows correct numbers when severity filter is active', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-error'));

    const count = screen.getByTestId('diagnostics-count');
    expect(count).toHaveTextContent('1 of 3 diagnostics');
  });

  it('shows "no results" message when filter matches nothing', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    fireEvent.click(screen.getByTestId('severity-chip-info'));

    expect(screen.getByTestId('diagnostics-no-results')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Failure explanation slot
  // -------------------------------------------------------------------------

  it('renders explanation when explainDiagnostic returns non-null', () => {
    const explanation: FailureExplanation = {
      summary: 'The source path does not exist in the input.',
      suggestion: 'Check that the input object has a "missing" key.',
    };
    const explainDiagnostic = vi.fn().mockReturnValue(explanation);

    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { explainDiagnostic },
    );

    expect(screen.getByTestId('diagnostic-explanation-0')).toBeInTheDocument();
    expect(screen.getByText(explanation.summary)).toBeInTheDocument();
    expect(screen.getByText(explanation.suggestion!)).toBeInTheDocument();
  });

  it('does not render explanation when explainDiagnostic returns null', () => {
    const explainDiagnostic = vi.fn().mockReturnValue(null);

    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { explainDiagnostic },
    );

    expect(screen.queryByTestId('diagnostic-explanation-0')).not.toBeInTheDocument();
  });

  it('does not render explanation when explainDiagnostic prop is absent', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.queryByTestId('diagnostic-explanation-0')).not.toBeInTheDocument();
  });

  it('passes matching traceEntry to explainDiagnostic', () => {
    const traceEntry: TraceEntry = {
      ruleIndex: 0,
      targetPath: 'output.value',
      expression: 'source.missing',
      inputValue: {},
      outputValue: null,
    };
    const explainDiagnostic = vi.fn().mockReturnValue(null);

    renderState(
      { status: 'success', result: makeResult([errorDiag]) },
      { explainDiagnostic, traceEntries: [traceEntry] },
    );

    expect(explainDiagnostic).toHaveBeenCalledWith(errorDiag, traceEntry);
  });
});
