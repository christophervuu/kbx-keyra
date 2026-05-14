import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FilterPredicateEditor } from './FilterPredicateEditor';
import type { FilterPredicateState } from '../lib/array-builder-state';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';

import type { ParsedSchema } from '@/lib/types/domain';

function createParsedSourceSchema(): ParsedSchema {
  return {
    nodes: [
      {
        path: 'items',
        fieldName: 'items',
        type: 'array',
        depth: 0,
        isArray: true,
        isRequired: false,
        parentPath: null,
        childCount: 2,
        children: [
          {
            path: 'items.sku',
            fieldName: 'sku',
            type: 'string',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'items',
            childCount: 0,
            children: [],
          },
          {
            path: 'items.qty',
            fieldName: 'qty',
            type: 'number',
            depth: 1,
            isArray: false,
            isRequired: false,
            parentPath: 'items',
            childCount: 0,
            children: [],
          },
        ],
      },
      {
        path: 'meta.status',
        fieldName: 'status',
        type: 'string',
        depth: 0,
        isArray: false,
        isRequired: false,
        parentPath: null,
        childCount: 0,
        children: [],
      },
    ],
    totalFieldCount: 3,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
  };
}

function createPredicate(): FilterPredicateState {
  return {
    kind: 'structured',
    left: { kind: 'itemField', fieldPath: '' },
    operator: 'eq',
    right: { kind: 'static', value: '' },
  };
}

describe('FilterPredicateEditor', () => {
  it('shows item-field dropdown options derived from selected source array', async () => {
    const user = userEvent.setup();
    const onPredicateChange = vi.fn();

    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath="items"
        onPredicateChange={onPredicateChange}
      />,
    );

    const fieldSelect = screen.getByTestId('filter-left-operand');
    expect(fieldSelect).toHaveTextContent('sku');
    expect(fieldSelect).toHaveTextContent('qty');
    expect(fieldSelect).not.toHaveTextContent('meta.status');

    await user.selectOptions(fieldSelect, 'sku');

    expect(onPredicateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        left: { kind: 'itemField', fieldPath: 'sku' },
      }),
    );
  });

  it('disables field dropdown when source array is not selected', () => {
    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath=""
        onPredicateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('filter-left-operand')).toBeDisabled();
  });

  it('shows Source, Static, and External value options with External disabled', () => {
    render(
      <FilterPredicateEditor
        predicate={createPredicate()}
        parsedSourceSchema={createParsedSourceSchema()}
        sourceArrayPath="items"
        onPredicateChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('filter-right-kind-sourceField')).toHaveTextContent('Source');
    expect(screen.getByTestId('filter-right-kind-static')).toHaveTextContent('Static');

    const externalButton = screen.getByTestId('filter-right-kind-external');
    expect(externalButton).toHaveTextContent('External');
    expect(externalButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// FS-052 T-05: custom right-operand source dropdown with SourceFieldOptionRow
// ---------------------------------------------------------------------------

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

const SOURCE_PREDICATE: FilterPredicateState = {
  kind: 'structured',
  left: { kind: 'itemField', fieldPath: 'sku' },
  operator: 'eq',
  right: { kind: 'sourceField', path: '' },
};

function renderWithContext(sourceData: unknown | null = null) {
  render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <FilterPredicateEditor
          predicate={SOURCE_PREDICATE}
          parsedSourceSchema={createParsedSourceSchema()}
          sourceArrayPath="items"
          onPredicateChange={vi.fn()}
        />
      </WithSourceData>
    </PreviewProvider>,
  );
}

describe('FilterPredicateEditor — FS-052 T-05 custom right-operand source dropdown', () => {
  it('renders a text input (not a native select) for right-operand source field', () => {
    renderWithContext();
    const input = screen.getByTestId('filter-right-source');
    expect(input.tagName).toBe('INPUT');
  });

  it('opens dropdown on focus and shows schema fields', async () => {
    const user = userEvent.setup();
    renderWithContext();
    await user.click(screen.getByTestId('filter-right-source'));
    expect(screen.getByTestId('filter-right-source-listbox')).toBeInTheDocument();
    expect(screen.getByTestId('filter-right-source-option-meta.status')).toBeInTheDocument();
  });

  it('renders type badge (str) for string fields in dropdown', async () => {
    const user = userEvent.setup();
    renderWithContext();
    await user.click(screen.getByTestId('filter-right-source'));
    expect(screen.getAllByText('str').length).toBeGreaterThan(0);
  });

  it('shows test value when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderWithContext({ meta: { status: 'active' } });
    await user.click(screen.getByTestId('filter-right-source'));
    expect(screen.getByText('"active"')).toBeInTheDocument();
  });

  it('does not show test value when sourceData is null', async () => {
    const user = userEvent.setup();
    renderWithContext(null);
    await user.click(screen.getByTestId('filter-right-source'));
    expect(screen.queryByText('"active"')).not.toBeInTheDocument();
  });

  it('selecting an option calls onPredicateChange with the path', async () => {
    const user = userEvent.setup();
    const onPredicateChange = vi.fn();
    render(
      <PreviewProvider>
        <FilterPredicateEditor
          predicate={SOURCE_PREDICATE}
          parsedSourceSchema={createParsedSourceSchema()}
          sourceArrayPath="items"
          onPredicateChange={onPredicateChange}
        />
      </PreviewProvider>,
    );
    await user.click(screen.getByTestId('filter-right-source'));
    await user.click(screen.getByTestId('filter-right-source-option-meta.status'));
    expect(onPredicateChange).toHaveBeenCalledWith(
      expect.objectContaining({ right: { kind: 'sourceField', path: 'meta.status' } }),
    );
  });
});
