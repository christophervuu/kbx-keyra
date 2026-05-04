import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SourceSchemaPanel } from './SourceSchemaPanel';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLeaf(
  path: string,
  fieldName: string,
  depth = 0,
  type: SchemaTreeNode['type'] = 'string',
): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
    depth,
    isArray: false,
    isRequired: true,
    parentPath: depth === 0 ? null : path.split('.').slice(0, -1).join('.'),
    childCount: 0,
    children: [],
  };
}

function makeObject(
  path: string,
  fieldName: string,
  children: SchemaTreeNode[],
  depth = 0,
): SchemaTreeNode {
  return {
    path,
    fieldName,
    type: 'object',
    depth,
    isArray: false,
    isRequired: true,
    parentPath: depth === 0 ? null : path.split('.').slice(0, -1).join('.'),
    childCount: children.length,
    children,
  };
}

const LEAF_A = makeLeaf('name', 'name');
const LEAF_B = makeLeaf('email', 'email');
const NESTED_LEAF = makeLeaf('address.city', 'city', 1);
const OBJECT_NODE = makeObject('address', 'address', [NESTED_LEAF]);

const FLAT_SCHEMA: ParsedSchema = {
  nodes: [LEAF_A, LEAF_B],
  totalFieldCount: 2,
  format: 'json',
  parseTimeMs: 0,
  inferred: false,
};

const NESTED_SCHEMA: ParsedSchema = {
  nodes: [OBJECT_NODE, LEAF_A],
  totalFieldCount: 3,
  format: 'json',
  parseTimeMs: 0,
  inferred: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceSchemaPanel', () => {
  it('renders empty state when schema is null', () => {
    render(
      <SourceSchemaPanel parsedSourceSchema={null} onStageField={vi.fn()} />,
    );
    expect(screen.getByTestId('source-schema-panel-empty')).toBeInTheDocument();
  });

  it('renders empty state when schema has no nodes', () => {
    const empty: ParsedSchema = {
      nodes: [],
      totalFieldCount: 0,
      format: 'json',
      parseTimeMs: 0,
      inferred: false,
    };
    render(<SourceSchemaPanel parsedSourceSchema={empty} onStageField={vi.fn()} />);
    expect(screen.getByTestId('source-schema-panel-empty')).toBeInTheDocument();
  });

  it('renders leaf fields with draggable attribute', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    const nameField = screen.getByTestId('source-field-name');
    expect(nameField).toHaveAttribute('draggable', 'true');
    const emailField = screen.getByTestId('source-field-email');
    expect(emailField).toHaveAttribute('draggable', 'true');
  });

  it('sets correct data transfer payload on dragstart', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    const nameField = screen.getByTestId('source-field-name');

    const setData = vi.fn();
    fireEvent.dragStart(nameField, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', 'name');
  });

  it('fires onStageField when a leaf field is clicked', () => {
    const onStageField = vi.fn();
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={onStageField} />);
    fireEvent.click(screen.getByTestId('source-field-email'));
    expect(onStageField).toHaveBeenCalledWith('email');
  });

  it('fires onStageField when Enter is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={onStageField} />);
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: 'Enter' });
    expect(onStageField).toHaveBeenCalledWith('name');
  });

  it('fires onStageField when Space is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={onStageField} />);
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: ' ' });
    expect(onStageField).toHaveBeenCalledWith('name');
  });

  it('renders object nodes as non-draggable container buttons', () => {
    render(<SourceSchemaPanel parsedSourceSchema={NESTED_SCHEMA} onStageField={vi.fn()} />);
    const container = screen.getByTestId('source-container-address');
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveAttribute('draggable', 'true');
  });

  it('expands object node to show children on click', () => {
    render(<SourceSchemaPanel parsedSourceSchema={NESTED_SCHEMA} onStageField={vi.fn()} />);

    // Child not visible initially
    expect(screen.queryByTestId('source-field-address.city')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-container-address'));

    // Child now visible
    expect(screen.getByTestId('source-field-address.city')).toBeInTheDocument();
  });

  it('collapses object node on second click', () => {
    render(<SourceSchemaPanel parsedSourceSchema={NESTED_SCHEMA} onStageField={vi.fn()} />);

    fireEvent.click(screen.getByTestId('source-container-address'));
    expect(screen.getByTestId('source-field-address.city')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-container-address'));
    expect(screen.queryByTestId('source-field-address.city')).not.toBeInTheDocument();
  });

  it('sets aria-expanded on container node', () => {
    render(<SourceSchemaPanel parsedSourceSchema={NESTED_SCHEMA} onStageField={vi.fn()} />);
    const container = screen.getByTestId('source-container-address');
    expect(container).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(container);
    expect(container).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaf fields have role=button and aria-label', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    const nameField = screen.getByTestId('source-field-name');
    expect(nameField).toHaveAttribute('role', 'button');
    expect(nameField).toHaveAttribute('aria-label', 'Stage source field name');
  });

  // ---------------------------------------------------------------------------
  // Internal search
  // ---------------------------------------------------------------------------

  it('renders the internal search input', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    expect(screen.getByTestId('source-search')).toBeInTheDocument();
  });

  it('filters fields by typing in the search input', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    expect(screen.getByTestId('source-field-name')).toBeInTheDocument();
    expect(screen.queryByTestId('source-field-email')).not.toBeInTheDocument();
  });

  it('shows no-results state when search matches nothing', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'zzznomatch' } });
    expect(screen.getByTestId('source-search-no-results')).toBeInTheDocument();
  });

  it('shows result count when search has matches', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    expect(screen.getByTestId('source-search-count')).toBeInTheDocument();
  });

  it('shows clear button when search has a value', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    expect(screen.queryByTestId('source-search-clear')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    expect(screen.getByTestId('source-search-clear')).toBeInTheDocument();
  });

  it('clear button resets search and shows all fields', () => {
    render(<SourceSchemaPanel parsedSourceSchema={FLAT_SCHEMA} onStageField={vi.fn()} />);
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    expect(screen.queryByTestId('source-field-email')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('source-search-clear'));
    expect(screen.getByTestId('source-field-email')).toBeInTheDocument();
    expect(screen.queryByTestId('source-search-clear')).not.toBeInTheDocument();
  });
});
