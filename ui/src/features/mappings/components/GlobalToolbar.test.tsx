import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { GlobalToolbar } from './GlobalToolbar';
import type { GlobalToolbarProps } from './GlobalToolbar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: GlobalToolbarProps = {
  sort: 'schema',
  view: 'target',
  breadcrumbMode: false,
  onSortChange: vi.fn(),
  onViewToggle: vi.fn(),
  onBreadcrumbModeToggle: vi.fn(),
};

function renderToolbar(overrides: Partial<GlobalToolbarProps> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(<GlobalToolbar {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlobalToolbar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Rendering
  it('renders sort control', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-sort')).toBeInTheDocument();
  });

  it('renders view toggle buttons', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-view-target')).toBeInTheDocument();
    expect(screen.getByTestId('toolbar-view-rules')).toBeInTheDocument();
  });

  it('renders Auto-map Section button', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-automap')).toBeInTheDocument();
  });

  it('renders breadcrumb mode toggle', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-breadcrumb-mode')).toBeInTheDocument();
  });

  // Sort
  it('changing sort fires onSortChange with new value', () => {
    const onSortChange = vi.fn();
    renderToolbar({ onSortChange });
    fireEvent.change(screen.getByTestId('toolbar-sort'), {
      target: { value: 'unmapped-first' },
    });
    expect(onSortChange).toHaveBeenCalledWith('unmapped-first');
  });

  it('sort select reflects current sort prop', () => {
    renderToolbar({ sort: 'required-first' });
    expect(screen.getByTestId('toolbar-sort')).toHaveValue('required-first');
  });

  // View toggle
  it('clicking Rules View fires onViewToggle with "rules"', () => {
    const onViewToggle = vi.fn();
    renderToolbar({ view: 'target', onViewToggle });
    fireEvent.click(screen.getByTestId('toolbar-view-rules'));
    expect(onViewToggle).toHaveBeenCalledWith('rules');
  });

  it('clicking Target View fires onViewToggle with "target"', () => {
    const onViewToggle = vi.fn();
    renderToolbar({ view: 'rules', onViewToggle });
    fireEvent.click(screen.getByTestId('toolbar-view-target'));
    expect(onViewToggle).toHaveBeenCalledWith('target');
  });

  it('clicking the already-active view does not fire onViewToggle', () => {
    const onViewToggle = vi.fn();
    renderToolbar({ view: 'target', onViewToggle });
    fireEvent.click(screen.getByTestId('toolbar-view-target'));
    expect(onViewToggle).not.toHaveBeenCalled();
  });

  it('active view button has aria-pressed=true', () => {
    renderToolbar({ view: 'target' });
    expect(screen.getByTestId('toolbar-view-target')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('toolbar-view-rules')).toHaveAttribute('aria-pressed', 'false');
  });

  // Breadcrumb mode toggle
  it('breadcrumb mode toggle reflects aria-pressed state', () => {
    renderToolbar({ breadcrumbMode: true });
    expect(screen.getByTestId('toolbar-breadcrumb-mode')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking breadcrumb mode toggle fires onBreadcrumbModeToggle', () => {
    const onBreadcrumbModeToggle = vi.fn();
    renderToolbar({ onBreadcrumbModeToggle });
    fireEvent.click(screen.getByTestId('toolbar-breadcrumb-mode'));
    expect(onBreadcrumbModeToggle).toHaveBeenCalledTimes(1);
  });

  // Auto-map button
  it('Auto-map Section button is disabled', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-automap')).toBeDisabled();
  });

  it('Auto-map Section button has correct tooltip text', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-automap')).toHaveAttribute(
      'title',
      'AI-powered auto-mapping \u2014 available in a future release',
    );
  });

  it('clicking disabled Auto-map button does not fire any handler', () => {
    const onSortChange = vi.fn();
    const onViewToggle = vi.fn();
    renderToolbar({ onSortChange, onViewToggle });
    fireEvent.click(screen.getByTestId('toolbar-automap'));
    expect(onSortChange).not.toHaveBeenCalled();
    expect(onViewToggle).not.toHaveBeenCalled();
  });
});
