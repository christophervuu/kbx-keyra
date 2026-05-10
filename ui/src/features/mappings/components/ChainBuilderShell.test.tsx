/**
 * ChainBuilderShell tests — FS-038 T-04
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChainBuilderShell } from './ChainBuilderShell';
import type { ChainBuilderShellProps } from './ChainBuilderShell';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: ChainBuilderShellProps = {
  targetPath: 'customer.email',
  targetType: 'string',
  isRequired: false,
  expression: '',
  result: null,
  isEvaluating: false,
  sourceDataAvailable: false,
  isMapped: false,
  isBuilderMode: true,
  onToggleMode: vi.fn(),
  onClearMapping: vi.fn(),
  onExpressionClick: vi.fn(),
  children: <div data-testid="test-children">Builder content</div>,
};

function renderShell(overrides: Partial<ChainBuilderShellProps> = {}) {
  return render(<ChainBuilderShell {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — header row', () => {
  it('renders the shell container', () => {
    renderShell();
    expect(screen.getByTestId('chain-builder-shell')).toBeInTheDocument();
  });

  it('renders the header', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-header')).toBeInTheDocument();
  });

  it('renders the type badge with correct type', () => {
    renderShell({ targetType: 'number' });
    expect(screen.getByTestId('chain-shell-type-badge')).toHaveTextContent('number');
  });

  it('renders the target path', () => {
    renderShell({ targetPath: 'order.amount' });
    expect(screen.getByTestId('chain-shell-target-path')).toHaveTextContent('order.amount');
  });

  it('renders "required" tag when isRequired is true', () => {
    renderShell({ isRequired: true });
    expect(screen.getByTestId('chain-shell-required-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-shell-optional-tag')).not.toBeInTheDocument();
  });

  it('renders "optional" tag when isRequired is false', () => {
    renderShell({ isRequired: false });
    expect(screen.getByTestId('chain-shell-optional-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-shell-required-tag')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Builder/Editor toggle
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — mode toggle', () => {
  it('renders the mode toggle', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-mode-toggle')).toBeInTheDocument();
  });

  it('Builder button is active (pressed) when isBuilderMode is true', () => {
    renderShell({ isBuilderMode: true });
    expect(screen.getByTestId('chain-shell-toggle-builder')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chain-shell-toggle-editor')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Editor button is active (pressed) when isBuilderMode is false', () => {
    renderShell({ isBuilderMode: false });
    expect(screen.getByTestId('chain-shell-toggle-editor')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chain-shell-toggle-builder')).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onToggleMode when Editor button is clicked in Builder mode', async () => {
    const user = userEvent.setup();
    const onToggleMode = vi.fn();
    renderShell({ isBuilderMode: true, onToggleMode });
    await user.click(screen.getByTestId('chain-shell-toggle-editor'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleMode when Builder button is clicked in Editor mode', async () => {
    const user = userEvent.setup();
    const onToggleMode = vi.fn();
    renderShell({ isBuilderMode: false, onToggleMode });
    await user.click(screen.getByTestId('chain-shell-toggle-builder'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AI action bar
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — AI action bar', () => {
  it('renders the AI bar', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-bar')).toBeInTheDocument();
  });

  it('renders Suggest button as disabled', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).toBeDisabled();
  });

  it('renders Explain button as disabled', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-explain')).toBeDisabled();
  });

  it('renders Fix button as disabled', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-fix')).toBeDisabled();
  });

  it('Suggest button has correct tooltip', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).toHaveAttribute(
      'title',
      'AI-powered expression suggestion — available in a future release',
    );
  });

  it('Suggest button has aria-label', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).toHaveAttribute(
      'aria-label',
      'Suggest expression (coming soon)',
    );
  });

  it('Explain button has aria-label', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-explain')).toHaveAttribute(
      'aria-label',
      'Explain expression (coming soon)',
    );
  });

  it('Fix button has aria-label', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-fix')).toHaveAttribute(
      'aria-label',
      'Fix expression (coming soon)',
    );
  });
});

// ---------------------------------------------------------------------------
// Clear button
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — Clear button', () => {
  it('Clear button is NOT rendered when isMapped is false', () => {
    renderShell({ isMapped: false });
    expect(screen.queryByTestId('chain-shell-clear-btn')).not.toBeInTheDocument();
  });

  it('Clear button IS rendered when isMapped is true', () => {
    renderShell({ isMapped: true });
    expect(screen.getByTestId('chain-shell-clear-btn')).toBeInTheDocument();
  });

  it('Clear button fires onClearMapping when clicked', async () => {
    const user = userEvent.setup();
    const onClearMapping = vi.fn();
    renderShell({ isMapped: true, onClearMapping });
    await user.click(screen.getByTestId('chain-shell-clear-btn'));
    expect(onClearMapping).toHaveBeenCalledTimes(1);
  });

  it('Clear button has aria-label', () => {
    renderShell({ isMapped: true });
    expect(screen.getByTestId('chain-shell-clear-btn')).toHaveAttribute('aria-label', 'Clear mapping');
  });
});

// ---------------------------------------------------------------------------
// Pinned Expression section (AE-03)
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — pinned Expression section', () => {
  it('renders the pinned sections container', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-pinned-sections')).toBeInTheDocument();
  });

  it('renders LiveExpressionDisplay', () => {
    renderShell({ expression: 'source("x")' });
    expect(screen.getByTestId('live-expression-display')).toBeInTheDocument();
  });

  it('shows expression placeholder when expression is empty', () => {
    renderShell({ expression: '' });
    expect(screen.getByTestId('live-expression-placeholder')).toBeInTheDocument();
  });

  it('shows expression content when expression is non-empty', () => {
    renderShell({ expression: 'source("customer.email")' });
    const code = screen.getByTestId('live-expression-code');
    expect(code.textContent).toContain('source');
  });

  it('fires onExpressionClick when expression is clicked', async () => {
    const user = userEvent.setup();
    const onExpressionClick = vi.fn();
    renderShell({ expression: 'source("x")', onExpressionClick });
    await user.click(screen.getByTestId('live-expression-code'));
    expect(onExpressionClick).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Pinned Result section (AE-03)
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — pinned Result section', () => {
  it('renders LiveResultDisplay', () => {
    renderShell();
    expect(screen.getByTestId('live-result-display')).toBeInTheDocument();
  });

  it('shows "Load test data" when sourceDataAvailable is false', () => {
    renderShell({ sourceDataAvailable: false, expression: 'source("x")' });
    expect(screen.getByTestId('live-result-no-data')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Scrollable content area
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — scrollable content area', () => {
  it('renders the content area', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-content')).toBeInTheDocument();
  });

  it('renders children in the content area', () => {
    renderShell();
    expect(screen.getByTestId('test-children')).toBeInTheDocument();
    expect(screen.getByTestId('test-children')).toHaveTextContent('Builder content');
  });

  it('AE-11: does NOT render a suggested-sources row', () => {
    renderShell();
    // No suggested-sources element should exist
    expect(screen.queryByTestId('suggested-sources')).not.toBeInTheDocument();
    expect(screen.queryByText(/suggested/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — keyboard accessibility', () => {
  it('mode toggle buttons are keyboard focusable', () => {
    renderShell({ isBuilderMode: true });
    const editorBtn = screen.getByTestId('chain-shell-toggle-editor');
    editorBtn.focus();
    expect(document.activeElement).toBe(editorBtn);
  });

  it('Clear button is keyboard focusable when visible', () => {
    renderShell({ isMapped: true });
    const clearBtn = screen.getByTestId('chain-shell-clear-btn');
    clearBtn.focus();
    expect(document.activeElement).toBe(clearBtn);
  });
});
