import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SourceSchemaPanel } from './SourceSchemaPanel';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';

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

function WithSourceData({ sourceData, children }: { sourceData: unknown | null; children: React.ReactNode }) {
  const { setSourceData } = usePreviewSetters();
  React.useEffect(() => {
    setSourceData(sourceData);
  }, [setSourceData, sourceData]);
  return <>{children}</>;
}

function renderPanel(
  props: React.ComponentProps<typeof SourceSchemaPanel>,
  sourceData: unknown | null = null,
) {
  return render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <SourceSchemaPanel {...props} />
      </WithSourceData>
    </PreviewProvider>,
  );
}

describe('SourceSchemaPanel', () => {
  it('renders SRC badge and source schema name in header', () => {
    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      sourceSchemaName: 'Customer Source',
      onStageField: vi.fn(),
    });
    expect(screen.getByTestId('source-header-badge')).toHaveTextContent('SRC');
    expect(screen.getByTestId('source-header-name')).toHaveTextContent('Customer Source');
  });

  it('renders fallback source header name when schema name is missing', () => {
    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      sourceSchemaName: null,
      onStageField: vi.fn(),
    });
    expect(screen.getByTestId('source-header-name')).toHaveTextContent('No source schema');
  });

  it('renders empty state when schema is null', () => {
    renderPanel({ parsedSourceSchema: null, onStageField: vi.fn() });
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
    renderPanel({ parsedSourceSchema: empty, onStageField: vi.fn() });
    expect(screen.getByTestId('source-schema-panel-empty')).toBeInTheDocument();
  });

  it('renders leaf fields with draggable attribute', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    const nameField = screen.getByTestId('source-field-name');
    expect(nameField).toHaveAttribute('draggable', 'true');
    const emailField = screen.getByTestId('source-field-email');
    expect(emailField).toHaveAttribute('draggable', 'true');
  });

  it('sets correct data transfer payload on dragstart', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    const nameField = screen.getByTestId('source-field-name');

    const setData = vi.fn();
    fireEvent.dragStart(nameField, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', 'name');
  });

  it('fires onStageField when a leaf field is clicked', () => {
    const onStageField = vi.fn();
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField });
    fireEvent.click(screen.getByTestId('source-field-email'));
    expect(onStageField).toHaveBeenCalledWith('email');
  });

  it('fires onStageField when Enter is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField });
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: 'Enter' });
    expect(onStageField).toHaveBeenCalledWith('name');
  });

  it('fires onStageField when Space is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField });
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: ' ' });
    expect(onStageField).toHaveBeenCalledWith('name');
  });

  it('renders object nodes as non-draggable container buttons', () => {
    renderPanel({ parsedSourceSchema: NESTED_SCHEMA, onStageField: vi.fn() });
    const container = screen.getByTestId('source-container-address');
    expect(container).toBeInTheDocument();
    expect(container).not.toHaveAttribute('draggable', 'true');
  });

  it('expands object node to show children on click', () => {
    renderPanel({ parsedSourceSchema: NESTED_SCHEMA, onStageField: vi.fn() });

    // Child not visible initially
    expect(screen.queryByTestId('source-field-address.city')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-container-address'));

    // Child now visible
    expect(screen.getByTestId('source-field-address.city')).toBeInTheDocument();
  });

  it('collapses object node on second click', () => {
    renderPanel({ parsedSourceSchema: NESTED_SCHEMA, onStageField: vi.fn() });

    fireEvent.click(screen.getByTestId('source-container-address'));
    expect(screen.getByTestId('source-field-address.city')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-container-address'));
    expect(screen.queryByTestId('source-field-address.city')).not.toBeInTheDocument();
  });

  it('sets aria-expanded on container node', () => {
    renderPanel({ parsedSourceSchema: NESTED_SCHEMA, onStageField: vi.fn() });
    const container = screen.getByTestId('source-container-address');
    expect(container).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(container);
    expect(container).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaf fields have role=button and aria-label', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    const nameField = screen.getByTestId('source-field-name');
    expect(nameField).toHaveAttribute('role', 'button');
    expect(nameField).toHaveAttribute('aria-label', 'Stage source field name');
  });

  // ---------------------------------------------------------------------------
  // Internal search
  // ---------------------------------------------------------------------------

  it('renders the internal search input', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    expect(screen.getByTestId('source-search')).toBeInTheDocument();
  });

  it('filters fields by typing in the search input', async () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    await waitFor(() => {
      expect(screen.getByTestId('source-field-name')).toBeInTheDocument();
      expect(screen.queryByTestId('source-field-email')).not.toBeInTheDocument();
    });
  });

  it('shows no-results state when search matches nothing', async () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'zzznomatch' } });
    await waitFor(() => {
      expect(screen.getByTestId('source-search-no-results')).toBeInTheDocument();
    });
  });

  it('shows result count when search has matches', async () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    await waitFor(() => {
      expect(screen.getByTestId('source-search-count')).toBeInTheDocument();
    });
  });

  it('shows clear button when search has a value', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    expect(screen.queryByTestId('source-search-clear')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    expect(screen.getByTestId('source-search-clear')).toBeInTheDocument();
  });

  it('clear button resets search and shows all fields', async () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    fireEvent.change(screen.getByTestId('source-search'), { target: { value: 'name' } });
    await waitFor(() => {
      expect(screen.queryByTestId('source-field-email')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('source-search-clear'));
    await waitFor(() => {
      expect(screen.getByTestId('source-field-email')).toBeInTheDocument();
      expect(screen.queryByTestId('source-search-clear')).not.toBeInTheDocument();
    });
  });

  it('shows selected source metadata details after selecting a leaf field', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });

    expect(screen.getByTestId('source-selected-empty')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('source-field-name'));

    expect(screen.getByTestId('source-selected-path')).toHaveTextContent('name');
    expect(screen.getByTestId('source-selected-type')).toHaveTextContent('str');
    expect(screen.getByTestId('source-selected-required')).toHaveTextContent('Required');
  });

  it('shows sample value in selected source details when preview source data exists', () => {
    renderPanel(
      { parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() },
      { name: 'Alice', email: 'alice@example.com' },
    );

    fireEvent.click(screen.getByTestId('source-field-name'));

    expect(screen.getByTestId('source-selected-sample-value')).toHaveTextContent('"Alice"');
  });
});
