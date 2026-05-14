import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ValueEntryEditor } from './ValueEntryEditor';
import type { ValueEntry } from '../lib/array-builder-state';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

function makeNode(path: string, fieldName: string, type: SchemaTreeNode['type']): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
  };
}

const SOURCE_SCHEMA: ParsedSchema = {
  nodes: [
    makeNode('primaryPhone', 'primaryPhone', 'string'),
    makeNode('mobilePhone', 'mobilePhone', 'string'),
  ],
  totalFieldCount: 2,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

describe('ValueEntryEditor', () => {
  it('renders Source and Static toggles and External as disabled placeholder', () => {
    const entry: ValueEntry = { kind: 'primitive', value: { kind: 'empty' } };

    render(
      <ValueEntryEditor
        entry={entry}
        entryIndex={0}
        targetItemFields={[]}
        parsedSourceSchema={SOURCE_SCHEMA}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('value-kind-sourceField-0-value')).toBeInTheDocument();
    expect(screen.getByTestId('value-kind-static-0-value')).toBeInTheDocument();

    const external = screen.getByTestId('value-kind-external-0-value');
    expect(external).toBeInTheDocument();
    expect(external).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows legacy expression note when loading expression value', () => {
    const entry: ValueEntry = {
      kind: 'object',
      fields: {
        number: { kind: 'expression', dsl: 'replaceAll(source("primaryPhone"), "-", "")' },
      },
    };

    render(
      <ValueEntryEditor
        entry={entry}
        entryIndex={0}
        targetItemFields={[{ name: 'number' }]}
        parsedSourceSchema={SOURCE_SCHEMA}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('item-field-toggle-entry-0.number'));

    expect(screen.getByTestId('expression-input-entry-0.number')).toBeInTheDocument();
    expect(screen.getByDisplayValue('replaceAll(source("primaryPhone"), "-", "")')).toBeInTheDocument();
  });

  it('switches from legacy expression to Source via logic selector', () => {
    const onChange = vi.fn();
    const entry: ValueEntry = {
      kind: 'object',
      fields: {
        number: { kind: 'expression', dsl: 'replaceAll(source("primaryPhone"), "-", "")' },
      },
    };

    render(
      <ValueEntryEditor
        entry={entry}
        entryIndex={0}
        targetItemFields={[{ name: 'number' }]}
        parsedSourceSchema={SOURCE_SCHEMA}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('item-field-toggle-entry-0.number'));
    fireEvent.click(screen.getByTestId('logic-type-btn-source'));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'object',
      fields: {
        number: { kind: 'empty' },
      },
    });
  });

  it('renders collapsible item rows with add logic for object fields', () => {
    const entry: ValueEntry = {
      kind: 'object',
      fields: {
        type: { kind: 'empty' },
      },
    };

    render(
      <ValueEntryEditor
        entry={entry}
        entryIndex={0}
        targetItemFields={[{ name: 'type' }]}
        parsedSourceSchema={SOURCE_SCHEMA}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('item-field-row-entry-0.type')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('item-field-toggle-entry-0.type'));
    fireEvent.click(screen.getByTestId('logic-type-btn-static'));
    fireEvent.change(screen.getByTestId('static-input-entry-0.type'), {
      target: { value: 'PRIMARY' },
    });
    expect(screen.getByTestId('item-field-add-logic-entry-0.type')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FS-052 T-05: custom source field dropdown with SourceFieldOptionRow
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

const PRIMITIVE_ENTRY: ValueEntry = { kind: 'primitive', value: { kind: 'sourceField', path: '' } };

function renderPrimitiveWithContext(sourceData: unknown | null = null) {
  render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <ValueEntryEditor
          entry={PRIMITIVE_ENTRY}
          entryIndex={0}
          targetItemFields={[]}
          parsedSourceSchema={SOURCE_SCHEMA}
          onChange={vi.fn()}
        />
      </WithSourceData>
    </PreviewProvider>,
  );
}

describe('ValueEntryEditor — FS-052 T-05 custom source dropdown', () => {
  it('renders a text input (not a native select) for source field selection', () => {
    renderPrimitiveWithContext();
    const input = screen.getByTestId('value-source-0-value');
    expect(input.tagName).toBe('INPUT');
  });

  it('opens dropdown on focus and shows schema fields', async () => {
    const user = userEvent.setup();
    renderPrimitiveWithContext();
    await user.click(screen.getByTestId('value-source-0-value'));
    expect(screen.getByTestId('value-source-listbox-0-value')).toBeInTheDocument();
    expect(screen.getByTestId('value-source-option-0-value-primaryPhone')).toBeInTheDocument();
    expect(screen.getByTestId('value-source-option-0-value-mobilePhone')).toBeInTheDocument();
  });

  it('renders type badge (str) for string fields in dropdown', async () => {
    const user = userEvent.setup();
    renderPrimitiveWithContext();
    await user.click(screen.getByTestId('value-source-0-value'));
    expect(screen.getAllByText('str').length).toBeGreaterThan(0);
  });

  it('shows test value when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderPrimitiveWithContext({ primaryPhone: '555-1234', mobilePhone: '555-5678' });
    await user.click(screen.getByTestId('value-source-0-value'));
    expect(screen.getByText('"555-1234"')).toBeInTheDocument();
  });

  it('does not show test value when sourceData is null', async () => {
    const user = userEvent.setup();
    renderPrimitiveWithContext(null);
    await user.click(screen.getByTestId('value-source-0-value'));
    expect(screen.queryByText('"555-1234"')).not.toBeInTheDocument();
  });

  it('selecting an option calls onChange with the path', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PreviewProvider>
        <ValueEntryEditor
          entry={PRIMITIVE_ENTRY}
          entryIndex={0}
          targetItemFields={[]}
          parsedSourceSchema={SOURCE_SCHEMA}
          onChange={onChange}
        />
      </PreviewProvider>,
    );
    await user.click(screen.getByTestId('value-source-0-value'));
    await user.click(screen.getByTestId('value-source-option-0-value-primaryPhone'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'primitive', value: { kind: 'sourceField', path: 'primaryPhone' } }),
    );
  });

  it('filters options by search query', async () => {
    const user = userEvent.setup();
    renderPrimitiveWithContext();
    await user.click(screen.getByTestId('value-source-0-value'));
    await user.type(screen.getByTestId('value-source-0-value'), 'mobile');
    expect(screen.getByTestId('value-source-option-0-value-mobilePhone')).toBeInTheDocument();
    expect(screen.queryByTestId('value-source-option-0-value-primaryPhone')).not.toBeInTheDocument();
  });
});
