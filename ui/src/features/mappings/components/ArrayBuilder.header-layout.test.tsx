import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArrayBuilder } from './ArrayBuilder';

import type { ParsedSchema } from '@/lib/types/domain';

const EMPTY_PARSED_SCHEMA: ParsedSchema = {
  nodes: [],
  rootType: 'object',
  totalFields: 0,
};

describe('ArrayBuilder header layout parity', () => {
  it('shows scalar-style target name + path rows in array header', () => {
    render(
      <ArrayBuilder
        selectedTargetPath="order.operationHours"
        selectedTargetRequired={true}
        currentStatus="unmapped"
        currentExpression=""
        parsedSourceSchema={EMPTY_PARSED_SCHEMA}
        parsedTargetSchema={EMPTY_PARSED_SCHEMA}
        updateDraft={vi.fn()}
        getDraftExpression={() => null}
        revertDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId('header-target-name')).toHaveTextContent('operationHours');
    expect(screen.getByTestId('header-target-path')).toHaveTextContent('order.operationHours');
    expect(screen.getByTestId('header-required-asterisk')).toBeInTheDocument();
  });
});
