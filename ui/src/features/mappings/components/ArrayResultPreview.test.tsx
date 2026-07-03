import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArrayResultPreview } from './ArrayResultPreview';
import type { ObjectFieldsCollectionState } from '../lib/array-builder-state';

function makeObjectFieldsState(orderedChildKeys: readonly string[]): ObjectFieldsCollectionState {
  return {
    mode: 'objectFields',
    parent: { input: { kind: 'primary' }, objectPath: 'DeliveryWeeklyOperation' },
    orderedChildKeys,
    missingBehavior: 'skip-null-or-absent',
  };
}

describe('ArrayResultPreview — objectFields summary', () => {
  it('shows configured/included/skipped/generated counts and output order', () => {
    render(
      <ArrayResultPreview
        result={[{ operationDayValue: 'Sunday' }, { operationDayValue: 'Tuesday' }]}
        error={null}
        isEvaluating={false}
        sourceData={{
          DeliveryWeeklyOperation: {
            Sunday: { IsOpen: false },
            Monday: null,
            Tuesday: { IsOpen: true },
          },
        }}
        mode="objectFields"
        expression='map(filter(map(array("Sunday", "Monday", "Tuesday"), {"day": item(""), "value": get(source("DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day")})'
        objectFieldsState={makeObjectFieldsState(['Sunday', 'Monday', 'Tuesday'])}
      />,
    );

    expect(screen.getByTestId('array-preview-of-configured')).toHaveTextContent('3');
    expect(screen.getByTestId('array-preview-of-included')).toHaveTextContent('2');
    expect(screen.getByTestId('array-preview-of-skipped')).toHaveTextContent('1');
    expect(screen.getByTestId('array-preview-of-generated')).toHaveTextContent('2');
    expect(screen.getByTestId('array-preview-of-order')).toHaveTextContent('Sunday, Tuesday');
  });

  it('shows parent-missing empty summary without noisy child-level messaging', () => {
    render(
      <ArrayResultPreview
        result={[]}
        error={null}
        isEvaluating={false}
        sourceData={{}}
        mode="objectFields"
        expression='map(filter(map(array("Sunday", "Monday"), {"day": item(""), "value": get(source("DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day")})'
        objectFieldsState={makeObjectFieldsState(['Sunday', 'Monday'])}
      />,
    );

    expect(screen.getByTestId('array-preview-of-configured')).toHaveTextContent('2');
    expect(screen.getByTestId('array-preview-of-included')).toHaveTextContent('0');
    expect(screen.getByTestId('array-preview-of-skipped')).toHaveTextContent('2');
    expect(screen.getByTestId('array-preview-of-generated')).toHaveTextContent('0');
    expect(screen.getByTestId('array-preview-of-order')).toHaveTextContent('(none)');
    expect(screen.getByText('Parent object is missing in source data; configured fields were skipped.')).toBeInTheDocument();
  });
});
