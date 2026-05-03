import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  NullSubtreesSection,
  collectObjectPaths,
  countChildFields,
} from './NullSubtreesSection';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Mock schema helpers
// ---------------------------------------------------------------------------

function makeNode(
  path: string,
  type: SchemaTreeNode['type'],
  children: SchemaTreeNode[] = [],
): SchemaTreeNode {
  return {
    path,
    fieldName: path.split('.').at(-1) ?? path,
    type,
    depth: path.split('.').length - 1,
    isArray: false,
    isRequired: false,
    parentPath: path.includes('.') ? path.split('.').slice(0, -1).join('.') : null,
    childCount: children.length,
    children,
  };
}

// Schema:
//   Order (object)
//     Order.Header (object)
//       Order.Header.ShipTo (object)
//         Order.Header.ShipTo.Name (string)
//         Order.Header.ShipTo.City (string)
//       Order.Header.Date (string)
//     Order.Lines (array)
const MOCK_SCHEMA_NODES: SchemaTreeNode[] = [
  makeNode('Order', 'object', [
    makeNode('Order.Header', 'object', [
      makeNode('Order.Header.ShipTo', 'object', [
        makeNode('Order.Header.ShipTo.Name', 'string'),
        makeNode('Order.Header.ShipTo.City', 'string'),
      ]),
      makeNode('Order.Header.Date', 'string'),
    ]),
    makeNode('Order.Lines', 'array'),
  ]),
];

const MOCK_SCHEMA: ParsedSchema = {
  nodes: MOCK_SCHEMA_NODES,
  totalFieldCount: 6,
  format: 'json-schema',
  parseTimeMs: 1,
  inferred: false,
};

// ---------------------------------------------------------------------------
// Unit tests for pure helpers
// ---------------------------------------------------------------------------

describe('collectObjectPaths', () => {
  it('returns paths of all object-type nodes with children', () => {
    const paths = collectObjectPaths(MOCK_SCHEMA_NODES);
    expect(paths).toContain('Order');
    expect(paths).toContain('Order.Header');
    expect(paths).toContain('Order.Header.ShipTo');
  });

  it('does not include leaf nodes (string, array without children)', () => {
    const paths = collectObjectPaths(MOCK_SCHEMA_NODES);
    expect(paths).not.toContain('Order.Header.Date');
    expect(paths).not.toContain('Order.Lines');
    expect(paths).not.toContain('Order.Header.ShipTo.Name');
  });

  it('returns empty array for empty input', () => {
    expect(collectObjectPaths([])).toEqual([]);
  });
});

