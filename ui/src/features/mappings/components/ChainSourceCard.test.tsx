/**
 * ChainSourceCard tests — FS-038 T-05 / FS-052 T-03
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChainSourceCard } from './ChainSourceCard';
import type { ChainSourceCardProps } from './ChainSourceCard';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPTION_STATUS: SchemaPathEntry = { path: 'order.status', type: 'string' };
const OPTION_ID: SchemaPathEntry = { path: 'order.id', type: 'number' };
const OPTION_EMAIL: SchemaPathEntry = { path: 'customer.email', type: 'string' };

const DEFAULT_PROPS: ChainSourceCardProps = {
  sourcePath: undefined,
  logicStepCount: 0,
  onSourceSelect: vi.fn(),
  onAddLogic: vi.fn(),
};

function renderCard(overrides: Partial<ChainSourceCardProps> = {}) {
  return render(<ChainSourceCard {...DEFAULT_PROPS} {...overrides} />);
}

/** Seeds PreviewContext with a parsed sourceData value */
function WithSourceData({
  sourceData,
  children,
}: {
  sourceData: unknown | null;
  children: React.ReactNode;
}) {
  const { setSourceData } = usePreviewSetters();
  useEffect(() => {
    setSourceData(sourceData);
  }, [sourceData, setSourceData]);
  return <>{children}</>;
}

function renderCardWithContext(
  overrides: Partial<ChainSourceCardProps> = {},
  sourceData: unknown | null = null,
) {
  return render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <ChainSourceCard {...DEFAULT_PROPS} {...overrides} />
      </WithSourceData>
    </PreviewProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainSourceCard', () => {
  it('renders guidance text when no source is selected', () => {
    renderCard({ sourcePath: undefined });
    expect(screen.getByTestId('chain-source-card-guidance')).toHaveTextContent(
      'Source field',
    );
  });

  it('keeps guidance header visible when source is selected', () => {
    renderCard({ sourcePath: 'order.customerName' });
    expect(screen.getByTestId('chain-source-card-guidance')).toHaveTextContent('Source field');
  });

  it('does not show direct copy status when source has no logic steps', () => {
    renderCard({ sourcePath: 'order.name', logicStepCount: 0 });
    expect(screen.queryByTestId('chain-source-card-status')).not.toBeInTheDocument();
  });

  it('does not show logic step count when source has steps', () => {
    renderCard({ sourcePath: 'order.name', logicStepCount: 2 });
    expect(screen.queryByTestId('chain-source-card-status')).not.toBeInTheDocument();
  });

  it('renders add logic button and triggers callback', async () => {
    const user = userEvent.setup();
    const onAddLogic = vi.fn();
    renderCard({ sourcePath: 'order.name', onAddLogic });

    await user.click(screen.getByTestId('chain-source-card-add-logic'));
    expect(onAddLogic).toHaveBeenCalledTimes(1);
  });

  it('shows dropdown options only after focusing the input', async () => {
    const user = userEvent.setup();
    renderCard({ sourceOptions: [OPTION_STATUS, OPTION_ID] });

    expect(screen.queryByTestId('chain-source-card-dropdown')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('chain-source-card-input'));

    expect(screen.getByTestId('chain-source-card-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('chain-source-card-option-order.status')).toBeInTheDocument();
    expect(screen.getByTestId('chain-source-card-option-order.id')).toBeInTheDocument();
  });

  it('positions the dropdown as an overlay anchored under the input', async () => {
    const user = userEvent.setup();
    renderCard({ sourceOptions: [OPTION_STATUS, OPTION_ID] });

    await user.click(screen.getByTestId('chain-source-card-input'));
    const dropdown = screen.getByTestId('chain-source-card-dropdown');

    expect(dropdown.className).toContain('fixed');
    expect(dropdown.style.top).not.toBe('');
    expect(dropdown.style.left).not.toBe('');
    expect(dropdown.style.width).not.toBe('');
  });

  it('filters source options while typing', async () => {
    const user = userEvent.setup();
    renderCard({ sourceOptions: [OPTION_STATUS, OPTION_ID, OPTION_EMAIL] });

    await user.click(screen.getByTestId('chain-source-card-input'));
    await user.type(screen.getByTestId('chain-source-card-input'), 'order.');

    expect(screen.getByTestId('chain-source-card-option-order.status')).toBeInTheDocument();
    expect(screen.getByTestId('chain-source-card-option-order.id')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-source-card-option-customer.email')).not.toBeInTheDocument();
  });

  it('selects source option on click and closes dropdown', async () => {
    const user = userEvent.setup();
    const onSourceSelect = vi.fn();

    renderCard({
      sourceOptions: [OPTION_STATUS, OPTION_ID],
      onSourceSelect,
    });

    await user.click(screen.getByTestId('chain-source-card-input'));
    await user.click(screen.getByTestId('chain-source-card-option-order.status'));

    expect(onSourceSelect).toHaveBeenCalledWith('order.status');
    expect(screen.queryByTestId('chain-source-card-dropdown')).not.toBeInTheDocument();
  });

  it('calls onSourceSelect when pressing Enter with a typed path', () => {
    const onSourceSelect = vi.fn();

    renderCard({
      sourceOptions: [OPTION_STATUS, OPTION_ID],
      onSourceSelect,
    });

    const input = screen.getByTestId('chain-source-card-input');
    fireEvent.change(input, { target: { value: 'order.customer.email' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSourceSelect).toHaveBeenCalledWith('order.customer.email');
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderCard({ sourceOptions: [OPTION_STATUS, OPTION_ID] });

    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.getByTestId('chain-source-card-dropdown')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByTestId('chain-source-card-dropdown')).not.toBeInTheDocument();
  });

  it('accepts dropped source field path', () => {
    const onSourceSelect = vi.fn();
    renderCard({ sourcePath: undefined, onSourceSelect });

    const dropZone = screen.getByTestId('chain-source-card');
    fireEvent.dragEnter(dropZone);
    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: () => 'order.status' },
    });

    expect(onSourceSelect).toHaveBeenCalledWith('order.status');
  });
});

// ---------------------------------------------------------------------------
// FS-052 T-03: type badges and test data
// ---------------------------------------------------------------------------

describe('ChainSourceCard — FS-052 T-03 type badges and test data', () => {
  it('renders 3-letter type badge (str) in dropdown for string fields', async () => {
    const user = userEvent.setup();
    renderCardWithContext({ sourceOptions: [OPTION_STATUS] });
    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.getByText('str')).toBeInTheDocument();
  });

  it('renders 3-letter type badge (num) in dropdown for number fields', async () => {
    const user = userEvent.setup();
    renderCardWithContext({ sourceOptions: [OPTION_ID] });
    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.getByText('num')).toBeInTheDocument();
  });

  it('shows resolved test value in dropdown when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderCardWithContext(
      { sourceOptions: [OPTION_STATUS] },
      { order: { status: 'active', id: 42 } },
    );
    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.getByText('"active"')).toBeInTheDocument();
  });

  it('does not show test data zone when PreviewContext sourceData is null', async () => {
    const user = userEvent.setup();
    renderCardWithContext({ sourceOptions: [OPTION_STATUS] }, null);
    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });

  it('renders without crashing when rendered outside PreviewProvider', async () => {
    const user = userEvent.setup();
    renderCard({ sourceOptions: [OPTION_STATUS] });
    await user.click(screen.getByTestId('chain-source-card-input'));
    expect(screen.getByTestId('chain-source-card-dropdown')).toBeInTheDocument();
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });
});
