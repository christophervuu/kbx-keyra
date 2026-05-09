import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TestCase, TestRunResult } from '@/lib/types/domain';
import type { BatchState } from './TestCaseListPanel';
import { TestCaseListPanel } from './TestCaseListPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTestCase(overrides?: Partial<TestCase>): TestCase {
  return {
    id: 'tc-1',
    name: 'My Test Case',
    sourceData: '{"x":1}',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeResult(testCaseId: string, overrides?: Partial<TestRunResult>): TestRunResult {
  return {
    testCaseId,
    status: 'pass',
    errorCount: 0,
    warningCount: 0,
    executedAt: new Date().toISOString(),
    durationMs: 42,
    ...overrides,
  };
}

const idleBatchState: BatchState = { isRunning: false, progress: null, summary: null };

const defaultProps = {
  testCases: [] as readonly TestCase[],
  selectedId: null as string | null,
  runResults: {} as Record<string, TestRunResult>,
  onSelect: vi.fn(),
  onSelectScratchpad: vi.fn(),
  onRename: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onAddNew: vi.fn(),
  onSaveCurrentInput: vi.fn(),
  sourceDataRaw: null as string | null,
  onRunAll: vi.fn(),
  onRerunFailed: vi.fn(),
  onCancel: vi.fn(),
  batchState: idleBatchState,
};

function renderPanel(props?: Partial<typeof defaultProps>) {
  return render(<TestCaseListPanel {...defaultProps} {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestCaseListPanel', () => {
  // -------------------------------------------------------------------------
  // Scratchpad
  // -------------------------------------------------------------------------

  it('always renders the Scratchpad pseudo-entry', () => {
    renderPanel();
    expect(screen.getByTestId('scratchpad-row')).toBeInTheDocument();
    expect(screen.getByText('Scratchpad')).toBeInTheDocument();
  });

  it('Scratchpad row is selected when selectedId is null', () => {
    renderPanel({ selectedId: null });
    expect(screen.getByTestId('scratchpad-row')).toHaveAttribute('aria-selected', 'true');
  });

  it('Scratchpad row is not selected when selectedId is a test case ID', () => {
    const tc = makeTestCase();
    renderPanel({ testCases: [tc], selectedId: tc.id });
    expect(screen.getByTestId('scratchpad-row')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Scratchpad calls onSelectScratchpad', () => {
    const onSelectScratchpad = vi.fn();
    renderPanel({ onSelectScratchpad });
    fireEvent.click(screen.getByTestId('scratchpad-row'));
    expect(onSelectScratchpad).toHaveBeenCalledTimes(1);
  });

  it('pressing Enter on Scratchpad calls onSelectScratchpad', () => {
    const onSelectScratchpad = vi.fn();
    renderPanel({ onSelectScratchpad });
    fireEvent.keyDown(screen.getByTestId('scratchpad-row'), { key: 'Enter' });
    expect(onSelectScratchpad).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('renders empty state when no test cases exist', () => {
    renderPanel({ testCases: [] });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText(/No test cases yet/)).toBeInTheDocument();
  });

  it('does not render empty state when test cases exist', () => {
    renderPanel({ testCases: [makeTestCase()] });
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Test case rows
  // -------------------------------------------------------------------------

  it('renders a row for each test case', () => {
    const cases = [
      makeTestCase({ id: 'tc-1', name: 'First' }),
      makeTestCase({ id: 'tc-2', name: 'Second' }),
    ];
    renderPanel({ testCases: cases });
    expect(screen.getByTestId('test-case-row-tc-1')).toBeInTheDocument();
    expect(screen.getByTestId('test-case-row-tc-2')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('selected row has aria-selected=true', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({ testCases: [tc], selectedId: 'tc-1' });
    expect(screen.getByTestId('test-case-row-tc-1')).toHaveAttribute('aria-selected', 'true');
  });

  it('non-selected row has aria-selected=false', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({ testCases: [tc], selectedId: null });
    expect(screen.getByTestId('test-case-row-tc-1')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a test case name calls onSelect with the test case', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'My Case' });
    const onSelect = vi.fn();
    renderPanel({ testCases: [tc], onSelect });
    fireEvent.click(screen.getByTestId('test-case-name-tc-1'));
    expect(onSelect).toHaveBeenCalledWith(tc);
  });

  // -------------------------------------------------------------------------
  // Status badges
  // -------------------------------------------------------------------------

  it('renders a "Not run" badge when no result exists for a test case', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({ testCases: [tc], runResults: {} });
    expect(screen.getByLabelText('Not run')).toBeInTheDocument();
  });

  it('renders a "Pass" badge when result status is pass', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1', { status: 'pass' }) },
    });
    expect(screen.getByLabelText('Pass')).toBeInTheDocument();
  });

  it('renders a "Fail" badge when result status is fail', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1', { status: 'fail' }) },
    });
    expect(screen.getByLabelText('Fail')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Inline rename
  // -------------------------------------------------------------------------

  it('double-clicking a test case name shows a rename input', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'Original' });
    renderPanel({ testCases: [tc] });
    fireEvent.doubleClick(screen.getByTestId('test-case-name-tc-1'));
    expect(screen.getByTestId('rename-input-tc-1')).toBeInTheDocument();
  });

  it('pressing Enter in rename input calls onRename and hides input', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'Original' });
    const onRename = vi.fn();
    renderPanel({ testCases: [tc], onRename });
    fireEvent.doubleClick(screen.getByTestId('test-case-name-tc-1'));
    const input = screen.getByTestId('rename-input-tc-1');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('tc-1', 'Renamed');
    expect(screen.queryByTestId('rename-input-tc-1')).not.toBeInTheDocument();
  });

  it('pressing Escape in rename input cancels without calling onRename', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'Original' });
    const onRename = vi.fn();
    renderPanel({ testCases: [tc], onRename });
    fireEvent.doubleClick(screen.getByTestId('test-case-name-tc-1'));
    const input = screen.getByTestId('rename-input-tc-1');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rename-input-tc-1')).not.toBeInTheDocument();
  });

  it('blurring rename input cancels without calling onRename', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'Original' });
    const onRename = vi.fn();
    renderPanel({ testCases: [tc], onRename });
    fireEvent.doubleClick(screen.getByTestId('test-case-name-tc-1'));
    const input = screen.getByTestId('rename-input-tc-1');
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rename-input-tc-1')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Duplicate action
  // -------------------------------------------------------------------------

  it('clicking Duplicate calls onDuplicate with the test case ID', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'My Case' });
    const onDuplicate = vi.fn();
    renderPanel({ testCases: [tc], onDuplicate });
    fireEvent.click(screen.getByTestId('duplicate-button-tc-1'));
    expect(onDuplicate).toHaveBeenCalledWith('tc-1');
  });

  // -------------------------------------------------------------------------
  // Delete action
  // -------------------------------------------------------------------------

  it('clicking Delete without run results calls onDelete immediately', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    const onDelete = vi.fn();
    renderPanel({ testCases: [tc], runResults: {}, onDelete });
    fireEvent.click(screen.getByTestId('delete-button-tc-1'));
    expect(onDelete).toHaveBeenCalledWith('tc-1');
  });

  it('clicking Delete with run results shows confirmation prompt', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'My Case' });
    const onDelete = vi.fn();
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1') },
      onDelete,
    });
    fireEvent.click(screen.getByTestId('delete-button-tc-1'));
    expect(screen.getByTestId('delete-confirm-tc-1')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('confirming delete in prompt calls onDelete', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    const onDelete = vi.fn();
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1') },
      onDelete,
    });
    fireEvent.click(screen.getByTestId('delete-button-tc-1'));
    fireEvent.click(screen.getByTestId('delete-confirm-yes-tc-1'));
    expect(onDelete).toHaveBeenCalledWith('tc-1');
  });

  it('cancelling delete in prompt does not call onDelete', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    const onDelete = vi.fn();
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1') },
      onDelete,
    });
    fireEvent.click(screen.getByTestId('delete-button-tc-1'));
    fireEvent.click(screen.getByTestId('delete-confirm-cancel-tc-1'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-confirm-tc-1')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Toolbar slot
  // -------------------------------------------------------------------------

  it('renders toolbarSlot content when provided', () => {
    renderPanel({ toolbarSlot: <button>Run All</button> });
    expect(screen.getByText('Run All')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Add New button (T-04)
  // -------------------------------------------------------------------------

  it('renders Add New button', () => {
    renderPanel();
    expect(screen.getByTestId('add-new-button')).toBeInTheDocument();
  });

  it('clicking Add New calls onAddNew', () => {
    const onAddNew = vi.fn();
    renderPanel({ onAddNew });
    fireEvent.click(screen.getByTestId('add-new-button'));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Save As Test Case button (T-04)
  // -------------------------------------------------------------------------

  it('renders Save As Test Case button', () => {
    renderPanel();
    expect(screen.getByTestId('save-as-button')).toBeInTheDocument();
  });

  it('Save As button is disabled when sourceDataRaw is null', () => {
    renderPanel({ sourceDataRaw: null, selectedId: null });
    expect(screen.getByTestId('save-as-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Save As button is disabled when sourceDataRaw is empty string', () => {
    renderPanel({ sourceDataRaw: '', selectedId: null });
    expect(screen.getByTestId('save-as-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Save As button is disabled when a saved test case is selected (not scratchpad)', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({ testCases: [tc], selectedId: 'tc-1', sourceDataRaw: '{"x":1}' });
    expect(screen.getByTestId('save-as-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Save As button is enabled in scratchpad mode with non-empty source data', () => {
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}' });
    expect(screen.getByTestId('save-as-button')).toHaveAttribute('aria-disabled', 'false');
  });

  it('clicking Save As shows inline name input', () => {
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}' });
    fireEvent.click(screen.getByTestId('save-as-button'));
    expect(screen.getByTestId('save-as-form')).toBeInTheDocument();
    expect(screen.getByTestId('save-as-name-input')).toBeInTheDocument();
  });

  it('Save As confirm button calls onSaveCurrentInput with trimmed name', () => {
    const onSaveCurrentInput = vi.fn();
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}', onSaveCurrentInput });
    fireEvent.click(screen.getByTestId('save-as-button'));
    fireEvent.change(screen.getByTestId('save-as-name-input'), { target: { value: 'My Scenario' } });
    fireEvent.click(screen.getByTestId('save-as-confirm-button'));
    expect(onSaveCurrentInput).toHaveBeenCalledWith('My Scenario');
    expect(screen.queryByTestId('save-as-form')).not.toBeInTheDocument();
  });

  it('pressing Enter in Save As input calls onSaveCurrentInput', () => {
    const onSaveCurrentInput = vi.fn();
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}', onSaveCurrentInput });
    fireEvent.click(screen.getByTestId('save-as-button'));
    const input = screen.getByTestId('save-as-name-input');
    fireEvent.change(input, { target: { value: 'Scenario A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSaveCurrentInput).toHaveBeenCalledWith('Scenario A');
  });

  it('pressing Escape in Save As input cancels without calling onSaveCurrentInput', () => {
    const onSaveCurrentInput = vi.fn();
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}', onSaveCurrentInput });
    fireEvent.click(screen.getByTestId('save-as-button'));
    const input = screen.getByTestId('save-as-name-input');
    fireEvent.change(input, { target: { value: 'Scenario A' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSaveCurrentInput).not.toHaveBeenCalled();
    expect(screen.queryByTestId('save-as-form')).not.toBeInTheDocument();
  });

  it('clicking cancel in Save As form dismisses without calling onSaveCurrentInput', () => {
    const onSaveCurrentInput = vi.fn();
    renderPanel({ selectedId: null, sourceDataRaw: '{"x":1}', onSaveCurrentInput });
    fireEvent.click(screen.getByTestId('save-as-button'));
    fireEvent.click(screen.getByTestId('save-as-cancel-button'));
    expect(onSaveCurrentInput).not.toHaveBeenCalled();
    expect(screen.queryByTestId('save-as-form')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Run All / Rerun Failed (T-06)
  // -------------------------------------------------------------------------

  it('renders Run All button in idle state', () => {
    renderPanel();
    expect(screen.getByTestId('run-all-button')).toBeInTheDocument();
  });

  it('Run All button is disabled when no test cases exist', () => {
    renderPanel({ testCases: [] });
    expect(screen.getByTestId('run-all-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Run All button is enabled when test cases exist and not running', () => {
    renderPanel({ testCases: [makeTestCase()], batchState: idleBatchState });
    expect(screen.getByTestId('run-all-button')).toHaveAttribute('aria-disabled', 'false');
  });

  it('Run All button is disabled when batch is running', () => {
    renderPanel({
      testCases: [makeTestCase()],
      batchState: { isRunning: true, progress: { current: 1, total: 1 }, summary: null },
    });
    expect(screen.queryByTestId('run-all-button')).not.toBeInTheDocument();
  });

  it('clicking Run All calls onRunAll', () => {
    const onRunAll = vi.fn();
    renderPanel({ testCases: [makeTestCase()], onRunAll });
    fireEvent.click(screen.getByTestId('run-all-button'));
    expect(onRunAll).toHaveBeenCalledTimes(1);
  });

  it('renders Rerun Failed button in idle state', () => {
    renderPanel();
    expect(screen.getByTestId('rerun-failed-button')).toBeInTheDocument();
  });

  it('Rerun Failed button is disabled when no failed cases', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1', { status: 'pass' }) },
    });
    expect(screen.getByTestId('rerun-failed-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('Rerun Failed button is enabled when there are failed cases', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1', { status: 'fail' }) },
    });
    expect(screen.getByTestId('rerun-failed-button')).toHaveAttribute('aria-disabled', 'false');
  });

  it('clicking Rerun Failed calls onRerunFailed', () => {
    const tc = makeTestCase({ id: 'tc-1' });
    const onRerunFailed = vi.fn();
    renderPanel({
      testCases: [tc],
      runResults: { 'tc-1': makeResult('tc-1', { status: 'fail' }) },
      onRerunFailed,
    });
    fireEvent.click(screen.getByTestId('rerun-failed-button'));
    expect(onRerunFailed).toHaveBeenCalledTimes(1);
  });

  it('shows progress indicator when batch is running', () => {
    renderPanel({
      batchState: { isRunning: true, progress: { current: 2, total: 5 }, summary: null },
    });
    expect(screen.getByTestId('batch-progress')).toBeInTheDocument();
    expect(screen.getByText('Running 2/5…')).toBeInTheDocument();
  });

  it('shows Cancel button during batch execution', () => {
    renderPanel({
      batchState: { isRunning: true, progress: { current: 1, total: 3 }, summary: null },
    });
    expect(screen.getByTestId('cancel-batch-button')).toBeInTheDocument();
  });

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    renderPanel({
      batchState: { isRunning: true, progress: { current: 1, total: 3 }, summary: null },
      onCancel,
    });
    fireEvent.click(screen.getByTestId('cancel-batch-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows batch summary after completion', () => {
    renderPanel({
      batchState: { isRunning: false, progress: null, summary: { passed: 3, failed: 1 } },
    });
    expect(screen.getByTestId('batch-summary')).toBeInTheDocument();
    expect(screen.getByText('3 passed')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('list has role=listbox', () => {
    renderPanel();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('duplicate button has aria-label', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'My Case' });
    renderPanel({ testCases: [tc] });
    expect(screen.getByLabelText('Duplicate My Case')).toBeInTheDocument();
  });

  it('delete button has aria-label', () => {
    const tc = makeTestCase({ id: 'tc-1', name: 'My Case' });
    renderPanel({ testCases: [tc] });
    expect(screen.getByLabelText('Delete My Case')).toBeInTheDocument();
  });
});