describe('countChildFields', () => {
  it('counts leaf descendants under a given path', () => {
    // Order.Header.ShipTo has 2 leaf children: Name, City
    expect(countChildFields(MOCK_SCHEMA_NODES, 'Order.Header.ShipTo')).toBe(2);
  });

  it('counts all leaf descendants recursively', () => {
    // Order.Header has ShipTo (2 leaves) + Date (1 leaf) = 3
    expect(countChildFields(MOCK_SCHEMA_NODES, 'Order.Header')).toBe(3);
  });

  it('returns null when path is not found', () => {
    expect(countChildFields(MOCK_SCHEMA_NODES, 'NonExistent.Path')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe('NullSubtreesSection', () => {
  const defaultProps = {
    nullSubtrees: [] as readonly string[],
    onUpdate: vi.fn(),
    parsedTargetSchema: null,
  };

  it('shows empty state when no subtrees are configured', () => {
    render(<NullSubtreesSection {...defaultProps} />);
    expect(screen.getByTestId('null-subtrees-empty')).toBeInTheDocument();
    expect(screen.getByTestId('null-subtrees-empty')).toHaveTextContent(
      'No subtrees configured',
    );
  });

  it('renders existing subtrees as list items', () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header', 'Order.Lines']}
      />,
    );
    expect(screen.getByTestId('null-subtrees-entry-Order.Header')).toBeInTheDocument();
    expect(screen.getByTestId('null-subtrees-entry-Order.Lines')).toBeInTheDocument();
    expect(screen.queryByTestId('null-subtrees-empty')).not.toBeInTheDocument();
  });

  it('shows child field count when schema is available', () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header.ShipTo']}
        parsedTargetSchema={MOCK_SCHEMA}
      />,
    );
    expect(screen.getByText('2 child fields')).toBeInTheDocument();
  });

  it('shows "—" for child count when schema is not available', () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header']}
        parsedTargetSchema={null}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('add button is disabled when input is empty', () => {
    render(<NullSubtreesSection {...defaultProps} />);
    expect(screen.getByTestId('null-subtrees-add-button')).toBeDisabled();
  });

  it('add button is enabled when input has a value', async () => {
    render(<NullSubtreesSection {...defaultProps} />);
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'Order.Header');
    expect(screen.getByTestId('null-subtrees-add-button')).not.toBeDisabled();
  });

  it('calls onUpdate with new path when add button is clicked', async () => {
    const onUpdate = vi.fn();
    render(<NullSubtreesSection {...defaultProps} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'Order.Header');
    await userEvent.click(screen.getByTestId('null-subtrees-add-button'));
    expect(onUpdate).toHaveBeenCalledWith(['Order.Header']);
  });

  it('calls onUpdate when Enter is pressed in the input', async () => {
    const onUpdate = vi.fn();
    render(<NullSubtreesSection {...defaultProps} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'Order.Lines{Enter}');
    expect(onUpdate).toHaveBeenCalledWith(['Order.Lines']);
  });

  it('shows inline error and does not call onUpdate for duplicate path', async () => {
    const onUpdate = vi.fn();
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header']}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'Order.Header');
    await userEvent.click(screen.getByTestId('null-subtrees-add-button'));
    expect(screen.getByTestId('null-subtrees-input-error')).toHaveTextContent(
      'Path already in list',
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows autocomplete suggestions from schema when input is focused', async () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        parsedTargetSchema={MOCK_SCHEMA}
      />,
    );
    await userEvent.click(screen.getByTestId('null-subtrees-input'));
    expect(screen.getByTestId('null-subtrees-suggestions')).toBeInTheDocument();
    // Object paths from mock schema
    expect(screen.getByTestId('null-subtrees-suggestion-Order')).toBeInTheDocument();
    expect(screen.getByTestId('null-subtrees-suggestion-Order.Header')).toBeInTheDocument();
    expect(screen.getByTestId('null-subtrees-suggestion-Order.Header.ShipTo')).toBeInTheDocument();
  });

  it('filters suggestions based on input text', async () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        parsedTargetSchema={MOCK_SCHEMA}
      />,
    );
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'ShipTo');
    expect(screen.getByTestId('null-subtrees-suggestion-Order.Header.ShipTo')).toBeInTheDocument();
    expect(screen.queryByTestId('null-subtrees-suggestion-Order')).not.toBeInTheDocument();
  });

  it('selecting a suggestion calls onUpdate with the path', async () => {
    const onUpdate = vi.fn();
    render(
      <NullSubtreesSection
        {...defaultProps}
        onUpdate={onUpdate}
        parsedTargetSchema={MOCK_SCHEMA}
      />,
    );
    await userEvent.click(screen.getByTestId('null-subtrees-input'));
    // Use mouseDown (the suggestion uses onMouseDown to avoid blur race)
    const suggestion = screen.getByTestId('null-subtrees-suggestion-Order.Header');
    await userEvent.pointer({ target: suggestion, keys: '[MouseLeft>]' });
    expect(onUpdate).toHaveBeenCalledWith(['Order.Header']);
  });

  it('remove button triggers confirmation dialog', async () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header']}
      />,
    );
    await userEvent.click(screen.getByTestId('null-subtrees-remove-Order.Header'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Remove subtree null-out for 'Order.Header'/)).toBeInTheDocument();
  });

  it('confirming removal calls onUpdate without the removed path', async () => {
    const onUpdate = vi.fn();
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header', 'Order.Lines']}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('null-subtrees-remove-Order.Header'));
    await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onUpdate).toHaveBeenCalledWith(['Order.Lines']);
  });

  it('cancelling removal does not call onUpdate', async () => {
    const onUpdate = vi.fn();
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header']}
        onUpdate={onUpdate}
      />,
    );
    await userEvent.click(screen.getByTestId('null-subtrees-remove-Order.Header'));
    await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onUpdate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument(),
    );
  });

  it('clears input and error after successful add', async () => {
    const onUpdate = vi.fn();
    render(<NullSubtreesSection {...defaultProps} onUpdate={onUpdate} />);
    await userEvent.type(screen.getByTestId('null-subtrees-input'), 'Order.Header');
    await userEvent.click(screen.getByTestId('null-subtrees-add-button'));
    expect(screen.getByTestId('null-subtrees-input')).toHaveValue('');
  });

  it('remove button has accessible aria-label', () => {
    render(
      <NullSubtreesSection
        {...defaultProps}
        nullSubtrees={['Order.Header']}
      />,
    );
    const removeBtn = screen.getByTestId('null-subtrees-remove-Order.Header');
    expect(removeBtn).toHaveAttribute(
      'aria-label',
      "Remove subtree null-out for 'Order.Header'",
    );
  });
});
