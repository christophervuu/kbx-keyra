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

const FLATTENED_NESTED_SCHEMA: ParsedSchema = {
  nodes: [
    {
      ...OBJECT_NODE,
      children: [],
      childCount: 1,
    },
    {
      ...NESTED_LEAF,
      depth: 1,
      parentPath: 'address',
      children: [],
      childCount: 0,
    },
    LEAF_A,
  ],
  totalFieldCount: 3,
  format: 'json',
  parseTimeMs: 0,
  inferred: false,
};

const FLATTENED_WITH_MISSING_PARENT_SCHEMA: ParsedSchema = {
  nodes: [
    {
      path: 'profile',
      fieldName: 'profile',
      type: 'object',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 2,
      children: [],
    },
    {
      path: 'profile.name',
      fieldName: 'name',
      type: 'string',
      depth: 1,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'profile.email',
      fieldName: 'email',
      type: 'string',
      depth: 1,
      isArray: false,
      isRequired: false,
      parentPath: '',
      childCount: 0,
      children: [],
    },
  ],
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
  it('does not render source schema name row', () => {
    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      sourceSchemaName: 'Customer Source',
      onStageField: vi.fn(),
    });

    expect(screen.queryByTestId('source-header-name')).not.toBeInTheDocument();
    expect(screen.queryByText('Customer Source')).not.toBeInTheDocument();
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
    expect(onStageField).toHaveBeenCalledWith({
      path: 'email',
      kind: 'primary',
      valueType: 'string',
      expression: 'source("email")',
    });
  });

  it('renders selected visual state when a field is already in the tray', () => {
    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      onStageField: vi.fn(),
      selectedInputs: [{ kind: 'primary', path: 'name' }],
    });

    const row = screen.getByTestId('source-field-name');
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('source-field-selected-badge-name')).toBeInTheDocument();
  });

  it('includes sampleValue metadata when source sample data is available', () => {
    const onStageField = vi.fn();
    renderPanel(
      { parsedSourceSchema: FLAT_SCHEMA, onStageField },
      { name: 'Ada Lovelace', email: 'ada@example.com' },
    );

    fireEvent.click(screen.getByTestId('source-field-name'));

    expect(onStageField).toHaveBeenCalledWith({
      path: 'name',
      kind: 'primary',
      valueType: 'string',
      sampleValue: '"Ada Lovelace"',
      expression: 'source("name")',
    });
  });

  it('fires onStageField when Enter is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField });
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: 'Enter' });
    expect(onStageField).toHaveBeenCalledWith({
      path: 'name',
      kind: 'primary',
      valueType: 'string',
      expression: 'source("name")',
    });
  });

  it('fires onStageField when Space is pressed on a leaf field', () => {
    const onStageField = vi.fn();
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField });
    fireEvent.keyDown(screen.getByTestId('source-field-name'), { key: ' ' });
    expect(onStageField).toHaveBeenCalledWith({
      path: 'name',
      kind: 'primary',
      valueType: 'string',
      expression: 'source("name")',
    });
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

  it('reconstructs flattened object hierarchy and shows child fields on expand', () => {
    renderPanel({ parsedSourceSchema: FLATTENED_NESTED_SCHEMA, onStageField: vi.fn() });

    expect(screen.queryByTestId('source-field-address.city')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('source-container-address'));
    expect(screen.getByTestId('source-field-address.city')).toBeInTheDocument();
  });

  it('indents reconstructed child rows under their parent object', () => {
    renderPanel({ parsedSourceSchema: FLATTENED_NESTED_SCHEMA, onStageField: vi.fn() });

    const parent = screen.getByTestId('source-container-address');
    fireEvent.click(parent);
    const child = screen.getByTestId('source-field-address.city');

    expect(parent).toHaveStyle({ paddingLeft: '4px' });
    expect(child).toHaveStyle({ paddingLeft: '24px' });
  });

  it('infers dotted-path parent when parentPath is missing and expands profile children', () => {
    renderPanel({ parsedSourceSchema: FLATTENED_WITH_MISSING_PARENT_SCHEMA, onStageField: vi.fn() });

    expect(screen.queryByTestId('source-field-profile.name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('source-container-profile'));
    expect(screen.getByTestId('source-field-profile.name')).toBeInTheDocument();
    expect(screen.getByTestId('source-field-profile.email')).toBeInTheDocument();
  });

  it('leaf fields have role=button and aria-label', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });
    const nameField = screen.getByTestId('source-field-name');
    expect(nameField).toHaveAttribute('role', 'button');
    expect(nameField).toHaveAttribute('aria-label', 'Stage input field name');
  });

  it('renders grouped input headers: Primary Source and Enrichment Input aliases', () => {
    const enrichmentSchema: ParsedSchema = {
      nodes: [makeLeaf('customerId', 'customerId')],
      totalFieldCount: 1,
      format: 'json',
      parseTimeMs: 0,
      inferred: false,
    };

    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      enrichmentInputGroups: [{ alias: 'customerProfile', parsedSchema: enrichmentSchema }],
      onStageField: vi.fn(),
    });

    expect(screen.getByText('Primary Source')).toBeInTheDocument();
    expect(screen.getByText('Enrichment Input: customerProfile')).toBeInTheDocument();
  });

  it('stages enrichment field with get(external(alias), path) expression', () => {
    const enrichmentSchema: ParsedSchema = {
      nodes: [makeLeaf('customerId', 'customerId')],
      totalFieldCount: 1,
      format: 'json',
      parseTimeMs: 0,
      inferred: false,
    };
    const onStageField = vi.fn();

    renderPanel({
      parsedSourceSchema: FLAT_SCHEMA,
      enrichmentInputGroups: [{ alias: 'customerProfile', parsedSchema: enrichmentSchema }],
      onStageField,
    });

    fireEvent.click(screen.getByTestId('source-field-customerId'));

    expect(onStageField).toHaveBeenCalledWith({
      path: 'customerId',
      kind: 'enrichment',
      alias: 'customerProfile',
      valueType: 'string',
      expression: 'get(external("customerProfile"), "customerId")',
    });
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

  it('renders source row content with type badge and sample payload subline', () => {
    renderPanel(
      { parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() },
      { name: 'Alice', email: 'alice@example.com' },
    );

    expect(screen.getByTestId('source-field-content-name')).toBeInTheDocument();
    expect(screen.getByTestId('source-field-subline-name')).toHaveTextContent('"Alice"');
  });

  it('falls back to dash when source payload is not loaded', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() }, null);

    expect(screen.getByTestId('source-field-subline-name')).toHaveTextContent('—');
  });

  it('renders container row content without a second subline row', () => {
    renderPanel({ parsedSourceSchema: NESTED_SCHEMA, onStageField: vi.fn() });

    expect(screen.getByTestId('source-container-content-address')).toBeInTheDocument();
    expect(screen.queryByTestId('source-container-subline-address')).not.toBeInTheDocument();
  });

  it('does not render Selected source details section', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });

    expect(screen.queryByTestId('source-selected-details')).not.toBeInTheDocument();
    expect(screen.queryByTestId('source-selected-empty')).not.toBeInTheDocument();
  });

  it('uses equal badge width classes for string and number rows', () => {
    renderPanel({ parsedSourceSchema: FLAT_SCHEMA, onStageField: vi.fn() });

    const badges = screen.getAllByLabelText(/^type:/i);
    expect(badges.length).toBeGreaterThan(1);
    expect(badges[0].className).toContain('min-w-[2rem]');
    expect(badges[1].className).toContain('min-w-[2rem]');
  });
});
