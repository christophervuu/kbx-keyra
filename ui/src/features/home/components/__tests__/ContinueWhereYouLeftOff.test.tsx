// ContinueWhereYouLeftOff.test.tsx — Component tests (FS-049 T-03)

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ContinueWhereYouLeftOff } from '../ContinueWhereYouLeftOff';
import type { RecentActivityEntry } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<RecentActivityEntry> = {}): RecentActivityEntry {
  return {
    type: 'project',
    id: 'p1',
    name: 'Project Alpha',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    ...overrides,
  };
}

const FIVE_ITEMS: RecentActivityEntry[] = [
  makeEntry({ id: 'p1', name: 'Project Alpha', timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString() }),
  makeEntry({ id: 'p2', name: 'Project Beta', timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() }),
  makeEntry({ type: 'mapping', id: 'm1', projectId: 'p1', name: 'Mapping One', timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString() }),
  makeEntry({ id: 'p3', name: 'Project Gamma', timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() }),
  makeEntry({ id: 'p4', name: 'Project Delta', timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString() }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContinueWhereYouLeftOff', () => {
  it('returns null (renders nothing) when items is empty', () => {
    const { container } = render(
      <ContinueWhereYouLeftOff items={[]} onItemClick={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders root element with data-testid="continue-where-you-left-off"', () => {
    render(<ContinueWhereYouLeftOff items={[makeEntry()]} onItemClick={vi.fn()} />);
    expect(screen.getByTestId('continue-where-you-left-off')).toBeInTheDocument();
  });

  it('renders at most 3 items when given 5 entries', () => {
    render(<ContinueWhereYouLeftOff items={FIVE_ITEMS} onItemClick={vi.fn()} />);
    expect(screen.getByTestId('recent-item-project-p1')).toBeInTheDocument();
    expect(screen.getByTestId('recent-item-project-p2')).toBeInTheDocument();
    expect(screen.getByTestId('recent-item-mapping-m1')).toBeInTheDocument();
    // 4th and 5th should not be rendered
    expect(screen.queryByTestId('recent-item-project-p3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-item-project-p4')).not.toBeInTheDocument();
  });

  it('renders item names', () => {
    render(<ContinueWhereYouLeftOff items={FIVE_ITEMS} onItemClick={vi.fn()} />);
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('Project Beta')).toBeInTheDocument();
    expect(screen.getByText('Mapping One')).toBeInTheDocument();
  });

  it('calls onItemClick with the correct entry when a card is clicked', async () => {
    const onItemClick = vi.fn();
    render(<ContinueWhereYouLeftOff items={FIVE_ITEMS} onItemClick={onItemClick} />);

    await userEvent.click(screen.getByTestId('recent-item-mapping-m1'));

    expect(onItemClick).toHaveBeenCalledOnce();
    expect(onItemClick).toHaveBeenCalledWith(FIVE_ITEMS[2]);
  });

  it('shows relative timestamps', () => {
    render(<ContinueWhereYouLeftOff items={[makeEntry()]} onItemClick={vi.fn()} />);
    // 5 min ago → "5m ago"
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('renders "just now" for very recent entries', () => {
    const entry = makeEntry({ timestamp: new Date(Date.now() - 10 * 1000).toISOString() }); // 10s ago
    render(<ContinueWhereYouLeftOff items={[entry]} onItemClick={vi.fn()} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders section heading', () => {
    render(<ContinueWhereYouLeftOff items={[makeEntry()]} onItemClick={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /continue where you left off/i })).toBeInTheDocument();
  });

  it('each card is a keyboard-focusable button', () => {
    render(<ContinueWhereYouLeftOff items={[makeEntry()]} onItemClick={vi.fn()} />);
    const btn = screen.getByTestId('recent-item-project-p1');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).not.toBeDisabled();
  });

  it('renders data-testid with correct type and id for mapping entries', () => {
    const entry = makeEntry({ type: 'mapping', id: 'map-42', projectId: 'proj-1', name: 'My Map' });
    render(<ContinueWhereYouLeftOff items={[entry]} onItemClick={vi.fn()} />);
    expect(screen.getByTestId('recent-item-mapping-map-42')).toBeInTheDocument();
  });
});
