import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResultPanel } from './ResultPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPanel(overrides: Partial<Parameters<typeof ResultPanel>[0]> = {}) {
  const defaults = {
    title: 'Output',
    collapsed: false,
    onToggleCollapse: vi.fn(),
    children: <div data-testid="child-content">Panel content</div>,
  };
  return render(<ResultPanel {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultPanel', () => {
  describe('header rendering', () => {
    it('renders the title in the header', () => {
      renderPanel({ title: 'Diagnostics' });
      expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    });

    it('renders a badge when badge.count > 0', () => {
      renderPanel({ badge: { count: 5, variant: 'warning' } });
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByLabelText('5 warnings')).toBeInTheDocument();
    });

    it('does not render a badge when badge.count is 0', () => {
      renderPanel({ badge: { count: 0, variant: 'error' } });
      // badge element should not be present
      expect(screen.queryByLabelText(/0 error/)).not.toBeInTheDocument();
    });

    it('does not render a badge when badge prop is omitted', () => {
      renderPanel({ badge: undefined });
      // no badge element
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('badge color variants', () => {
    it('applies info badge classes for info variant', () => {
      renderPanel({ badge: { count: 3, variant: 'info' } });
      const badge = screen.getByText('3');
      expect(badge.className).toContain('bg-blue-500/20');
      expect(badge.className).toContain('text-blue-400');
    });

    it('applies warning badge classes for warning variant', () => {
      renderPanel({ badge: { count: 2, variant: 'warning' } });
      const badge = screen.getByText('2');
      expect(badge.className).toContain('bg-amber-500/20');
      expect(badge.className).toContain('text-amber-400');
    });

    it('applies error badge classes for error variant', () => {
      renderPanel({ badge: { count: 1, variant: 'error' } });
      const badge = screen.getByText('1');
      expect(badge.className).toContain('bg-red-500/20');
      expect(badge.className).toContain('text-red-400');
    });
  });

  describe('collapse toggle', () => {
    it('renders the collapse toggle button when collapsible is true (default)', () => {
      renderPanel({ collapsed: false });
      expect(screen.getByRole('button', { name: /collapse output panel/i })).toBeInTheDocument();
    });

    it('does not render the collapse toggle when collapsible={false}', () => {
      renderPanel({ collapsible: false });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('fires onToggleCollapse when the toggle button is clicked', async () => {
      const onToggleCollapse = vi.fn();
      renderPanel({ onToggleCollapse });
      await userEvent.click(screen.getByRole('button', { name: /collapse output panel/i }));
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('sets aria-expanded=true when expanded', () => {
      renderPanel({ collapsed: false });
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('sets aria-expanded=false when collapsed', () => {
      renderPanel({ collapsed: true });
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows expand label when collapsed', () => {
      renderPanel({ collapsed: true, title: 'Trace' });
      expect(screen.getByRole('button', { name: /expand trace panel/i })).toBeInTheDocument();
    });
  });

  describe('content visibility', () => {
    it('shows content when expanded', () => {
      renderPanel({ collapsed: false });
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      // content container should not have 'hidden' class
      const content = screen.getByRole('region', { name: /output panel content/i });
      expect(content.className).not.toContain('hidden');
    });

    it('hides content but keeps children mounted when collapsed', () => {
      renderPanel({ collapsed: true });
      // child is still in the DOM (mounted)
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      // but the content container has the hidden class
      const content = screen.getByRole('region', { name: /output panel content/i });
      expect(content.className).toContain('hidden');
    });
  });

  describe('empty state', () => {
    it('renders emptyState instead of children when isEmpty=true and expanded', () => {
      renderPanel({
        collapsed: false,
        isEmpty: true,
        emptyState: <p data-testid="empty-msg">No results yet</p>,
      });
      expect(screen.getByTestId('empty-msg')).toBeInTheDocument();
      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    });

    it('renders children when isEmpty=false', () => {
      renderPanel({
        collapsed: false,
        isEmpty: false,
        emptyState: <p data-testid="empty-msg">No results yet</p>,
      });
      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.queryByTestId('empty-msg')).not.toBeInTheDocument();
    });

    it('does not render emptyState when collapsed even if isEmpty=true', () => {
      renderPanel({
        collapsed: true,
        isEmpty: true,
        emptyState: <p data-testid="empty-msg">No results yet</p>,
      });
      // content area is hidden — emptyState is inside it, so it is hidden too
      const content = screen.getByRole('region', { name: /output panel content/i });
      expect(content.className).toContain('hidden');
    });
  });

  describe('testId and className', () => {
    it('applies testId to the root element', () => {
      renderPanel({ testId: 'panel-output' });
      expect(screen.getByTestId('panel-output')).toBeInTheDocument();
    });

    it('applies testId-badge to the badge element', () => {
      renderPanel({ testId: 'panel-diag', badge: { count: 3, variant: 'warning' } });
      expect(screen.getByTestId('panel-diag-badge')).toBeInTheDocument();
    });

    it('applies testId-toggle to the collapse button', () => {
      renderPanel({ testId: 'panel-output' });
      expect(screen.getByTestId('panel-output-toggle')).toBeInTheDocument();
    });

    it('applies testId-content to the content region', () => {
      renderPanel({ testId: 'panel-output' });
      expect(screen.getByTestId('panel-output-content')).toBeInTheDocument();
    });

    it('applies className to the root element', () => {
      renderPanel({ testId: 'panel-root', className: 'custom-class' });
      expect(screen.getByTestId('panel-root').className).toContain('custom-class');
    });
  });
});
