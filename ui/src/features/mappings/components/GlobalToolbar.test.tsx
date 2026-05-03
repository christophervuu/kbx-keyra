import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { GlobalToolbar } from './GlobalToolbar';
import type { GlobalToolbarProps } from './GlobalToolbar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: GlobalToolbarProps = {
  searchQuery: '',
  activeFilters: [],
  sort: 'schema',
  view: 'target',
  onSearchChange: vi.fn(),
  onFilterChange: vi.fn(),
  onSortChange: vi.fn(),
  onViewToggle: vi.fn(),
};

function renderToolbar(overrides: Partial<GlobalToolbarProps> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  return render(<GlobalToolbar {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlobalToolbar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // Rendering
  it('renders search input', () => {
    renderToolbar();
    expect(screen.getByTestId('toolbar-search')).toBeInTheDocument();
  });

  it('renders all filter buttons', () => {
    renderToolbar();
    expect(screen.getByRole('button', { name: 'Unmapped' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Warnings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Required' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrays' })).toBeInTheDocument();
  });

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

  // Search debounce
  it('fires onSearchChange after 300ms debounce', async () => {
    const onSearchChange = vi.fn();
    renderToolbar({ onSearchChange });
    const input = screen.getByTestId('toolbar-search');
    fireEvent.change(input, { target: { value: 'first' } });
    expect(onSearchChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onSearchChange).toHaveBeenCalledWith('first');
  });

  it('does not fire onSearchChange before debounce expires', () => {
    const onSearchChange = vi.fn();
    renderToolbar({ onSearchChange });
    const input = screen.getByTestId('toolbar-search');
    fireEvent.change(input, { target: { value: 'fi' } });
    vi.advanceTimersByTime(200);
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it('debounces rapid typing — only fires once for last value', () => {
    const onSearchChange = vi.fn();
    renderToolbar({ onSearchChange });
    const input = screen.getByTestId('toolbar-search');
    fireEvent.change(input, { target: { value: 'f' } });
    fireEvent.change(input, { target: { value: 'fi' } });
    fireEvent.change(input, { target: { value: 'fir' } });
    vi.advanceTimersByTime(300);
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('fir');
  });

  // Filter toggles
  it('clicking a filter button fires onFilterChange with that filter added', () => {
    const onFilterChange = vi.fn();
    renderToolbar({ onFilterChange });
    fireEvent.click(screen.getByRole('button', { name: 'Unmapped' }));
    expect(onFilterChange).toHaveBeenCalledWith(['unmapped']);
  });

  it('clicking an active filter removes it from the set', () => {
    const onFilterChange = vi.fn();
    renderToolbar({ activeFilters: ['unmapped'], onFilterChange });
    fireEvent.click(screen.getByRole('button', { name: 'Unmapped' }));
    expect(onFilterChange).toHaveBeenCalledWith([]);
  });

  it('multiple filters can be active simultaneously', () => {
    const onFilterChange = vi.fn();
    renderToolbar({ activeFilters: ['unmapped'], onFilterChange });
    fireEvent.click(screen.getByRole('button', { name: 'Required' }));
    const called = onFilterChange.mock.calls[0][0] as string[];
    expect(called).toContain('unmapped');
    expect(called).toContain('required');
  });

  it('active filter button has aria-pressed=true', () => {
    renderToolbar({ activeFilters: ['warnings'] });
    expect(screen.getByRole('button', { name: 'Warnings' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('inactive filter button has aria-pressed=false', () => {
    renderToolbar({ activeFilters: [] });
    expect(screen.getByRole('button', { name: 'Warnings' })).toHaveAttribute('aria-pressed', 'false');
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
    const onSearchChange = vi.fn();
    const onFilterChange = vi.fn();
    const onSortChange = vi.fn();
    const onViewToggle = vi.fn();
    renderToolbar({ onSearchChange, onFilterChange, onSortChange, onViewToggle });
    fireEvent.click(screen.getByTestId('toolbar-automap'));
    vi.advanceTimersByTime(300);
    expect(onSearchChange).not.toHaveBeenCalled();
    expect(onFilterChange).not.toHaveBeenCalled();
    expect(onSortChange).not.toHaveBeenCalled();
    expect(onViewToggle).not.toHaveBeenCalled();
  });
});
