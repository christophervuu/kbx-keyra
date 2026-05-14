import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ValueEntryEditor } from './ValueEntryEditor';
import type { ValueEntry } from '../lib/array-builder-state';
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
