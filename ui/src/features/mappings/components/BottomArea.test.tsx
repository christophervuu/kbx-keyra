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
});
