import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MergeBranchEditor } from './MergeBranchEditor';
import { createEmptyMergeBranch } from '../lib/array-builder-state';
import type { MergeBranch } from '../lib/array-builder-state';
import type { SchemaTreeNode } from '@/lib/types/domain';

function makeNode(path: string, fieldName: string, type: SchemaTreeNode['type']): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
    depth: 0,
    isArray: type === 'array',
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
  };
}

function makeTargetArrayNode(): SchemaTreeNode {
  return {
    path: 'stops',
    fieldName: 'stops',
    type: 'array',
    depth: 0,
    isArray: true,
    isRequired: false,
    parentPath: null,
    childCount: 2,
    children: [
      makeNode('stops.city', 'city', 'string'),
      makeNode('stops.country', 'country', 'string'),
    ],
  };
}

describe('MergeBranchEditor', () => {
  it('renders target item field rows inside the branch editor', () => {
    const branch = createEmptyMergeBranch();

    render(
      <MergeBranchEditor
        branch={branch}
        branchIndex={0}
        totalBranches={2}
        parsedSourceSchema={null}
        targetArrayNode={makeTargetArrayNode()}
        onBranchChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId('item-field-row-stops.city')).toBeInTheDocument();
    expect(screen.getByTestId('item-field-row-stops.country')).toBeInTheDocument();
    expect(screen.queryByTestId('branch-item-template-placeholder-0')).not.toBeInTheDocument();
  });

  it('updates branch item template when a field mapping is edited', () => {
    const onBranchChange = vi.fn();
    const branch: MergeBranch = {
      ...createEmptyMergeBranch(),
      sourceArrayPath: 'domesticStops',
    };

    render(
      <MergeBranchEditor
        branch={branch}
        branchIndex={0}
        totalBranches={2}
        parsedSourceSchema={null}
        targetArrayNode={makeTargetArrayNode()}
        onBranchChange={onBranchChange}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-toggle-0'));
    fireEvent.click(screen.getByTestId('item-field-toggle-stops.city'));
    fireEvent.click(screen.getByTestId('logic-type-btn-static'));
    fireEvent.change(screen.getByTestId('static-input-stops.city'), {
      target: { value: 'NYC' },
    });

    const lastCall = onBranchChange.mock.calls[onBranchChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe(0);
    expect(lastCall[1].itemTemplate.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'chain',
          targetFieldPath: 'stops.city',
          chainState: expect.objectContaining({
            source: { kind: 'static', value: { type: 'string', value: 'NYC' } },
          }),
        }),
      ]),
    );
  });

  it('supports External logic type for branch field mappings', () => {
    const onBranchChange = vi.fn();
    const branch: MergeBranch = {
      ...createEmptyMergeBranch(),
      sourceArrayPath: 'internationalStops',
    };

    render(
      <MergeBranchEditor
        branch={branch}
        branchIndex={0}
        totalBranches={2}
        parsedSourceSchema={null}
        targetArrayNode={makeTargetArrayNode()}
        onBranchChange={onBranchChange}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('branch-toggle-0'));
    fireEvent.click(screen.getByTestId('item-field-toggle-stops.city'));
    fireEvent.click(screen.getByTestId('logic-type-btn-external'));
    fireEvent.change(screen.getByTestId('expression-input-stops.city'), {
      target: { value: 'external("internationalProvider.city")' },
    });

    const lastCall = onBranchChange.mock.calls[onBranchChange.mock.calls.length - 1];
    expect(lastCall[1].itemTemplate.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'expression',
          targetFieldPath: 'stops.city',
          dsl: 'external("internationalProvider.city")',
        }),
      ]),
    );
  });
});
