import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { ArrayModeSelector } from './ArrayModeSelector';
import type { ArrayBuilderMode } from '../lib/array-builder-state';

function ControlledSelector({ onSelect }: { onSelect: (mode: ArrayBuilderMode) => void }) {
  const [mode, setMode] = useState<ArrayBuilderMode | null>(null);
  return (
    <ArrayModeSelector
      selectedMode={mode}
      onSelectMode={(next) => {
        onSelect(next);
        setMode(next);
      }}
    />
  );
}

describe('ArrayModeSelector', () => {
  it('renders all mode cards when no mode is selected', () => {
    render(<ArrayModeSelector selectedMode={null} onSelectMode={vi.fn()} />);

    expect(screen.getByTestId('mode-card-map')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-filterMap')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-splitString')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-buildFromValues')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-mergeArrayBranches')).toBeInTheDocument();
  });

  it('collapses to selected summary after choosing a mode', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<ControlledSelector onSelect={onSelect} />);

    await user.click(screen.getByTestId('mode-card-filterMap'));

    expect(onSelect).toHaveBeenCalledWith('filterMap');
    expect(screen.getByTestId('array-mode-selected-summary')).toHaveTextContent('Filter + map');
    expect(screen.queryByTestId('mode-card-map')).not.toBeInTheDocument();
  });

  it('expands from selected summary when clicking Change', async () => {
    const user = userEvent.setup();
    render(<ArrayModeSelector selectedMode="map" onSelectMode={vi.fn()} />);

    expect(screen.getByTestId('array-mode-selected-summary')).toBeInTheDocument();

    await user.click(screen.getByTestId('array-mode-selector-toggle'));

    expect(screen.getByTestId('mode-card-map')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-filterMap')).toBeInTheDocument();
    expect(screen.getByTestId('mode-card-splitString')).toBeInTheDocument();
  });
});
