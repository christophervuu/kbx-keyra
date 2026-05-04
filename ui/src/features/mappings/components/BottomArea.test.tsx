import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomArea } from './BottomArea';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONTENT = {
  previewContent: <div data-testid="preview-content">Preview</div>,
  diagnosticsContent: <div data-testid="diagnostics-content">Diagnostics</div>,
  traceContent: <div data-testid="trace-content">Trace</div>,
  testCasesContent: <div data-testid="test-cases-content">Test Cases</div>,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BottomArea', () => {
  it('renders all tab buttons', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-tab-preview')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-diagnostics')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-trace')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tab-test-cases')).toBeInTheDocument();
  });

  it('shows preview content by default', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-panel-preview')).not.toHaveStyle({ display: 'none' });
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
  });

  it('clicking a tab shows that tab panel', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    fireEvent.click(screen.getByTestId('bottom-tab-diagnostics'));
    expect(screen.getByTestId('bottom-panel-diagnostics')).not.toHaveStyle({ display: 'none' });
    expect(screen.getByTestId('bottom-panel-preview')).toHaveStyle({ display: 'none' });
  });

  it('all tab panels remain mounted when switching tabs', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    fireEvent.click(screen.getByTestId('bottom-tab-trace'));
    // All panels still in DOM
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-content')).toBeInTheDocument();
    expect(screen.getByTestId('trace-content')).toBeInTheDocument();
    expect(screen.getByTestId('test-cases-content')).toBeInTheDocument();
  });

  it('collapse toggle hides tab content', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    fireEvent.click(screen.getByTestId('bottom-collapse-toggle'));
    // All panels hidden
    expect(screen.getByTestId('bottom-panel-preview')).toHaveStyle({ display: 'none' });
    expect(screen.getByTestId('bottom-panel-diagnostics')).toHaveStyle({ display: 'none' });
  });

  it('collapse toggle re-expands content', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    fireEvent.click(screen.getByTestId('bottom-collapse-toggle'));
    fireEvent.click(screen.getByTestId('bottom-collapse-toggle'));
    expect(screen.getByTestId('bottom-panel-preview')).not.toHaveStyle({ display: 'none' });
  });

  it('clicking a tab while collapsed expands the panel', () => {
    render(<BottomArea {...DEFAULT_CONTENT} defaultCollapsed={true} />);
    fireEvent.click(screen.getByTestId('bottom-tab-diagnostics'));
    expect(screen.getByTestId('bottom-panel-diagnostics')).not.toHaveStyle({ display: 'none' });
  });

  it('starts collapsed when defaultCollapsed=true', () => {
    render(<BottomArea {...DEFAULT_CONTENT} defaultCollapsed={true} />);
    expect(screen.getByTestId('bottom-panel-preview')).toHaveStyle({ display: 'none' });
  });

  it('active tab button has aria-selected=true', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-tab-preview')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('bottom-tab-diagnostics')).toHaveAttribute('aria-selected', 'false');
  });

  it('collapse toggle has correct aria-expanded attribute', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-collapse-toggle')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByTestId('bottom-collapse-toggle'));
    expect(screen.getByTestId('bottom-collapse-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  // ---------------------------------------------------------------------------
  // Test case selector
  // ---------------------------------------------------------------------------

  it('renders test case selector dropdown', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-test-case-selector')).toBeInTheDocument();
  });

  it('shows "No saved test cases" when testCases is empty', () => {
    render(<BottomArea {...DEFAULT_CONTENT} testCases={[]} />);
    expect(screen.getByTestId('bottom-test-case-selector')).toHaveTextContent('No saved test cases');
  });

  it('shows "No saved test cases" when testCases is undefined', () => {
    render(<BottomArea {...DEFAULT_CONTENT} />);
    expect(screen.getByTestId('bottom-test-case-selector')).toHaveTextContent('No saved test cases');
  });

  it('lists test case names when testCases has items', () => {
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'tc-2', name: 'Edge case', sourceData: '{"x":1}', createdAt: '2024-01-02T00:00:00Z' },
    ];
    render(<BottomArea {...DEFAULT_CONTENT} testCases={testCases} />);
    expect(screen.getByText('Happy path')).toBeInTheDocument();
    expect(screen.getByText('Edge case')).toBeInTheDocument();
  });

  it('fires onLoadTestCase with the selected test case ID', () => {
    const onLoadTestCase = vi.fn();
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
    ];
    render(<BottomArea {...DEFAULT_CONTENT} testCases={testCases} onLoadTestCase={onLoadTestCase} />);
    fireEvent.change(screen.getByTestId('bottom-test-case-selector'), {
      target: { value: 'tc-1' },
    });
    expect(onLoadTestCase).toHaveBeenCalledWith('tc-1');
  });

  it('resets dropdown to placeholder after selection', () => {
    const testCases = [
      { id: 'tc-1', name: 'Happy path', sourceData: '{}', createdAt: '2024-01-01T00:00:00Z' },
    ];
    render(<BottomArea {...DEFAULT_CONTENT} testCases={testCases} onLoadTestCase={vi.fn()} />);
    const selector = screen.getByTestId('bottom-test-case-selector') as HTMLSelectElement;
    fireEvent.change(selector, { target: { value: 'tc-1' } });
    expect(selector.value).toBe('');
  });
});
