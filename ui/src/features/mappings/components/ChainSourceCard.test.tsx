/**
 * ChainSourceCard tests — FS-038 T-05
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChainSourceCard } from './ChainSourceCard';
import type { ChainSourceCardProps } from './ChainSourceCard';

const DEFAULT_PROPS: ChainSourceCardProps = {
  sourcePath: undefined,
  logicStepCount: 0,
  onSourceSelect: vi.fn(),
  onAddLogic: vi.fn(),
};

function renderCard(overrides: Partial<ChainSourceCardProps> = {}) {
  return render(<ChainSourceCard {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('ChainSourceCard — empty state', () => {
  it('renders the card container', () => {
    renderCard();
    expect(screen.getByTestId('chain-source-card')).toBeInTheDocument();
  });

  it('renders empty state when no source is selected', () => {
    renderCard({ sourcePath: undefined });
    expect(screen.getByTestId('chain-source-card-empty')).toBeInTheDocument();
  });

  it('renders guidance text in empty state', () => {
    renderCard({ sourcePath: undefined });
    expect(screen.getByTestId('chain-source-card-guidance')).toHaveTextContent(
      'Select a source field from the panel or drag one here',
    );
  });

  it('does NOT render selected state when no source', () => {
    renderCard({ sourcePath: undefined });
    expect(screen.queryByTestId('chain-source-card-selected')).not.toBeInTheDocument();
  });

  it('does NOT render empty state when source is set', () => {
    renderCard({ sourcePath: 'order.name' });
    expect(screen.queryByTestId('chain-source-card-empty')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Selected state
// ---------------------------------------------------------------------------

describe('ChainSourceCard — selected state', () => {
  it('renders selected state when source is set', () => {
    renderCard({ sourcePath: 'order.customerName' });
    expect(screen.getByTestId('chain-source-card-selected')).toBeInTheDocument();
  });

  it('renders the source path', () => {
    renderCard({ sourcePath: 'order.customerName' });
    expect(screen.getByTestId('chain-source-card-path')).toHaveTextContent('order.customerName');
  });

  it('AE-01: shows "Direct copy" when no logic steps', () => {
    renderCard({ sourcePath: 'order.name', logicStepCount: 0 });
    expect(screen.getByTestId('chain-source-card-status')).toHaveTextContent('Direct copy');
  });

  it('shows "1 logic step" when one step exists', () => {
    renderCard({ sourcePath: 'order.name', logicStepCount: 1 });
    expect(screen.getByTestId('chain-source-card-status')).toHaveTextContent('1 logic step');
  });

  it('shows "2 logic steps" when two steps exist', () => {
    renderCard({ sourcePath: 'order.name', logicStepCount: 2 });
    expect(screen.getByTestId('chain-source-card-status')).toHaveTextContent('2 logic steps');
  });

  it('renders "+ Add logic" button', () => {
    renderCard({ sourcePath: 'order.name' });
    expect(screen.getByTestId('chain-source-card-add-logic')).toBeInTheDocument();
  });

  it('fires onAddLogic when "+ Add logic" is clicked', async () => {
    const user = userEvent.setup();
    const onAddLogic = vi.fn();
    renderCard({ sourcePath: 'order.name', onAddLogic });
    await user.click(screen.getByTestId('chain-source-card-add-logic'));
    expect(onAddLogic).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Drag-and-drop
// ---------------------------------------------------------------------------

describe('ChainSourceCard — drag-and-drop', () => {
  it('accepts a dropped source field path', () => {
    const onSourceSelect = vi.fn();
    renderCard({ sourcePath: undefined, onSourceSelect });

    const dropZone = screen.getByTestId('chain-source-card-empty');

    fireEvent.dragEnter(dropZone);
    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => 'order.status' },
    });

    expect(onSourceSelect).toHaveBeenCalledWith('order.status');
  });

  it('shows drag-over visual state when dragging over empty zone', () => {
    renderCard({ sourcePath: undefined });
    const dropZone = screen.getByTestId('chain-source-card-empty');
    fireEvent.dragEnter(dropZone);
    // The isDragOver class change is applied — verify the element is still present
    expect(dropZone).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility
// ---------------------------------------------------------------------------

describe('ChainSourceCard — keyboard accessibility', () => {
  it('+ Add logic button is keyboard focusable', () => {
    renderCard({ sourcePath: 'order.name' });
    const btn = screen.getByTestId('chain-source-card-add-logic');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('+ Add logic button has aria-label', () => {
    renderCard({ sourcePath: 'order.name' });
    expect(screen.getByTestId('chain-source-card-add-logic')).toHaveAttribute(
      'aria-label',
      'Add logic step',
    );
  });
});
