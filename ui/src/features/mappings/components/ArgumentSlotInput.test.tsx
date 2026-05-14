/**
 * ArgumentSlotInput.test.tsx — FS-052 T-04
 *
 * Tests that ArgumentSlotInput renders SourceFieldOptionRow (type badge + test data)
 * in its source-mode field picker dropdown.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ArgumentSlotInput } from './ArgumentSlotInput';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';
import type { SchemaPathEntry } from '../lib/autocomplete-utils';
import type { ArgumentSlot } from '../lib/expression-builder-state';
import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SOURCE_OPTIONS: readonly SchemaPathEntry[] = [
  { path: 'user.name', type: 'string' },
  { path: 'user.age', type: 'number' },
  { path: 'user.active', type: 'boolean' },
];

const STRING_PARAM: FunctionCatalogParameter = {
  name: 'value',
  type: 'string',
  required: true,
};

const SOURCE_SLOT: ArgumentSlot = { mode: 'source', path: '' };

function WithSourceData({
  sourceData,
  children,
}: {
  sourceData: unknown | null;
  children: React.ReactNode;
}) {
  const { setSourceData } = usePreviewSetters();
  useEffect(() => { setSourceData(sourceData); }, [sourceData, setSourceData]);
  return <>{children}</>;
}

function renderSlot(sourceData: unknown | null = null) {
  render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <ArgumentSlotInput
          slotIndex={0}
          slot={SOURCE_SLOT}
          parameter={STRING_PARAM}
          sourceOptions={SOURCE_OPTIONS}
          onSlotChange={vi.fn()}
          testIdPrefix="arg-slot"
        />
      </WithSourceData>
    </PreviewProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — FS-052 T-04 SourceFieldOptionRow', () => {
  it('renders type badge (str) for string source options in picker', async () => {
    const user = userEvent.setup();
    renderSlot();
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    expect(screen.getAllByText('str').length).toBeGreaterThan(0);
  });

  it('renders type badge (num) for number source options in picker', async () => {
    const user = userEvent.setup();
    renderSlot();
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    expect(screen.getByText('num')).toBeInTheDocument();
  });

  it('renders type badge (bool) for boolean source options in picker', async () => {
    const user = userEvent.setup();
    renderSlot();
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    expect(screen.getByText('bool')).toBeInTheDocument();
  });

  it('shows test value in picker when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderSlot({ user: { name: 'Alice', age: 30, active: true } });
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it('does not show test value when sourceData is null', async () => {
    const user = userEvent.setup();
    renderSlot(null);
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    expect(screen.queryByText('"Alice"')).not.toBeInTheDocument();
  });

  it('selecting a source option calls onSlotChange with the path', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <PreviewProvider>
        <ArgumentSlotInput
          slotIndex={0}
          slot={SOURCE_SLOT}
          parameter={STRING_PARAM}
          sourceOptions={SOURCE_OPTIONS}
          onSlotChange={onSlotChange}
          testIdPrefix="arg-slot"
        />
      </PreviewProvider>,
    );
    await user.click(screen.getByTestId('arg-slot-0-source-input'));
    await user.click(screen.getByTestId('arg-slot-0-source-option-user.name'));
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'source', path: 'user.name' }),
    );
  });
});
