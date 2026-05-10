/**
 * UnsavedChangesOverlay.test.tsx — FS-039 T-10
 *
 * Component tests for UnsavedChangesOverlay.
 * Covers all Verification Requirements from T-10.md.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedChangesOverlay } from './UnsavedChangesOverlay';
import type { UnsavedChangesOverlayProps } from './UnsavedChangesOverlay';
import type { UnsavedChangeSummary } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODIFIED: UnsavedChangeSummary = {
  targetPath: 'output.name',
  changeType: 'modified',
  savedExpression: 'source("firstName")',
  draftExpression: 'upper(source("firstName"))',
};

const ADDED: UnsavedChangeSummary = {
  targetPath: 'output.email',
  changeType: 'added',
  savedExpression: null,
  draftExpression: 'source("email")',
};

const REMOVED: UnsavedChangeSummary = {
  targetPath: 'output.phone',
  changeType: 'removed',
  savedExpression: 'source("phone")',
  draftExpression: '',
};

const ALL_CHANGES: UnsavedChangeSummary[] = [MODIFIED, ADDED, REMOVED];

const DEFAULT_PROPS: UnsavedChangesOverlayProps = {
  changes: ALL_CHANGES,
  onRevert: vi.fn(),
  onNavigate: vi.fn(),
  onClose: vi.fn(),
};

function renderOverlay(overrides: Partial<UnsavedChangesOverlayProps> = {}) {
  return render(<UnsavedChangesOverlay {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — structure', () => {
  it('renders the overlay', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-overlay')).toBeInTheDocument();
  });

  it('renders the dialog panel', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-panel')).toBeInTheDocument();
  });

  it('dialog panel has role="dialog"', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-panel')).toHaveAttribute('role', 'dialog');
  });

  it('dialog panel has aria-modal="true"', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-panel')).toHaveAttribute('aria-modal', 'true');
  });

  it('renders close button', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-close')).toBeInTheDocument();
  });

  it('renders backdrop', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-backdrop')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Count header
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — count header', () => {
  it('shows correct count for multiple changes', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-title')).toHaveTextContent('3 unsaved changes');
  });

  it('uses singular "change" for 1 change', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-changes-title')).toHaveTextContent('1 unsaved change');
  });

  it('shows "No unsaved changes" for empty list', () => {
    renderOverlay({ changes: [] });
    expect(screen.getByTestId('unsaved-changes-title')).toHaveTextContent('No unsaved changes');
  });
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — grouping', () => {
  it('renders Modified group', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-group-modified')).toBeInTheDocument();
  });

  it('renders Added group', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-group-added')).toBeInTheDocument();
  });

  it('renders Removed group', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-group-removed')).toBeInTheDocument();
  });

  it('does not render a group when it has no entries', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.queryByTestId('unsaved-changes-group-added')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unsaved-changes-group-removed')).not.toBeInTheDocument();
  });

  it('renders group labels', () => {
    renderOverlay();
    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Entry rendering — Modified
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — Modified entry', () => {
  it('renders the entry', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-entry-output.name')).toBeInTheDocument();
  });

  it('shows saved expression', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-saved-output.name')).toHaveTextContent(
      'source("firstName")',
    );
  });

  it('shows draft expression', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-draft-output.name')).toHaveTextContent(
      'upper(source("firstName"))',
    );
  });

  it('shows field path as navigate button', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-navigate-output.name')).toHaveTextContent(
      'output.name',
    );
  });
});

// ---------------------------------------------------------------------------
// Entry rendering — Added
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — Added entry', () => {
  it('shows "unmapped" for saved expression when null', () => {
    renderOverlay({ changes: [ADDED] });
    expect(screen.getByTestId('unsaved-change-saved-output.email')).toHaveTextContent('unmapped');
  });

  it('shows draft expression', () => {
    renderOverlay({ changes: [ADDED] });
    expect(screen.getByTestId('unsaved-change-draft-output.email')).toHaveTextContent(
      'source("email")',
    );
  });
});

// ---------------------------------------------------------------------------
// Entry rendering — Removed
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — Removed entry', () => {
  it('shows saved expression', () => {
    renderOverlay({ changes: [REMOVED] });
    expect(screen.getByTestId('unsaved-change-saved-output.phone')).toHaveTextContent(
      'source("phone")',
    );
  });

  it('shows "will be removed" for empty draft expression', () => {
    renderOverlay({ changes: [REMOVED] });
    expect(screen.getByTestId('unsaved-change-draft-output.phone')).toHaveTextContent(
      'will be removed',
    );
  });
});

// ---------------------------------------------------------------------------
// Revert
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — revert', () => {
  it('clicking Revert calls onRevert with correct targetPath', () => {
    const onRevert = vi.fn();
    renderOverlay({ changes: [MODIFIED], onRevert });
    fireEvent.click(screen.getByTestId('unsaved-change-revert-output.name'));
    expect(onRevert).toHaveBeenCalledWith('output.name');
  });

  it('clicking Revert on Added entry calls onRevert with correct targetPath', () => {
    const onRevert = vi.fn();
    renderOverlay({ changes: [ADDED], onRevert });
    fireEvent.click(screen.getByTestId('unsaved-change-revert-output.email'));
    expect(onRevert).toHaveBeenCalledWith('output.email');
  });

  it('clicking Revert on Removed entry calls onRevert with correct targetPath', () => {
    const onRevert = vi.fn();
    renderOverlay({ changes: [REMOVED], onRevert });
    fireEvent.click(screen.getByTestId('unsaved-change-revert-output.phone'));
    expect(onRevert).toHaveBeenCalledWith('output.phone');
  });

  it('Revert button has aria-label', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-revert-output.name')).toHaveAttribute(
      'aria-label',
      'Revert changes to output.name',
    );
  });
});

// ---------------------------------------------------------------------------
// Navigate
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — navigate', () => {
  it('clicking field path calls onNavigate with correct targetPath', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderOverlay({ changes: [MODIFIED], onNavigate, onClose });
    fireEvent.click(screen.getByTestId('unsaved-change-navigate-output.name'));
    expect(onNavigate).toHaveBeenCalledWith('output.name');
  });

  it('clicking field path also calls onClose', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderOverlay({ changes: [MODIFIED], onNavigate, onClose });
    fireEvent.click(screen.getByTestId('unsaved-change-navigate-output.name'));
    expect(onClose).toHaveBeenCalled();
  });

  it('navigate button has aria-label', () => {
    renderOverlay({ changes: [MODIFIED] });
    expect(screen.getByTestId('unsaved-change-navigate-output.name')).toHaveAttribute(
      'aria-label',
      'Navigate to field output.name',
    );
  });
});

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — close', () => {
  it('clicking close button calls onClose', () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.click(screen.getByTestId('unsaved-changes-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking backdrop calls onClose', () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.click(screen.getByTestId('unsaved-changes-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('close button has aria-label', () => {
    renderOverlay();
    expect(screen.getByTestId('unsaved-changes-close')).toHaveAttribute(
      'aria-label',
      'Close unsaved changes',
    );
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('UnsavedChangesOverlay — empty state', () => {
  it('renders empty state message when no changes', () => {
    renderOverlay({ changes: [] });
    expect(screen.getByTestId('unsaved-changes-empty')).toBeInTheDocument();
  });

  it('does not render any groups when no changes', () => {
    renderOverlay({ changes: [] });
    expect(screen.queryByTestId('unsaved-changes-group-modified')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unsaved-changes-group-added')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unsaved-changes-group-removed')).not.toBeInTheDocument();
  });
});
