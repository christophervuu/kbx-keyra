import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ComparisonSnapshot } from '@/lib/types/domain';

import { ComparisonSnapshotIndicator, ComparisonSnapshotView } from './ComparisonSnapshotView';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<ComparisonSnapshot> = {}): ComparisonSnapshot {
  return {
    id: 'snap-1',
    testCaseId: 'tc-1',
    mappingId: 'mapping-1',
    mode: 'current-vs-saved',
    leftResult: {
      label: 'Current',
      status: 'success',
      metadata: { executionContext: 'client', configVersion: 1, engineVersion: 'client' },
      output: { foo: 'bar' },
      diagnostics: [],
    },
    rightResult: {
      label: 'Saved',
      status: 'success',
      metadata: { executionContext: 'client', configVersion: 1, engineVersion: 'client' },
      output: { foo: 'bar' },
      diagnostics: [],
    },
    diffEntries: [],
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ComparisonSnapshotIndicator tests
// ---------------------------------------------------------------------------

describe('ComparisonSnapshotIndicator', () => {
  it('renders with count', () => {
    render(
      <ComparisonSnapshotIndicator count={3} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByTestId('comparison-snapshot-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-snapshot-indicator')).toHaveTextContent('3');
  });

  it('has correct aria-label for singular count', () => {
    render(
      <ComparisonSnapshotIndicator count={1} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByTestId('comparison-snapshot-indicator')).toHaveAttribute(
      'aria-label',
      '1 comparison snapshot — click to expand',
    );
  });

  it('has correct aria-label for plural count', () => {
    render(
      <ComparisonSnapshotIndicator count={2} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByTestId('comparison-snapshot-indicator')).toHaveAttribute(
      'aria-label',
      '2 comparison snapshots — click to expand',
    );
  });

  it('has aria-expanded=false when not expanded', () => {
    render(
      <ComparisonSnapshotIndicator count={1} expanded={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByTestId('comparison-snapshot-indicator')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('has aria-expanded=true when expanded', () => {
    render(
      <ComparisonSnapshotIndicator count={1} expanded={true} onToggle={vi.fn()} />,
    );
    expect(screen.getByTestId('comparison-snapshot-indicator')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(
      <ComparisonSnapshotIndicator count={1} expanded={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByTestId('comparison-snapshot-indicator'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// ComparisonSnapshotView tests
// ---------------------------------------------------------------------------

describe('ComparisonSnapshotView', () => {
  it('renders empty state when no snapshots', () => {
    render(<ComparisonSnapshotView snapshots={[]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('comparison-snapshot-view-empty')).toBeInTheDocument();
  });

  it('renders snapshot list when snapshots exist', () => {
    const snap = makeSnapshot();
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('comparison-snapshot-view')).toBeInTheDocument();
  });

  it('renders a snapshot item', () => {
    const snap = makeSnapshot({ id: 'snap-abc' });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('comparison-snapshot-item-snap-abc')).toBeInTheDocument();
  });

  it('shows "Outputs match" for snapshot with no diff entries', () => {
    const snap = makeSnapshot({ id: 'snap-match', diffEntries: [] });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('snapshot-match-snap-match')).toHaveTextContent('Outputs match');
  });

  it('shows difference count for snapshot with diff entries', () => {
    const snap = makeSnapshot({
      id: 'snap-diff',
      diffEntries: [
        { type: 'value_mismatch', path: 'foo', actual: 'a', expected: 'b' },
        { type: 'missing_field', path: 'bar', actual: 'x' },
      ],
    });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('snapshot-diff-count-snap-diff')).toHaveTextContent('2 differences');
  });

  it('shows "1 difference" (singular) for one diff entry', () => {
    const snap = makeSnapshot({
      id: 'snap-one',
      diffEntries: [{ type: 'value_mismatch', path: 'foo', actual: 'a', expected: 'b' }],
    });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByTestId('snapshot-diff-count-snap-one')).toHaveTextContent('1 difference');
  });

  it('shows mode label', () => {
    const snap = makeSnapshot({ mode: 'current-vs-saved' });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByText('Current vs Saved')).toBeInTheDocument();
  });

  it('shows left and right labels', () => {
    const snap = makeSnapshot();
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={vi.fn()} />);
    expect(screen.getByText(/Current.*Saved/)).toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    const snap = makeSnapshot({ id: 'snap-del' });
    render(<ComparisonSnapshotView snapshots={[snap]} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('delete-snapshot-snap-del'));
    expect(onDelete).toHaveBeenCalledWith('snap-del');
  });

  it('renders multiple snapshots', () => {
    const snaps = [
      makeSnapshot({ id: 'snap-1' }),
      makeSnapshot({ id: 'snap-2', mode: 'current-vs-dev' }),
    ];
    render(<ComparisonSnapshotView snapshots={snaps} onDelete={vi.fn()} />);
    expect(screen.getByTestId('comparison-snapshot-item-snap-1')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-snapshot-item-snap-2')).toBeInTheDocument();
  });
});
