import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VersionDiffView } from './VersionDiffView';
import type { VersionDiff } from '../lib';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDiff(overrides?: Partial<VersionDiff>): VersionDiff {
  return {
    summary: { added: 0, modified: 0, removed: 0 },
    ruleDiffs: [],
    configDiffs: [],
    ...overrides,
  };
}

const DIFF_WITH_CHANGES: VersionDiff = {
  summary: { added: 1, modified: 1, removed: 1 },
  ruleDiffs: [
    { type: 'added', targetPath: 'A.D', newExpression: 'static("new")' },
    {
      type: 'modified',
      targetPath: 'A.B',
      oldExpression: 'source("x")',
      newExpression: 'source("x2")',
    },
    { type: 'removed', targetPath: 'A.C', oldExpression: 'static("y")' },
  ],
  configDiffs: [
    { field: 'unmappedTargets', oldValue: 'null', newValue: 'error' },
  ],
};

const DEFAULT_PROPS = {
  diff: DIFF_WITH_CHANGES,
  selectedVersion: 2,
  currentVersion: 5,
  hasUnsavedChanges: false,
  onRestore: vi.fn(),
  onBack: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VersionDiffView', () => {
  it('renders header with selected and current version info', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Changes from/)).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('renders back button with accessible label', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: 'Back to version list' })).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<VersionDiffView {...DEFAULT_PROPS} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to version list' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders summary counts with correct colors (added/modified/removed)', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByText('+1 added')).toBeInTheDocument();
    expect(screen.getByText('~1 modified')).toBeInTheDocument();
    expect(screen.getByText('-1 removed')).toBeInTheDocument();
  });

  it('renders "No changes between these versions" when diff is empty', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} diff={makeDiff()} />);
    expect(screen.getByText('No changes between these versions')).toBeInTheDocument();
  });

  it('does not render summary counts when diff is empty', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} diff={makeDiff()} />);
    expect(screen.queryByText(/added/)).not.toBeInTheDocument();
    expect(screen.queryByText(/modified/)).not.toBeInTheDocument();
    expect(screen.queryByText(/removed/)).not.toBeInTheDocument();
  });

  it('renders added rules section with target path and new expression', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('region', { name: 'Added rules' })).toBeInTheDocument();
    expect(screen.getByText('A.D')).toBeInTheDocument();
    expect(screen.getByText('static("new")')).toBeInTheDocument();
  });

  it('renders modified rules section with before and after expressions', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('region', { name: 'Modified rules' })).toBeInTheDocument();
    expect(screen.getByText('A.B')).toBeInTheDocument();
    expect(screen.getByText('source("x")')).toBeInTheDocument();
    expect(screen.getByText('source("x2")')).toBeInTheDocument();
  });

  it('renders removed rules section with target path and old expression', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('region', { name: 'Removed rules' })).toBeInTheDocument();
    expect(screen.getByText('A.C')).toBeInTheDocument();
    expect(screen.getByText('static("y")')).toBeInTheDocument();
  });

  it('renders config changes section when configDiffs are present', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('region', { name: 'Configuration changes' })).toBeInTheDocument();
    expect(screen.getByText('unmappedTargets')).toBeInTheDocument();
    expect(screen.getByText('"null"')).toBeInTheDocument();
    expect(screen.getByText('"error"')).toBeInTheDocument();
  });

  it('hides config changes section when configDiffs is empty', () => {
    const diff = { ...DIFF_WITH_CHANGES, configDiffs: [] };
    render(<VersionDiffView {...DEFAULT_PROPS} diff={diff} />);
    expect(screen.queryByRole('region', { name: 'Configuration changes' })).not.toBeInTheDocument();
  });

  it('renders restore button with version number', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: /Restore v2/ })).toBeInTheDocument();
  });

  it('opens confirmation modal when restore button is clicked', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Restore version')).toBeInTheDocument();
  });

  it('shows unsaved changes warning in modal when hasUnsavedChanges is true', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} hasUnsavedChanges={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    expect(screen.getByText(/unsaved changes will be lost/i)).toBeInTheDocument();
  });

  it('does not show unsaved changes warning when hasUnsavedChanges is false', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} hasUnsavedChanges={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    expect(screen.queryByText(/unsaved changes will be lost/i)).not.toBeInTheDocument();
  });

  it('calls onRestore with version number when confirm is clicked', () => {
    const onRestore = vi.fn();
    render(<VersionDiffView {...DEFAULT_PROPS} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onRestore).toHaveBeenCalledWith(2);
  });

  it('dismisses modal without calling onRestore when cancel is clicked', () => {
    const onRestore = vi.fn();
    render(<VersionDiffView {...DEFAULT_PROPS} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('modal message includes correct version numbers', () => {
    render(<VersionDiffView {...DEFAULT_PROPS} selectedVersion={2} currentVersion={5} />);
    fireEvent.click(screen.getByRole('button', { name: /Restore v2/ }));
    // The confirm dialog message should reference v2 and v6 (currentVersion + 1)
    const message = screen.getByText(/This will restore version v2 as a new version \(v6\)/);
    expect(message).toBeInTheDocument();
  });
});
