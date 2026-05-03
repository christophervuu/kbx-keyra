import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { VersionHistoryDrawer, VersionListItem, formatRelativeTime } from './VersionHistoryDrawer';
import type { VersionHistoryEntry } from '../hooks/use-version-history';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(version: number, overrides?: Partial<VersionHistoryEntry>): VersionHistoryEntry {
  return {
    version,
    savedAt: new Date(Date.now() - version * 60_000).toISOString(), // version minutes ago
    savedBy: 'You',
    ruleCount: version * 2,
    summary: version === 1 ? 'Initial version — 2 rules' : `+${version} added`,
    ...overrides,
  };
}

const VERSIONS: VersionHistoryEntry[] = [
  makeEntry(3),
  makeEntry(2),
  makeEntry(1),
];

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  versions: VERSIONS,
  isLoading: false,
  isEmpty: false,
  selectedVersion: null,
  onSelectVersion: vi.fn(),
  currentVersion: 3,
};

// ---------------------------------------------------------------------------
// formatRelativeTime tests
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 1 minute ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('just now');
  });

  it('returns "X min ago" for < 1 hour ago', () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('5 min ago');
  });

  it('returns "X hours ago" for < 24 hours ago', () => {
    const iso = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(iso)).toBe('3 hours ago');
  });

  it('returns a formatted date string for older entries', () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const result = formatRelativeTime(iso);
    // Should be a date string, not a relative time
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });
});

// ---------------------------------------------------------------------------
// VersionListItem tests
// ---------------------------------------------------------------------------

describe('VersionListItem', () => {
  it('renders version badge, rule count, summary, and timestamp', () => {
    const entry = makeEntry(2, { savedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    render(
      <VersionListItem
        entry={entry}
        isSelected={false}
        isCurrent={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText(/4 rules/)).toBeInTheDocument();
    expect(screen.getByText(/\+2 added/)).toBeInTheDocument();
    expect(screen.getByText('5 min ago')).toBeInTheDocument();
  });

  it('shows "Current" badge when isCurrent is true', () => {
    render(
      <VersionListItem
        entry={makeEntry(3)}
        isSelected={false}
        isCurrent={true}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('does not show "Current" badge when isCurrent is false', () => {
    render(
      <VersionListItem
        entry={makeEntry(2)}
        isSelected={false}
        isCurrent={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });

  it('calls onSelect when clicked (non-current)', () => {
    const onSelect = vi.fn();
    render(
      <VersionListItem
        entry={makeEntry(2)}
        isSelected={false}
        isCurrent={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('does not call onSelect when current item is clicked', () => {
    const onSelect = vi.fn();
    render(
      <VersionListItem
        entry={makeEntry(3)}
        isSelected={false}
        isCurrent={true}
        onSelect={onSelect}
      />,
    );
    // Current item has no role="button"
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('calls onSelect on Enter key press', () => {
    const onSelect = vi.fn();
    render(
      <VersionListItem
        entry={makeEntry(2)}
        isSelected={false}
        isCurrent={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('calls onSelect on Space key press', () => {
    const onSelect = vi.fn();
    render(
      <VersionListItem
        entry={makeEntry(2)}
        isSelected={false}
        isCurrent={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

// ---------------------------------------------------------------------------
// VersionHistoryDrawer tests
// ---------------------------------------------------------------------------

describe('VersionHistoryDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders drawer with role="dialog" and aria-label when open', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} />);
    expect(screen.getByRole('dialog', { name: 'Version History' })).toBeInTheDocument();
  });

  it('renders "Version History" heading', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} />);
    expect(screen.getByText('Version History')).toBeInTheDocument();
  });

  it('renders close button with accessible label', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} />);
    expect(screen.getByRole('button', { name: 'Close version history' })).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close version history' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<VersionHistoryDrawer {...DEFAULT_PROPS} onClose={onClose} />);
    // Backdrop is the first child of the container (fixed overlay div)
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} isLoading={true} versions={[]} isEmpty={false} />);
    expect(screen.getByLabelText('Loading version history')).toBeInTheDocument();
  });

  it('renders empty state message when isEmpty is true', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} versions={[]} isEmpty={true} />);
    expect(
      screen.getByText(/This is the first version\. Save changes to build version history\./),
    ).toBeInTheDocument();
  });

  it('renders all version entries', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('marks the currentVersion entry with "Current" badge', () => {
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} currentVersion={3} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('calls onSelectVersion when a non-current version item is clicked', () => {
    const onSelectVersion = vi.fn();
    render(<VersionHistoryDrawer {...DEFAULT_PROPS} onSelectVersion={onSelectVersion} />);
    // v2 is not current (currentVersion=3)
    const buttons = screen.getAllByRole('button');
    const v2Button = buttons.find((b) => b.textContent?.includes('v2'));
    expect(v2Button).toBeDefined();
    fireEvent.click(v2Button!);
    expect(onSelectVersion).toHaveBeenCalledWith(2);
  });

  it('renders children slot content', () => {
    render(
      <VersionHistoryDrawer {...DEFAULT_PROPS}>
        <div data-testid="diff-view">Diff content</div>
      </VersionHistoryDrawer>,
    );
    expect(screen.getByTestId('diff-view')).toBeInTheDocument();
  });
});
