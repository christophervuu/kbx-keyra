import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  VersionHistoryDrawer,
  VersionListItem,
  RevisionListItem,
  MappingVersionListItem,
  formatRelativeTime,
} from './VersionHistoryDrawer';
import type { VersionHistoryEntry } from '../hooks/use-version-history';
import type { MappingRevision, MappingVersion } from '@/lib/types/domain';

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

// ---------------------------------------------------------------------------
// T-07: RevisionListItem tests
// ---------------------------------------------------------------------------

function makeRevision(revision: number, overrides?: Partial<MappingRevision>): MappingRevision {
  return {
    revision,
    savedAt: new Date(Date.now() - revision * 60_000).toISOString(),
    savedBy: 'alice',
    ruleCount: revision * 3,
    ...overrides,
  };
}

function makeMappingVersion(version: number, overrides?: Partial<MappingVersion>): MappingVersion {
  return {
    version,
    revisionNumber: version * 2,
    createdAt: new Date(Date.now() - version * 60_000).toISOString(),
    createdBy: 'bob',
    ...overrides,
  };
}

describe('RevisionListItem', () => {
  it('renders revision badge, rule count, and author', () => {
    const rev = makeRevision(5);
    render(
      <RevisionListItem revision={rev} isSelected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('revision-badge-5')).toBeInTheDocument();
    expect(screen.getByText('Rev 5')).toBeInTheDocument();
    expect(screen.getByText('15 rules')).toBeInTheDocument();
    expect(screen.getByText('Saved by alice')).toBeInTheDocument();
  });

  it('calls onSelect with revision number on click', () => {
    const onSelect = vi.fn();
    render(
      <RevisionListItem revision={makeRevision(3)} isSelected={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('calls onSelect on Enter key', () => {
    const onSelect = vi.fn();
    render(
      <RevisionListItem revision={makeRevision(3)} isSelected={false} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('calls onSelect on Space key', () => {
    const onSelect = vi.fn();
    render(
      <RevisionListItem revision={makeRevision(3)} isSelected={false} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

// ---------------------------------------------------------------------------
// T-07: MappingVersionListItem tests
// ---------------------------------------------------------------------------

describe('MappingVersionListItem', () => {
  it('renders version badge, revision link, and author', () => {
    const ver = makeMappingVersion(2);
    render(
      <MappingVersionListItem version={ver} isSelected={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId('version-badge-2')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('→ Rev 4')).toBeInTheDocument();
    expect(screen.getByText('Created by bob')).toBeInTheDocument();
  });

  it('calls onSelect with version number on click', () => {
    const onSelect = vi.fn();
    render(
      <MappingVersionListItem version={makeMappingVersion(1)} isSelected={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('calls onSelect on Enter key', () => {
    const onSelect = vi.fn();
    render(
      <MappingVersionListItem version={makeMappingVersion(1)} isSelected={false} onSelect={onSelect} />,
    );
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// T-07: VersionHistoryDrawer two-tab mode tests
// ---------------------------------------------------------------------------

const REVISIONS: MappingRevision[] = [makeRevision(3), makeRevision(2), makeRevision(1)];
const MAPPING_VERSIONS: MappingVersion[] = [makeMappingVersion(2), makeMappingVersion(1)];

const TAB_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  revisions: REVISIONS,
  isLoadingRevisions: false,
  selectedRevision: null as number | null,
  onSelectRevision: vi.fn(),
  mappingVersions: MAPPING_VERSIONS,
  isLoadingMappingVersions: false,
  selectedMappingVersion: null as number | null,
  onSelectMappingVersion: vi.fn(),
};

describe('VersionHistoryDrawer — two-tab mode (T-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tab strip when revisions prop is provided', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} />);
    expect(screen.getByTestId('history-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tab-revisions')).toBeInTheDocument();
    expect(screen.getByTestId('tab-versions')).toBeInTheDocument();
  });

  it('defaults to Revisions tab', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} />);
    expect(screen.getByTestId('tab-revisions')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-versions')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders revisions list on Revisions tab', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} />);
    expect(screen.getByTestId('revisions-list')).toBeInTheDocument();
    expect(screen.getByTestId('revision-item-3')).toBeInTheDocument();
    expect(screen.getByTestId('revision-item-2')).toBeInTheDocument();
    expect(screen.getByTestId('revision-item-1')).toBeInTheDocument();
  });

  it('switches to Versions tab on click', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} />);
    fireEvent.click(screen.getByTestId('tab-versions'));
    expect(screen.getByTestId('tab-versions')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-revisions')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders versions list on Versions tab', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} />);
    fireEvent.click(screen.getByTestId('tab-versions'));
    expect(screen.getByTestId('versions-list')).toBeInTheDocument();
    expect(screen.getByTestId('version-item-2')).toBeInTheDocument();
    expect(screen.getByTestId('version-item-1')).toBeInTheDocument();
  });

  it('shows Revisions empty state when revisions list is empty', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} revisions={[]} />);
    expect(screen.getByTestId('revisions-empty-state')).toBeInTheDocument();
  });

  it('shows Versions empty state when mappingVersions list is empty', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} mappingVersions={[]} />);
    fireEvent.click(screen.getByTestId('tab-versions'));
    expect(screen.getByTestId('versions-empty-state')).toBeInTheDocument();
  });

  it('shows revisions loading skeleton', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} isLoadingRevisions={true} />);
    expect(screen.getByLabelText('Loading revisions')).toBeInTheDocument();
  });

  it('shows versions loading skeleton', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} isLoadingMappingVersions={true} />);
    fireEvent.click(screen.getByTestId('tab-versions'));
    expect(screen.getByLabelText('Loading versions')).toBeInTheDocument();
  });

  it('calls onSelectRevision when a revision item is clicked', () => {
    const onSelectRevision = vi.fn();
    render(<VersionHistoryDrawer {...TAB_PROPS} onSelectRevision={onSelectRevision} />);
    fireEvent.click(screen.getByTestId('revision-item-2'));
    expect(onSelectRevision).toHaveBeenCalledWith(2);
  });

  it('calls onSelectMappingVersion when a version item is clicked', () => {
    const onSelectMappingVersion = vi.fn();
    render(<VersionHistoryDrawer {...TAB_PROPS} onSelectMappingVersion={onSelectMappingVersion} />);
    fireEvent.click(screen.getByTestId('tab-versions'));
    fireEvent.click(screen.getByTestId('version-item-1'));
    expect(onSelectMappingVersion).toHaveBeenCalledWith(1);
  });

  it('does not render legacy body when in tab mode', () => {
    render(<VersionHistoryDrawer {...TAB_PROPS} versions={VERSIONS} />);
    // Legacy empty-state text should not be present
    expect(
      screen.queryByText(/This is the first version/),
    ).not.toBeInTheDocument();
  });
});
