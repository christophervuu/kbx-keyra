import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ObjectFieldsCollectionEditor } from './ObjectFieldsCollectionEditor';
import type { ObjectFieldsCollectionState } from '../lib/array-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

const SOURCE_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  parseTimeMs: 1,
  inferred: false,
  totalFieldCount: 8,
  nodes: [
    {
      path: 'weeklyOperation',
      fieldName: 'weeklyOperation',
      type: 'object',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 3,
      children: [
        {
          path: 'weeklyOperation.Sunday',
          fieldName: 'Sunday',
          type: 'object',
          depth: 1,
          isArray: false,
          isRequired: false,
          parentPath: 'weeklyOperation',
          childCount: 1,
          children: [
            {
              path: 'weeklyOperation.Sunday.BeginTime',
              fieldName: 'BeginTime',
              type: 'string',
              depth: 2,
              isArray: false,
              isRequired: false,
              parentPath: 'weeklyOperation.Sunday',
              childCount: 0,
              children: [],
            },
          ],
        },
        {
          path: 'weeklyOperation.Monday',
          fieldName: 'Monday',
          type: 'object',
          depth: 1,
          isArray: false,
          isRequired: false,
          parentPath: 'weeklyOperation',
          childCount: 0,
          children: [],
        },
        {
          path: 'weeklyOperation.Tuesday',
          fieldName: 'Tuesday',
          type: 'object',
          depth: 1,
          isArray: false,
          isRequired: false,
          parentPath: 'weeklyOperation',
          childCount: 0,
          children: [],
        },
      ],
    },
    {
      path: 'otherRoot',
      fieldName: 'otherRoot',
      type: 'object',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 0,
      children: [],
    },
  ],
};

const BASE_STATE: ObjectFieldsCollectionState = {
  mode: 'objectFields',
  parent: {
    input: { kind: 'primary' },
    objectPath: '',
  },
  orderedChildKeys: [],
  missingBehavior: 'skip-null-or-absent',
};

describe('ObjectFieldsCollectionEditor', () => {
  it('shows parent guidance when no parent is selected', () => {
    render(
      <ObjectFieldsCollectionEditor
        collectionState={BASE_STATE}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('object-fields-parent-guidance')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-parent-select')).toBeInTheDocument();
  });

  it('selects parent, toggles child keys, and reorders selected keys', async () => {
    const user = userEvent.setup();
    const onCollectionStateChange = vi.fn();

    const withParent: ObjectFieldsCollectionState = {
      ...BASE_STATE,
      parent: { input: { kind: 'primary' }, objectPath: 'weeklyOperation' },
      orderedChildKeys: ['Sunday', 'Monday'],
    };

    render(
      <ObjectFieldsCollectionEditor
        collectionState={withParent}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    expect(screen.getByTestId('object-fields-child-list')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-child-Sunday')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-child-Monday')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-child-Tuesday')).toBeInTheDocument();

    await user.click(screen.getByTestId('object-fields-child-Tuesday'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withParent,
      orderedChildKeys: ['Sunday', 'Monday', 'Tuesday'],
    });

    await user.click(screen.getByTestId('object-fields-remove-Sunday'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withParent,
      orderedChildKeys: ['Monday'],
    });

    await user.click(screen.getByTestId('object-fields-move-down-Sunday'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withParent,
      orderedChildKeys: ['Monday', 'Sunday'],
    });
  });

  it('supports select all and clear all', async () => {
    const user = userEvent.setup();
    const onCollectionStateChange = vi.fn();

    const withParent: ObjectFieldsCollectionState = {
      ...BASE_STATE,
      parent: { input: { kind: 'primary' }, objectPath: 'weeklyOperation' },
      orderedChildKeys: [],
    };

    const { rerender } = render(
      <ObjectFieldsCollectionEditor
        collectionState={withParent}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    await user.click(screen.getByTestId('object-fields-select-all'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withParent,
      orderedChildKeys: ['Sunday', 'Monday', 'Tuesday'],
    });

    const withSelection: ObjectFieldsCollectionState = {
      ...withParent,
      orderedChildKeys: ['Sunday', 'Monday'],
    };

    rerender(
      <ObjectFieldsCollectionEditor
        collectionState={withSelection}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    await user.click(screen.getByTestId('object-fields-clear-all'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withSelection,
      orderedChildKeys: [],
    });
  });

  it('preserves and shows unresolved selected keys after schema drift for repair', () => {
    const withUnresolvedSelection: ObjectFieldsCollectionState = {
      ...BASE_STATE,
      parent: { input: { kind: 'primary' }, objectPath: 'weeklyOperation' },
      orderedChildKeys: ['Sunday', 'Wednesday'],
    };

    render(
      <ObjectFieldsCollectionEditor
        collectionState={withUnresolvedSelection}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('object-fields-selected-Sunday')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-selected-Wednesday')).toBeInTheDocument();
    expect(screen.queryByTestId('object-fields-child-Wednesday')).not.toBeInTheDocument();
  });

  it('shows explicit inclusion defaults and supports optional inclusion condition', async () => {
    const user = userEvent.setup();
    const onCollectionStateChange = vi.fn();

    const withParent: ObjectFieldsCollectionState = {
      ...BASE_STATE,
      parent: { input: { kind: 'primary' }, objectPath: 'weeklyOperation' },
      orderedChildKeys: ['Sunday'],
    };

    render(
      <ObjectFieldsCollectionEditor
        collectionState={withParent}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    expect(screen.getByTestId('object-fields-inclusion-section')).toBeInTheDocument();
    expect(screen.getByTestId('object-fields-default-inclusion-text')).toHaveTextContent(
      'Always includes only selected keys where the resolved value is not null or absent.',
    );

    await user.click(screen.getByTestId('object-fields-enable-inclusion-predicate'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withParent,
      inclusionPredicate: {
        kind: 'structured',
        left: { kind: 'itemField', fieldPath: '' },
        operator: 'eq',
        right: { kind: 'none' },
      },
    });
  });

  it('updates inclusion predicate fields when condition is enabled', async () => {
    const user = userEvent.setup();
    const onCollectionStateChange = vi.fn();

    const withCondition: ObjectFieldsCollectionState = {
      ...BASE_STATE,
      parent: { input: { kind: 'primary' }, objectPath: 'weeklyOperation' },
      orderedChildKeys: ['Sunday'],
      inclusionPredicate: {
        kind: 'structured',
        left: { kind: 'itemField', fieldPath: 'value.IsOpen' },
        operator: 'eq',
        right: { kind: 'static', value: 'true' },
      },
    };

    render(
      <ObjectFieldsCollectionEditor
        collectionState={withCondition}
        parsedSourceSchema={SOURCE_SCHEMA}
        onCollectionStateChange={onCollectionStateChange}
      />,
    );

    await user.clear(screen.getByTestId('object-fields-inclusion-left-field'));
    expect(onCollectionStateChange).toHaveBeenCalledWith({
      ...withCondition,
      inclusionPredicate: {
        kind: 'structured',
        left: { kind: 'itemField', fieldPath: '' },
        operator: 'eq',
        right: { kind: 'static', value: 'true' },
      },
    });

    await user.selectOptions(screen.getByTestId('object-fields-inclusion-operator'), 'isNotNull');
    expect(onCollectionStateChange).toHaveBeenLastCalledWith({
      ...withCondition,
      inclusionPredicate: {
        kind: 'structured',
        left: { kind: 'itemField', fieldPath: 'value.IsOpen' },
        operator: 'isNotNull',
        right: { kind: 'none' },
      },
    });
  });
});
