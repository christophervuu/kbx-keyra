/**
 * UnsavedDiffPanel component tests (FS-040 T-05).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedDiffPanel } from './UnsavedDiffPanel';
import type { UnsavedDiffState } from '../hooks/use-unsaved-diff';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NO_MAPPING_STATE: UnsavedDiffState = {
  status: 'no-mapping',
  savedExpression: null,
  currentExpression: '',
  hasUnsavedChanges: false,
};

const NEW_STATE: UnsavedDiffState = {
  status: 'new',
  savedExpression: null,
  currentExpression: 'source("email")',
  hasUnsavedChanges: true,
};

const MODIFIED_STATE: UnsavedDiffState = {
  status: 'modified',
  savedExpression: 'source("firstName")',
  currentExpression: 'upper(source("firstName"))',
  hasUnsavedChanges: true,
};

const REMOVED_STATE: UnsavedDiffState = {
  status: 'removed',
  savedExpression: 'source("firstName")',
  currentExpression: '',
  hasUnsavedChanges: true,
};

const UNCHANGED_STATE: UnsavedDiffState = {
  status: 'unchanged',
  savedExpression: 'source("firstName")',
  currentExpression: 'source("firstName")',
  hasUnsavedChanges: false,
};

function renderPanel(
  diffState: UnsavedDiffState,
  {
    isExpanded = false,
    onToggle = vi.fn(),
    onRevert = vi.fn(),
  }: {
    isExpanded?: boolean;
    onToggle?: ReturnType<typeof vi.fn>;
    onRevert?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return render(
    <UnsavedDiffPanel
      diffState={diffState}
      targetPath="patient.firstName"
      isExpanded={isExpanded}
      onToggle={onToggle}
      onRevert={onRevert}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnsavedDiffPanel', () => {
  describe('trigger button', () => {
    it('renders the trigger button', () => {
      renderPanel(NO_MAPPING_STATE);
      expect(screen.getByTestId('unsaved-diff-trigger')).toBeInTheDocument();
    });

    it('trigger has aria-expanded=false when collapsed', () => {
      renderPanel(NO_MAPPING_STATE, { isExpanded: false });
      expect(screen.getByTestId('unsaved-diff-trigger')).toHaveAttribute('aria-expanded', 'false');
    });

    it('trigger has aria-expanded=true when expanded', () => {
      renderPanel(NO_MAPPING_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-trigger')).toHaveAttribute('aria-expanded', 'true');
    });

    it('clicking trigger calls onToggle', () => {
      const onToggle = vi.fn();
      renderPanel(NO_MAPPING_STATE, { onToggle });
      fireEvent.click(screen.getByTestId('unsaved-diff-trigger'));
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('shows change indicator badge when hasUnsavedChanges is true', () => {
      renderPanel(MODIFIED_STATE);
      expect(screen.getByTestId('unsaved-diff-badge')).toBeInTheDocument();
    });

    it('does not show change indicator badge when hasUnsavedChanges is false', () => {
      renderPanel(NO_MAPPING_STATE);
      expect(screen.queryByTestId('unsaved-diff-badge')).not.toBeInTheDocument();
    });
  });

  describe('expanded content', () => {
    it('does not render content when collapsed', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: false });
      expect(screen.queryByTestId('unsaved-diff-content')).not.toBeInTheDocument();
    });

    it('renders content when expanded', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-content')).toBeInTheDocument();
    });

    it('shows saved expression section when expanded', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      expect(screen.getByTestId('diff-saved-expression')).toBeInTheDocument();
    });

    it('shows current expression section when expanded', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      expect(screen.getByTestId('diff-current-expression')).toBeInTheDocument();
    });

    it('shows "No mapping" placeholder for null saved expression', () => {
      renderPanel(NEW_STATE, { isExpanded: true });
      const savedSection = screen.getByTestId('diff-saved-expression');
      expect(savedSection.textContent).toContain('No mapping');
    });
  });

  describe('status badge', () => {
    it('shows "New mapping" badge for new status', () => {
      renderPanel(NEW_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-status-badge')).toHaveTextContent('New mapping');
    });

    it('shows "Modified" badge for modified status', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-status-badge')).toHaveTextContent('Modified');
    });

    it('shows "Mapping removed" badge for removed status', () => {
      renderPanel(REMOVED_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-status-badge')).toHaveTextContent('Mapping removed');
    });

    it('shows "No changes" badge for unchanged status', () => {
      renderPanel(UNCHANGED_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-status-badge')).toHaveTextContent('No changes');
    });

    it('shows "No mapping" badge for no-mapping status', () => {
      renderPanel(NO_MAPPING_STATE, { isExpanded: true });
      expect(screen.getByTestId('unsaved-diff-status-badge')).toHaveTextContent('No mapping');
    });
  });

  describe('Revert to saved button', () => {
    it('shows Revert button for modified status', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      expect(screen.getByTestId('revert-to-saved-btn')).toBeInTheDocument();
    });

    it('shows Revert button for removed status', () => {
      renderPanel(REMOVED_STATE, { isExpanded: true });
      expect(screen.getByTestId('revert-to-saved-btn')).toBeInTheDocument();
    });

    it('does not show Revert button for new status', () => {
      renderPanel(NEW_STATE, { isExpanded: true });
      expect(screen.queryByTestId('revert-to-saved-btn')).not.toBeInTheDocument();
    });

    it('does not show Revert button for unchanged status', () => {
      renderPanel(UNCHANGED_STATE, { isExpanded: true });
      expect(screen.queryByTestId('revert-to-saved-btn')).not.toBeInTheDocument();
    });

    it('clicking Revert calls onRevert', () => {
      const onRevert = vi.fn();
      renderPanel(MODIFIED_STATE, { isExpanded: true, onRevert });
      fireEvent.click(screen.getByTestId('revert-to-saved-btn'));
      expect(onRevert).toHaveBeenCalledOnce();
    });
  });

  describe('ARIA', () => {
    it('panel has data-testid="unsaved-diff-panel"', () => {
      renderPanel(NO_MAPPING_STATE);
      expect(screen.getByTestId('unsaved-diff-panel')).toBeInTheDocument();
    });

    it('expanded content has aria-labelledby pointing to status badge', () => {
      renderPanel(MODIFIED_STATE, { isExpanded: true });
      const content = screen.getByTestId('unsaved-diff-content');
      expect(content.getAttribute('aria-labelledby')).toBeTruthy();
    });
  });
});
