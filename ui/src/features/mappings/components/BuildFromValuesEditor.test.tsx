import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuildFromValuesEditor } from './BuildFromValuesEditor';
import type { BuildFromValuesCollectionState } from '../lib/array-builder-state';

const BASE_STATE: BuildFromValuesCollectionState = {
  mode: 'buildFromValues',
  entries: [],
  nullFilteringEnabled: false,
};

describe('BuildFromValuesEditor', () => {
  it('adds object-shaped entry rows when target item fields are provided', () => {
    const onCollectionStateChange = vi.fn();

    render(
      <BuildFromValuesEditor
        collectionState={BASE_STATE}
        targetItemFields={[{ name: 'type', type: 'string' }, { name: 'number', type: 'string' }]}
        parsedSourceSchema={null}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    fireEvent.click(screen.getByTestId('add-entry-btn'));

    expect(onCollectionStateChange).toHaveBeenCalledWith({
      mode: 'buildFromValues',
      entries: [
        {
          kind: 'object',
          fields: {
            type: { kind: 'empty' },
            number: { kind: 'empty' },
          },
        },
      ],
      nullFilteringEnabled: false,
    });
  });

  it('renders child field editors inside an object entry', () => {
    const state: BuildFromValuesCollectionState = {
      mode: 'buildFromValues',
      entries: [
        {
          kind: 'object',
          fields: {
            type: { kind: 'empty' },
            number: { kind: 'empty' },
          },
        },
      ],
      nullFilteringEnabled: false,
    };

    render(
      <BuildFromValuesEditor
        collectionState={state}
        targetItemFields={[{ name: 'type', type: 'string' }, { name: 'number', type: 'string' }]}
        parsedSourceSchema={null}
        onCollectionStateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('item-field-row-entry-0.type')).toBeInTheDocument();
    expect(screen.getByTestId('item-field-row-entry-0.number')).toBeInTheDocument();
    expect(screen.queryByLabelText('Static value for Value')).not.toBeInTheDocument();
  });
});
