import { describe, expect, it } from 'vitest';

import type { ArrayBuilderState, ItemTemplateState, ObjectFieldsCollectionState } from './array-builder-state';
import { deriveArrayValidation } from './array-validation';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

function makeParsedSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'DeliveryWeeklyOperation',
        fieldName: 'DeliveryWeeklyOperation',
        type: 'object',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 2,
        children: [
          {
            path: 'DeliveryWeeklyOperation.Sunday',
            fieldName: 'Sunday',
            type: 'object',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'DeliveryWeeklyOperation',
            childCount: 0,
            children: [],
          },
          {
            path: 'DeliveryWeeklyOperation.Monday',
            fieldName: 'Monday',
            type: 'object',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'DeliveryWeeklyOperation',
            childCount: 0,
            children: [],
          },
        ],
      },
    ],
    totalFieldCount: 3,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function makeTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'schedule',
    fieldName: 'schedule',
    type: 'array',
    depth: 0,
    isArray: true,
    isRequired: false,
    parentPath: null,
    childCount: 1,
    children: [
      {
        path: 'operationDayValue',
        fieldName: 'operationDayValue',
        type: 'string',
        depth: 1,
        isArray: false,
        isRequired: true,
        parentPath: 'schedule',
        childCount: 0,
        children: [],
      },
    ],
  };
}

function makeState(collectionState: ObjectFieldsCollectionState, itemTemplate?: ItemTemplateState): ArrayBuilderState {
  return {
    mode: 'objectFields',
    collectionState,
    itemTemplate: itemTemplate ?? { fields: [], nestedArrays: new Map() },
    completionStatus: 'inProgress',
  };
}

describe('deriveArrayValidation — objectFields collection checks', () => {
  it('marks missing parent path as incomplete', () => {
    const state = makeState({
      mode: 'objectFields',
      parent: { input: { kind: 'primary' }, objectPath: '' },
      orderedChildKeys: ['Sunday'],
      missingBehavior: 'skip-null-or-absent',
    });

    const result = deriveArrayValidation(state, '', makeParsedSourceSchema(), makeTargetArrayNode());
    expect(result.entries.some((entry) => entry.message.includes('No parent object selected.'))).toBe(true);
  });

  it('marks no selected object fields as incomplete', () => {
    const state = makeState({
      mode: 'objectFields',
      parent: { input: { kind: 'primary' }, objectPath: 'DeliveryWeeklyOperation' },
      orderedChildKeys: [],
      missingBehavior: 'skip-null-or-absent',
    });

    const result = deriveArrayValidation(state, '', makeParsedSourceSchema(), makeTargetArrayNode());
    expect(result.entries.some((entry) => entry.message.includes('No object fields selected.'))).toBe(true);
  });

  it('flags duplicate selected keys as error', () => {
    const state = makeState({
      mode: 'objectFields',
      parent: { input: { kind: 'primary' }, objectPath: 'DeliveryWeeklyOperation' },
      orderedChildKeys: ['Sunday', 'Sunday'],
      missingBehavior: 'skip-null-or-absent',
    });

    const result = deriveArrayValidation(state, '', makeParsedSourceSchema(), makeTargetArrayNode());
    expect(result.entries.some((entry) => entry.severity === 'error' && entry.message.includes('contains duplicates'))).toBe(true);
  });

  it('warns for selected child keys that are missing from schema under parent', () => {
    const state = makeState({
      mode: 'objectFields',
      parent: { input: { kind: 'primary' }, objectPath: 'DeliveryWeeklyOperation' },
      orderedChildKeys: ['Sunday', 'Wednesday'],
      missingBehavior: 'skip-null-or-absent',
    });

    const result = deriveArrayValidation(state, '', makeParsedSourceSchema(), makeTargetArrayNode());
    expect(result.entries.some((entry) => entry.severity === 'warning' && entry.message.includes('Wednesday'))).toBe(true);
  });
});
