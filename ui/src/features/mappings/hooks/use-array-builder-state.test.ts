import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useArrayBuilderState } from './use-array-builder-state';
import type { ObjectFieldsCollectionState } from '../lib/array-builder-state';

function makeOptions(overrides?: Partial<Parameters<typeof useArrayBuilderState>[0]>) {
  return {
    targetPath: 'operationHours',
    getDraftExpression: vi.fn(() => null),
    currentExpression: '',
    updateDraft: vi.fn(),
    onExpressionChange: vi.fn(),
    parsedSourceSchema: null,
    targetArrayNode: null,
    ...overrides,
  } as Parameters<typeof useArrayBuilderState>[0];
}

describe('useArrayBuilderState — objectFields mode plumbing (FS-104 T-01)', () => {
  it('selectMode switches to objectFields with default collection state', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useArrayBuilderState(options));

    act(() => {
      result.current.selectMode('objectFields');
    });

    expect(result.current.state.mode).toBe('objectFields');
    expect(result.current.state.collectionState.mode).toBe('objectFields');
    if (result.current.state.collectionState.mode === 'objectFields') {
      expect(result.current.state.collectionState.parent.input.kind).toBe('primary');
      expect(result.current.state.collectionState.parent.objectPath).toBe('');
      expect(result.current.state.collectionState.orderedChildKeys).toEqual([]);
      expect(result.current.state.collectionState.missingBehavior).toBe('skip-null-or-absent');
    }
  });

  it('setObjectFieldsState updates objectFields collection state and completion', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useArrayBuilderState(options));

    act(() => {
      result.current.selectMode('objectFields');
    });

    const nextState: ObjectFieldsCollectionState = {
      mode: 'objectFields',
      parent: {
        input: { kind: 'enrichment', alias: 'facilityMetadata' },
        objectPath: 'DeliveryWeeklyOperation',
      },
      orderedChildKeys: ['Sunday', 'Monday'],
      missingBehavior: 'skip-null-or-absent',
      inclusionPredicate: {
        kind: 'structured',
        left: { kind: 'expression', dsl: 'get(item("value"), "IsOpen")' },
        operator: 'eq',
        right: { kind: 'static', value: 'true' },
      },
    };

    act(() => {
      result.current.setObjectFieldsState(nextState);
    });

    expect(result.current.state.collectionState).toEqual(nextState);
    expect(result.current.state.completionStatus).toBe('inProgress');
  });

  it('setObjectFieldsState is a no-op outside objectFields mode', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useArrayBuilderState(options));

    const before = result.current.state;
    const nextState: ObjectFieldsCollectionState = {
      mode: 'objectFields',
      parent: {
        input: { kind: 'primary' },
        objectPath: 'DeliveryWeeklyOperation',
      },
      orderedChildKeys: ['Sunday'],
      missingBehavior: 'skip-null-or-absent',
    };

    act(() => {
      result.current.setObjectFieldsState(nextState);
    });

    expect(result.current.state).toEqual(before);
  });

  it('hydrates unrecognized expressions into customExpression mode with fallback flag', () => {
    const options = makeOptions({
      currentExpression: 'flatten(map(source("items"), {}))',
    });

    const { result } = renderHook(() => useArrayBuilderState(options));

    expect(result.current.state.mode).toBe('customExpression');
    expect(result.current.isFromUnrecognized).toBe(true);
    expect(result.current.state.collectionState.mode).toBe('customExpression');
    if (result.current.state.collectionState.mode === 'customExpression') {
      expect(result.current.state.collectionState.rawExpression).toBe(
        'flatten(map(source("items"), {}))',
      );
    }
  });

  it('clears unrecognized fallback flag after custom expression edit', () => {
    const options = makeOptions({
      currentExpression: 'flatten(map(source("items"), {}))',
    });
    const { result } = renderHook(() => useArrayBuilderState(options));

    expect(result.current.isFromUnrecognized).toBe(true);

    act(() => {
      result.current.setCustomExpression('map(source("items"), {})');
    });

    expect(result.current.isFromUnrecognized).toBe(false);
  });
});
