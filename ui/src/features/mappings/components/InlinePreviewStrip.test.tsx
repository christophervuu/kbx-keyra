import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { InlinePreviewStrip } from './InlinePreviewStrip';
import type { InlinePreviewStripProps } from './InlinePreviewStrip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: InlinePreviewStripProps = {
  sourceData: '',
  onSourceDataChange: vi.fn(),
  onRun: vi.fn(),
  output: null,
  isRunning: false,
  status: null,
  testingPageUrl: '/projects/p1/mappings/m1/test',
  isCollapsed: false,
  onToggleCollapse: vi.fn(),
  lastApplyTimestamp: null,
};

function renderStrip(overrides: Partial<InlinePreviewStripProps> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(
    <MemoryRouter>
      <InlinePreviewStrip {...props} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InlinePreviewStrip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Toolbar row
  // ---------------------------------------------------------------------------

  it('renders toolbar row with PREVIEW label', () => {
    renderStrip();
    const toolbar = screen.getByTestId('strip-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveTextContent('Preview');
  });

  it('renders Run button in toolbar', () => {
    renderStrip();
    expect(screen.getByTestId('strip-run-button')).toBeInTheDocument();
  });

  it('renders collapse toggle in toolbar', () => {
    renderStrip();
    expect(screen.getByTestId('strip-collapse-toggle')).toBeInTheDocument();
  });

  it('renders Auto-run toggle in toolbar', () => {
    renderStrip();
    expect(screen.getByTestId('strip-autorun-toggle')).toBeInTheDocument();
  });

  it('renders Test Lab link in toolbar', () => {
    renderStrip({ testingPageUrl: '/projects/p1/mappings/m1/test-lab' });
    const link = screen.getByTestId('strip-test-lab-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/projects/p1/mappings/m1/test-lab');
  });

  it('renders condensed controls in requested order', () => {
    renderStrip({ sourceData: '{"a":1}' });

    const run = screen.getByTestId('strip-run-button');
    const auto = screen.getByTestId('strip-autorun-toggle');
    const picker = screen.getByTestId('strip-test-case-selector');
    const save = screen.getByTestId('strip-save-testcase-button');
    const runInfo = screen.getByTestId('strip-status-bar');
    const testLab = screen.getByTestId('strip-test-lab-link');

    expect(run.compareDocumentPosition(auto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(auto.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(picker.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.compareDocumentPosition(runInfo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(runInfo.compareDocumentPosition(testLab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Auto-run toggle
  // ---------------------------------------------------------------------------

  it('Auto-run toggle shows green dot when autoRun is true', () => {
    renderStrip({ autoRun: true });
    const toggle = screen.getByTestId('strip-autorun-toggle');
    // The dot span inside should have bg-green-400
    const dot = toggle.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-green-400');
  });

  it('Auto-run toggle shows gray dot when autoRun is false', () => {
    renderStrip({ autoRun: false });
    const toggle = screen.getByTestId('strip-autorun-toggle');
    const dot = toggle.querySelector('span[aria-hidden]');
    expect(dot?.className).toContain('bg-slate-600');
  });

  it('Auto-run toggle has aria-checked=true when autoRun is true', () => {
    renderStrip({ autoRun: true });
    expect(screen.getByTestId('strip-autorun-toggle')).toHaveAttribute('aria-checked', 'true');
  });

  it('Auto-run toggle has aria-checked=false when autoRun is false', () => {
    renderStrip({ autoRun: false });
    expect(screen.getByTestId('strip-autorun-toggle')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Auto-run toggle fires onAutoRunChange with opposite value (true→false)', () => {
    const onAutoRunChange = vi.fn();
    renderStrip({ autoRun: true, onAutoRunChange });
    fireEvent.click(screen.getByTestId('strip-autorun-toggle'));
    expect(onAutoRunChange).toHaveBeenCalledWith(false);
  });

  it('clicking Auto-run toggle fires onAutoRunChange with opposite value (false→true)', () => {
    const onAutoRunChange = vi.fn();
    renderStrip({ autoRun: false, onAutoRunChange });
    fireEvent.click(screen.getByTestId('strip-autorun-toggle'));
    expect(onAutoRunChange).toHaveBeenCalledWith(true);
  });

  // ---------------------------------------------------------------------------
  // Save as test case button and modal
  // ---------------------------------------------------------------------------

  it('renders Save button in toolbar', () => {
    renderStrip({ sourceData: '{"a":1}' });
    expect(screen.getByTestId('strip-save-testcase-button')).toBeInTheDocument();
  });

  it('Save button is disabled when sourceData is empty', () => {
    renderStrip({ sourceData: '' });
    expect(screen.getByTestId('strip-save-testcase-button')).toBeDisabled();
  });

  it('Save button is enabled when sourceData is non-empty', () => {
    renderStrip({ sourceData: '{"a":1}' });
    expect(screen.getByTestId('strip-save-testcase-button')).not.toBeDisabled();
  });

  it('clicking Save button opens modal', () => {
    renderStrip({ sourceData: '{"a":1}' });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    expect(screen.getByTestId('save-testcase-modal')).toBeInTheDocument();
  });

  it('modal has role=dialog and aria-modal', () => {
    renderStrip({ sourceData: '{"a":1}' });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('modal name input is pre-filled with "Test case 1" when no existing test cases', () => {
    renderStrip({ sourceData: '{"a":1}', testCases: [] });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    const nameInput = screen.getByTestId('save-testcase-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Test case 1');
  });

  it('modal name input is pre-filled with "Test case 3" when 2 existing test cases', () => {
    const testCases = [
      { id: 'tc-1', name: 'A', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'tc-2', name: 'B', sourceData: '{}', createdAt: '2024-01-02T00:00:00Z' },
    ];
    renderStrip({ sourceData: '{"a":1}', testCases });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    const nameInput = screen.getByTestId('save-testcase-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Test case 3');
  });

  it('Cancel button closes modal without calling onSaveTestCase', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    fireEvent.click(screen.getByTestId('save-testcase-cancel'));
    expect(screen.queryByTestId('save-testcase-modal')).not.toBeInTheDocument();
    expect(onSaveTestCase).not.toHaveBeenCalled();
  });

  it('clicking backdrop closes modal without calling onSaveTestCase', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    fireEvent.click(screen.getByTestId('save-testcase-backdrop'));
    expect(screen.queryByTestId('save-testcase-modal')).not.toBeInTheDocument();
    expect(onSaveTestCase).not.toHaveBeenCalled();
  });

  it('submitting modal calls onSaveTestCase with name and sourceData', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    const nameInput = screen.getByTestId('save-testcase-name-input');
    fireEvent.change(nameInput, { target: { value: 'My test' } });
    fireEvent.click(screen.getByTestId('save-testcase-confirm'));
    expect(onSaveTestCase).toHaveBeenCalledWith({
      name: 'My test',
      sourceData: '{"a":1}',
    });
  });

  it('submitting with expected output checked includes expectedOutput', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', output: { result: 'ok' }, onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    fireEvent.click(screen.getByTestId('save-testcase-expected-checkbox'));
    fireEvent.click(screen.getByTestId('save-testcase-confirm'));
    expect(onSaveTestCase).toHaveBeenCalledWith({
      name: expect.any(String),
      sourceData: '{"a":1}',
      expectedOutput: { result: 'ok' },
    });
  });

  it('"Set as expected output" checkbox is disabled when output is null', () => {
    renderStrip({ sourceData: '{"a":1}', output: null });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    expect(screen.getByTestId('save-testcase-expected-checkbox')).toBeDisabled();
  });

  it('modal closes after successful save', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    fireEvent.click(screen.getByTestId('save-testcase-confirm'));
    expect(screen.queryByTestId('save-testcase-modal')).not.toBeInTheDocument();
  });

  it('Save button shows "Saved ✓" feedback after successful save', () => {
    const onSaveTestCase = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onSaveTestCase });
    fireEvent.click(screen.getByTestId('strip-save-testcase-button'));
    fireEvent.click(screen.getByTestId('save-testcase-confirm'));
    expect(screen.getByTestId('strip-save-testcase-button')).toHaveTextContent('Saved ✓');
  });

  // ---------------------------------------------------------------------------
  // Status bar — six states
  // ---------------------------------------------------------------------------

  it('status bar shows Idle state when sourceData is empty', () => {
    renderStrip({ sourceData: '', status: null, isRunning: false });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('Paste source JSON and click Run');
  });

  it('status bar shows Ready state when sourceData is non-empty and no run yet', () => {
    renderStrip({ sourceData: '{"a":1}', status: null, isRunning: false });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('Ready — click Run or enable Auto-run');
  });

  it('status bar shows Running state when isRunning is true', () => {
    renderStrip({ sourceData: '{"a":1}', isRunning: true, status: null });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('Evaluating');
  });

  it('status bar shows Success state when status has no errors or warnings', () => {
    renderStrip({
      sourceData: '{"a":1}',
      isRunning: false,
      status: { errors: 0, warnings: 0 },
      ruleCount: 5,
      durationMs: 12,
    });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('5 rules evaluated');
    expect(bar).toHaveTextContent('0 errors');
    expect(bar).toHaveTextContent('0 warnings');
    expect(bar).toHaveTextContent('12ms');
  });

  it('status bar shows Success with warnings state', () => {
    renderStrip({
      sourceData: '{"a":1}',
      isRunning: false,
      status: { errors: 0, warnings: 3 },
      ruleCount: 5,
    });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('5 rules evaluated');
    expect(bar).toHaveTextContent('3 warnings');
  });

  it('status bar shows Error state text', () => {
    renderStrip({
      sourceData: '{"a":1}',
      isRunning: false,
      status: { errors: 2, warnings: 1 },
      testingPageUrl: '/projects/p1/mappings/m1/test-lab',
    });
    const bar = screen.getByTestId('strip-status-bar');
    expect(bar).toHaveTextContent('2 errors');
    expect(bar).toHaveTextContent('1 warning');
  });

  // ---------------------------------------------------------------------------
  // Three panes
  // ---------------------------------------------------------------------------

  it('renders source pane', () => {
    renderStrip();
    expect(screen.getByTestId('strip-source-pane')).toBeInTheDocument();
  });

  it('renders output pane', () => {
    renderStrip();
    expect(screen.getByTestId('strip-output-pane')).toBeInTheDocument();
  });

  it('renders diagnostics pane', () => {
    renderStrip();
    expect(screen.getByTestId('strip-diagnostics-pane')).toBeInTheDocument();
  });

  it('source pane contains source input', () => {
    renderStrip();
    expect(screen.getByTestId('strip-source-input')).toBeInTheDocument();
  });

  it('output pane contains output area', () => {
    renderStrip();
    expect(screen.getByTestId('strip-output')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Output pane placeholder
  // ---------------------------------------------------------------------------

  it('output pane shows placeholder when output is null', () => {
    renderStrip({ output: null, isRunning: false });
    expect(screen.getByTestId('strip-output')).toHaveTextContent(
      'No output yet — run the mapping to see results',
    );
  });

  it('output pane shows Running… when isRunning is true and output is null', () => {
    renderStrip({ output: null, isRunning: true });
    expect(screen.getByTestId('strip-output')).toHaveTextContent('Running…');
  });

  it('output pane shows formatted output when output is provided', () => {
    renderStrip({ output: { name: 'Alice' } });
    expect(screen.getByTestId('strip-output')).toHaveTextContent('"name"');
  });

  it('output pane does not have line-clamp class', () => {
    renderStrip({ output: { name: 'Alice' } });
    const outputEl = screen.getByTestId('strip-output');
    expect(outputEl.className).not.toContain('line-clamp');
  });

  // ---------------------------------------------------------------------------
  // Format button
  // ---------------------------------------------------------------------------

  it('Format button renders in source pane header', () => {
    renderStrip();
    expect(screen.getByTestId('strip-format-button')).toBeInTheDocument();
  });

  it('Format button with valid JSON calls onSourceDataChange with pretty-printed JSON', () => {
    const onSourceDataChange = vi.fn();
    renderStrip({ sourceData: '{"a":1,"b":2}', onSourceDataChange });
    fireEvent.click(screen.getByTestId('strip-format-button'));
    expect(onSourceDataChange).toHaveBeenCalledWith(
      JSON.stringify({ a: 1, b: 2 }, null, 2),
    );
  });

  it('Format button with invalid JSON does NOT call onSourceDataChange', () => {
    const onSourceDataChange = vi.fn();
    renderStrip({ sourceData: 'not valid json', onSourceDataChange });
    fireEvent.click(screen.getByTestId('strip-format-button'));
    expect(onSourceDataChange).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Copy button
  // ---------------------------------------------------------------------------

  it('Copy button renders in output pane header', () => {
    renderStrip();
    expect(screen.getByTestId('strip-copy-button')).toBeInTheDocument();
  });

  it('Copy button is disabled when output is null', () => {
    renderStrip({ output: null });
    expect(screen.getByTestId('strip-copy-button')).toBeDisabled();
  });

  it('Copy button is enabled when output is provided', () => {
    renderStrip({ output: { result: 'ok' } });
    expect(screen.getByTestId('strip-copy-button')).not.toBeDisabled();
  });

  it('Copy button calls navigator.clipboard.writeText with output text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderStrip({ output: { result: 'ok' } });
    fireEvent.click(screen.getByTestId('strip-copy-button'));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify({ result: 'ok' }, null, 2));
  });

  it('Copy button shows "Copied ✓" after successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderStrip({ output: { result: 'ok' } });
    fireEvent.click(screen.getByTestId('strip-copy-button'));
    // Wait for the promise to resolve
    await Promise.resolve();
    expect(screen.getByTestId('strip-copy-button')).toHaveTextContent('Copied ✓');
  });

  it('Copy button shows "Copy failed" after clipboard error', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    renderStrip({ output: { result: 'ok' } });
    fireEvent.click(screen.getByTestId('strip-copy-button'));
    await Promise.resolve();
    // Need one more tick for the rejection handler
    await Promise.resolve();
    expect(screen.getByTestId('strip-copy-button')).toHaveTextContent('Copy failed');
  });

  it('diagnostics pane shows placeholder when diagnostics is empty', () => {
    renderStrip({ diagnostics: [] });
    expect(screen.getByTestId('strip-diagnostics-placeholder')).toHaveTextContent(
      'Run to see diagnostics.',
    );
  });

  it('diagnostics pane shows placeholder when diagnostics is undefined', () => {
    renderStrip({ diagnostics: undefined });
    expect(screen.getByTestId('strip-diagnostics-placeholder')).toHaveTextContent(
      'Run to see diagnostics.',
    );
  });

  it('diagnostics pane renders entries when diagnostics are present', () => {
    renderStrip({
      diagnostics: [
        {
          severity: 'error',
          code: 'E001',
          message: 'Invalid source path',
          ruleName: 'patient.name.given',
          ruleIndex: 0,
        },
      ],
    });
    expect(screen.queryByTestId('strip-diagnostics-placeholder')).not.toBeInTheDocument();
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.getByText('Invalid source path')).toBeInTheDocument();
  });

  it('each diagnostic entry has data-testid="diagnostic-entry-{index}"', () => {
    renderStrip({
      diagnostics: [
        { severity: 'error', code: 'E001', message: 'Msg 1', ruleName: 'rule.a', ruleIndex: 0 },
        { severity: 'warning', code: 'W002', message: 'Msg 2', ruleName: 'rule.b', ruleIndex: 1 },
      ],
    });
    expect(screen.getByTestId('diagnostic-entry-0')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-entry-1')).toBeInTheDocument();
  });

  it('diagnostic entry shows severity icon, code, message, and ruleName', () => {
    renderStrip({
      diagnostics: [
        {
          severity: 'error',
          code: 'E001',
          message: 'Invalid source path',
          ruleName: 'patient.name.given',
          ruleIndex: 2,
        },
      ],
    });
    const entry = screen.getByTestId('diagnostic-entry-0');
    expect(entry).toHaveTextContent('E001');
    expect(entry).toHaveTextContent('Invalid source path');
    expect(entry).toHaveTextContent('patient.name.given');
  });

  it('clicking a diagnostic entry calls onNavigateToRule with the correct ruleIndex', () => {
    const onNavigateToRule = vi.fn();
    renderStrip({
      onNavigateToRule,
      diagnostics: [
        { severity: 'error', code: 'E001', message: 'Msg', ruleName: 'rule.a', ruleIndex: 3 },
      ],
    });
    fireEvent.click(screen.getByTestId('diagnostic-entry-0'));
    expect(onNavigateToRule).toHaveBeenCalledWith(3);
  });

  it('diagnostic entries are keyboard-accessible (button elements)', () => {
    renderStrip({
      diagnostics: [
        { severity: 'warning', code: 'W001', message: 'Msg', ruleName: 'rule.b', ruleIndex: 0 },
      ],
    });
    const entry = screen.getByTestId('diagnostic-entry-0');
    expect(entry.tagName).toBe('BUTTON');
  });

  it('count badge shows correct number when diagnostics are present', () => {
    renderStrip({
      diagnostics: [
        { severity: 'error', code: 'E001', message: 'A', ruleName: 'r1', ruleIndex: 0 },
        { severity: 'warning', code: 'W001', message: 'B', ruleName: 'r2', ruleIndex: 1 },
        { severity: 'info', code: 'I001', message: 'C', ruleName: 'r3', ruleIndex: 2 },
      ],
    });
    expect(screen.getByTestId('diagnostics-count')).toHaveTextContent('3');
  });

  it('count badge is not rendered when diagnostics is empty', () => {
    renderStrip({ diagnostics: [] });
    expect(screen.queryByTestId('diagnostics-count')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Run button
  // ---------------------------------------------------------------------------

  it('Run button calls onRun when sourceData is non-empty', () => {
    const onRun = vi.fn();
    renderStrip({ sourceData: '{"a":1}', onRun });
    fireEvent.click(screen.getByTestId('strip-run-button'));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('Run button is disabled when sourceData is empty', () => {
    renderStrip({ sourceData: '' });
    expect(screen.getByTestId('strip-run-button')).toBeDisabled();
  });

  it('Run button is disabled when isRunning is true', () => {
    renderStrip({ sourceData: '{"a":1}', isRunning: true });
    expect(screen.getByTestId('strip-run-button')).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Collapse / expand
  // ---------------------------------------------------------------------------

  it('renders expanded strip by default', () => {
    renderStrip({ isCollapsed: false });
    expect(screen.getByTestId('inline-preview-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-preview-strip-collapsed')).not.toBeInTheDocument();
  });

  it('renders collapsed bar when isCollapsed is true', () => {
    renderStrip({ isCollapsed: true });
    expect(screen.getByTestId('inline-preview-strip-collapsed')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-preview-strip')).not.toBeInTheDocument();
  });

  it('collapse toggle calls onToggleCollapse', () => {
    const onToggleCollapse = vi.fn();
    renderStrip({ isCollapsed: false, onToggleCollapse });
    fireEvent.click(screen.getByTestId('strip-collapse-toggle'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('expand toggle calls onToggleCollapse when collapsed', () => {
    const onToggleCollapse = vi.fn();
    renderStrip({ isCollapsed: true, onToggleCollapse });
    fireEvent.click(screen.getByTestId('strip-expand-toggle'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('collapsed bar shows status summary', () => {
    renderStrip({ isCollapsed: true, status: { errors: 1, warnings: 0 } });
    expect(screen.getByTestId('strip-status')).toHaveTextContent('1 error');
  });

  it('collapsed bar shows "No result yet" when status is null', () => {
    renderStrip({ isCollapsed: true, status: null });
    expect(screen.getByTestId('strip-status')).toHaveTextContent('No result yet');
  });

  it('collapsed bar shows "✓ Valid" when status has no errors or warnings', () => {
    renderStrip({ isCollapsed: true, status: { errors: 0, warnings: 0 } });
    expect(screen.getByTestId('strip-status')).toHaveTextContent('✓ Valid');
  });

  // ---------------------------------------------------------------------------
  // Auto-preview: lastApplyTimestamp triggers onRun unconditionally
  // ---------------------------------------------------------------------------

  it('calls onRun when lastApplyTimestamp changes and sourceData is non-empty', () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          lastApplyTimestamp={null}
        />
      </MemoryRouter>,
    );
    expect(onRun).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          lastApplyTimestamp={1000}
        />
      </MemoryRouter>,
    );
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onRun when lastApplyTimestamp changes but sourceData is empty (AE-14)', () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={''}
          lastApplyTimestamp={null}
        />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={''}
          lastApplyTimestamp={1000}
        />
      </MemoryRouter>,
    );
    expect(onRun).not.toHaveBeenCalled();
  });

  it('does NOT call onRun when autoRun is false and lastApplyTimestamp changes (AE-08)', () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          autoRun={false}
          lastApplyTimestamp={null}
        />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          autoRun={false}
          lastApplyTimestamp={1000}
        />
      </MemoryRouter>,
    );
    expect(onRun).not.toHaveBeenCalled();
  });

  it('calls onRun when autoRun is true and lastApplyTimestamp changes with non-empty source (AE-09)', () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          autoRun={true}
          lastApplyTimestamp={null}
        />
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <InlinePreviewStrip
          {...DEFAULT_PROPS}
          onRun={onRun}
          sourceData={'{"a":1}'}
          autoRun={true}
          lastApplyTimestamp={2000}
        />
      </MemoryRouter>,
    );
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Test case selector
  // ---------------------------------------------------------------------------

  it('renders test case selector dropdown', () => {
    renderStrip();
    expect(screen.getByTestId('strip-test-case-selector')).toBeInTheDocument();
  });

  it('shows "No saved test cases" when testCases is empty', () => {
    renderStrip({ testCases: [] });
    const selector = screen.getByTestId('strip-test-case-selector');
    expect(selector).toHaveTextContent('No saved test cases');
  });

  it('shows "No saved test cases" when testCases is undefined', () => {
    renderStrip({ testCases: undefined });
    const selector = screen.getByTestId('strip-test-case-selector');
    expect(selector).toHaveTextContent('No saved test cases');
  });

  it('lists test case names when testCases has items', () => {
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'tc-2', name: 'Edge case', sourceData: '{"x":1}', createdAt: '2024-01-02T00:00:00Z' },
    ];
    renderStrip({ testCases });
    expect(screen.getByText('Happy path')).toBeInTheDocument();
    expect(screen.getByText('Edge case')).toBeInTheDocument();
  });

  it('fires onLoadTestCase with the selected test case ID', () => {
    const onLoadTestCase = vi.fn();
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
    ];
    renderStrip({ testCases, onLoadTestCase });
    fireEvent.change(screen.getByTestId('strip-test-case-selector'), {
      target: { value: 'tc-1' },
    });
    expect(onLoadTestCase).toHaveBeenCalledWith('tc-1');
  });

  it('resets dropdown to placeholder after selection', () => {
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
    ];
    renderStrip({ testCases, onLoadTestCase: vi.fn() });
    const selector = screen.getByTestId('strip-test-case-selector') as HTMLSelectElement;
    fireEvent.change(selector, { target: { value: 'tc-1' } });
    // After selection the value resets to '' (placeholder)
    expect(selector.value).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Fill-height layout (T-03 / AE-04)
  // ---------------------------------------------------------------------------

  it('expanded root has h-full class to fill parent height constraint', () => {
    renderStrip();
    const root = screen.getByTestId('inline-preview-strip');
    expect(root.className).toContain('h-full');
  });

  it('expanded root has flex flex-col classes for vertical layout', () => {
    renderStrip();
    const root = screen.getByTestId('inline-preview-strip');
    expect(root.className).toContain('flex');
    expect(root.className).toContain('flex-col');
  });

  it('source textarea has flex-1 class to fill available height', () => {
    renderStrip();
    const textarea = screen.getByTestId('strip-source-input');
    expect(textarea.className).toContain('flex-1');
  });

  it('output pre has flex-1 class to fill available height', () => {
    renderStrip();
    const output = screen.getByTestId('strip-output');
    expect(output.className).toContain('flex-1');
  });

  it('output pre has overflow-y-auto class for internal scroll', () => {
    renderStrip();
    const output = screen.getByTestId('strip-output');
    expect(output.className).toContain('overflow-y-auto');
  });

  it('source pane has min-h-0 class to allow shrinking below content size', () => {
    renderStrip();
    const pane = screen.getByTestId('strip-source-pane');
    expect(pane.className).toContain('min-h-0');
  });

  it('output pane has min-h-0 class to allow shrinking below content size', () => {
    renderStrip();
    const pane = screen.getByTestId('strip-output-pane');
    expect(pane.className).toContain('min-h-0');
  });

  // ---------------------------------------------------------------------------
  // Diagnostics ExpandableText (T-05 / AE-07 / AE-08)
  // ---------------------------------------------------------------------------

  it('diagnostic message shorter than 150 chars renders without Show more toggle', () => {
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: 'Short error', ruleIndex: 0, ruleName: 'Rule 1' },
    ];
    renderStrip({ diagnostics });
    expect(screen.queryByTestId('diagnostic-show-more')).not.toBeInTheDocument();
    expect(screen.getByText('Short error')).toBeInTheDocument();
  });

  it('diagnostic message longer than 150 chars renders with Show more toggle', () => {
    const longMessage = 'A'.repeat(160);
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: longMessage, ruleIndex: 0, ruleName: 'Rule 1' },
    ];
    renderStrip({ diagnostics });
    expect(screen.getByTestId('diagnostic-show-more')).toBeInTheDocument();
  });

  it('clicking Show more reveals full diagnostic message', () => {
    const longMessage = 'A'.repeat(160);
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: longMessage, ruleIndex: 0, ruleName: 'Rule 1' },
    ];
    renderStrip({ diagnostics });
    fireEvent.click(screen.getByTestId('diagnostic-show-more'));
    expect(screen.getByTestId('diagnostic-show-less')).toBeInTheDocument();
    expect(screen.queryByTestId('diagnostic-show-more')).not.toBeInTheDocument();
  });

  it('clicking Show less collapses diagnostic message back', () => {
    const longMessage = 'A'.repeat(160);
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: longMessage, ruleIndex: 0, ruleName: 'Rule 1' },
    ];
    renderStrip({ diagnostics });
    fireEvent.click(screen.getByTestId('diagnostic-show-more'));
    fireEvent.click(screen.getByTestId('diagnostic-show-less'));
    expect(screen.getByTestId('diagnostic-show-more')).toBeInTheDocument();
  });

  it('multiple diagnostics have independent expand/collapse state', () => {
    const longMessage = 'B'.repeat(160);
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: longMessage, ruleIndex: 0, ruleName: 'Rule 1' },
      { severity: 'warning' as const, code: 'W001', message: longMessage, ruleIndex: 1, ruleName: 'Rule 2' },
    ];
    renderStrip({ diagnostics });
    const showMoreButtons = screen.getAllByTestId('diagnostic-show-more');
    expect(showMoreButtons).toHaveLength(2);
    // Expand only the first
    fireEvent.click(showMoreButtons[0]);
    expect(screen.getAllByTestId('diagnostic-show-more')).toHaveLength(1);
    expect(screen.getAllByTestId('diagnostic-show-less')).toHaveLength(1);
  });

  it('diagnostic description element does not have truncate class (AE-07)', () => {
    const diagnostics = [
      { severity: 'error' as const, code: 'E001', message: 'Some error message', ruleIndex: 0, ruleName: 'Rule 1' },
    ];
    renderStrip({ diagnostics });
    const entry = screen.getByTestId('diagnostic-entry-0');
    // Walk all descendant text spans — none should have truncate
    const spans = entry.querySelectorAll('span');
    spans.forEach((span) => {
      expect(span.className).not.toContain('truncate');
    });
  });
});
