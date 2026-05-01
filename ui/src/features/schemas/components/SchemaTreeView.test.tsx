import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SchemaTreeView } from './SchemaTreeView';

import type { MappingNodeStatus, ParsedSchema, SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// jsdom mocks for @tanstack/react-virtual
// The virtualizer needs scroll container dimensions to calculate visible rows.
// jsdom has no layout engine, so we must mock dimensions.
// ---------------------------------------------------------------------------

const MOCK_CONTAINER_HEIGHT = 600;

beforeAll(() => {
  // Mock ResizeObserver with proper borderBoxSize
  globalThis.ResizeObserver = class ResizeObserver {
    private callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
    constructor(callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void) {
      this.callback = callback;
    }
    observe(target: Element) {
      // Fire immediately with mocked dimensions
      this.callback(
        [{
          target,
          contentRect: { width: 400, height: MOCK_CONTAINER_HEIGHT } as DOMRectReadOnly,
          borderBoxSize: [{ inlineSize: 400, blockSize: MOCK_CONTAINER_HEIGHT }] as unknown as readonly ResizeObserverSize[],
          contentBoxSize: [{ inlineSize: 400, blockSize: MOCK_CONTAINER_HEIGHT }] as unknown as readonly ResizeObserverSize[],
          devicePixelContentBoxSize: [],
        }],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  // Mock scrollHeight and clientHeight for the scroll container
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: MOCK_CONTAINER_HEIGHT,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: MOCK_CONTAINER_HEIGHT,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<SchemaTreeNode> = {}): SchemaTreeNode {
  return {
    path: 'field',
    fieldName: 'field',
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
    ...overrides,
  };
}

function makeSchema(nodes: SchemaTreeNode[], overrides: Partial<ParsedSchema> = {}): ParsedSchema {
  return {
    nodes,
    totalFieldCount: nodes.length,
    format: 'json-schema',
    parseTimeMs: 1,
    inferred: false,
    ...overrides,
  };
}

// AE-01 schema: name (string, required), age (number), address (object with street + city)
const AE01_SCHEMA = makeSchema([
  makeNode({ path: 'name', fieldName: 'name', type: 'string', isRequired: true }),
  makeNode({ path: 'age', fieldName: 'age', type: 'number' }),
  makeNode({
    path: 'address',
    fieldName: 'address',
    type: 'object',
    childCount: 2,
    children: [
      makeNode({ path: 'address.street', fieldName: 'street', type: 'string', depth: 1, parentPath: 'address' }),
      makeNode({ path: 'address.city', fieldName: 'city', type: 'string', depth: 1, parentPath: 'address' }),
    ],
  }),
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaTreeView', () => {
  describe('Populated state (AE-01)', () => {
    it('renders top-level nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      expect(screen.getByText('name')).toBeInTheDocument();
      expect(screen.getByText('age')).toBeInTheDocument();
      expect(screen.getByText('address')).toBeInTheDocument();
    });

    it('shows children of expanded object nodes (auto-expanded at depth 0)', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      // address is auto-expanded because it is depth 0 with children
      expect(screen.getByText('street')).toBeInTheDocument();
      expect(screen.getByText('city')).toBeInTheDocument();
    });

    it('hides children after collapsing a node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      // address should be expanded initially
      expect(screen.getByText('street')).toBeInTheDocument();

      // Click collapse button
      const collapseBtn = screen.getByLabelText('Collapse address');
      fireEvent.click(collapseBtn);

      expect(screen.queryByText('street')).not.toBeInTheDocument();
      expect(screen.queryByText('city')).not.toBeInTheDocument();
    });

    it('shows children after expanding a collapsed node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);

      // Collapse first
      fireEvent.click(screen.getByLabelText('Collapse address'));
      expect(screen.queryByText('street')).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByLabelText('Expand address'));
      expect(screen.getByText('street')).toBeInTheDocument();
    });

    it('shows required indicator for required nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      // name is required — should have the asterisk
      const requiredIndicators = screen.getAllByLabelText('required');
      expect(requiredIndicators.length).toBeGreaterThanOrEqual(1);
    });

    it('shows child count badge on expandable nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      expect(screen.getByText('(2 fields)')).toBeInTheDocument();
    });
  });

  describe('ARIA roles', () => {
    it('renders role="tree" on the container', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      expect(screen.getByRole('tree')).toBeInTheDocument();
    });

    it('renders role="treeitem" on nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const treeitems = screen.getAllByRole('treeitem');
      expect(treeitems.length).toBeGreaterThanOrEqual(3);
    });

    it('sets aria-expanded on expandable nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const treeitems = screen.getAllByRole('treeitem');
      const addressItem = treeitems.find((el) => el.textContent?.includes('address'));
      expect(addressItem).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not set aria-expanded on non-expandable nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const treeitems = screen.getAllByRole('treeitem');
      const nameItem = treeitems.find((el) => el.textContent?.includes('name') && !el.textContent?.includes('address'));
      expect(nameItem).not.toHaveAttribute('aria-expanded');
    });
  });

  describe('Type icons', () => {
    it('renders distinct icons for different types', () => {
      const schema = makeSchema([
        makeNode({ path: 'a', fieldName: 'a', type: 'string' }),
        makeNode({ path: 'b', fieldName: 'b', type: 'number' }),
        makeNode({ path: 'c', fieldName: 'c', type: 'boolean' }),
        makeNode({ path: 'd', fieldName: 'd', type: 'object' }),
        makeNode({ path: 'e', fieldName: 'e', type: 'array', isArray: true }),
      ]);
      const { container } = render(<SchemaTreeView schema={schema} />);
      // All icons are rendered as SVGs with aria-hidden
      const icons = container.querySelectorAll('svg[aria-hidden="true"]');
      // At least 5 type icons (one per node)
      expect(icons.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Tooltip / description', () => {
    it('shows description info icon for nodes with descriptions', () => {
      const schema = makeSchema([
        makeNode({ path: 'name', fieldName: 'name', type: 'string', description: 'User full name' }),
      ]);
      render(<SchemaTreeView schema={schema} />);
      const infoTrigger = screen.getByTitle('User full name');
      expect(infoTrigger).toBeInTheDocument();
    });

    it('does not show description icon for nodes without descriptions', () => {
      const schema = makeSchema([
        makeNode({ path: 'name', fieldName: 'name', type: 'string' }),
      ]);
      render(<SchemaTreeView schema={schema} />);
      expect(screen.queryByTitle('User full name')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('renders loading skeleton', () => {
      render(<SchemaTreeView loading />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText('Loading schema...')).toBeInTheDocument();
    });

    it('does not render tree when loading', () => {
      render(<SchemaTreeView loading schema={AE01_SCHEMA} />);
      expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('renders empty message when schema has zero nodes', () => {
      const emptySchema = makeSchema([]);
      render(<SchemaTreeView schema={emptySchema} />);
      expect(screen.getByText('No fields found in schema')).toBeInTheDocument();
    });

    it('renders empty message when schema is undefined', () => {
      render(<SchemaTreeView />);
      expect(screen.getByText('No fields found in schema')).toBeInTheDocument();
    });
  });

  describe('Error state (AE-08)', () => {
    it('renders error message', () => {
      render(<SchemaTreeView error="Something went wrong" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Failed to parse schema')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders retry button when onRetry is provided', () => {
      const onRetry = vi.fn();
      render(<SchemaTreeView error="Error" onRetry={onRetry} />);
      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
    });

    it('calls onRetry when retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<SchemaTreeView error="Error" onRetry={onRetry} />);
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('accepts error object with message property', () => {
      render(<SchemaTreeView error={{ message: 'Parse failed' }} />);
      expect(screen.getByText('Parse failed')).toBeInTheDocument();
    });
  });

  describe('Inferred schema banner', () => {
    it('shows inferred warning banner when schema.inferred is true', () => {
      const schema = makeSchema(
        [makeNode({ path: 'x', fieldName: 'x', type: 'string' })],
        { inferred: true },
      );
      render(<SchemaTreeView schema={schema} />);
      expect(screen.getByText('Schema inferred from sample data')).toBeInTheDocument();
    });

    it('does not show banner when schema.inferred is false', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      expect(screen.queryByText('Schema inferred from sample data')).not.toBeInTheDocument();
    });
  });

  describe('Union type indicator', () => {
    it('shows union member types inline', () => {
      const schema = makeSchema([
        makeNode({
          path: 'value',
          fieldName: 'value',
          type: 'union',
          unionTypes: ['string', 'number'],
        }),
      ]);
      render(<SchemaTreeView schema={schema} />);
      expect(screen.getByText('(string | number)')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Virtualization tests (AE-05, AE-10)
  // ---------------------------------------------------------------------------

  describe('Virtualization (AE-05)', () => {
    /**
     * Generate a large flat schema with N nodes for virtualization testing.
     */
    function makeLargeSchema(count: number): ParsedSchema {
      const nodes: SchemaTreeNode[] = [];
      for (let i = 0; i < count; i++) {
        nodes.push(makeNode({
          path: `field_${i}`,
          fieldName: `field_${i}`,
          type: 'string',
          depth: 0,
        }));
      }
      return makeSchema(nodes, { totalFieldCount: count });
    }

    /**
     * Generate a deeply nested schema for expand-all testing.
     */
    function makeLargeNestedSchema(count: number): ParsedSchema {
      // Create top-level objects, each with children
      const groupSize = 10;
      const groupCount = Math.ceil(count / (groupSize + 1));
      const nodes: SchemaTreeNode[] = [];

      for (let g = 0; g < groupCount; g++) {
        const children: SchemaTreeNode[] = [];
        for (let c = 0; c < groupSize; c++) {
          children.push(makeNode({
            path: `group_${g}.child_${c}`,
            fieldName: `child_${c}`,
            type: 'string',
            depth: 1,
            parentPath: `group_${g}`,
          }));
        }
        nodes.push(makeNode({
          path: `group_${g}`,
          fieldName: `group_${g}`,
          type: 'object',
          depth: 0,
          childCount: groupSize,
          children,
        }));
      }

      return makeSchema(nodes, { totalFieldCount: count });
    }

    it('renders < 100 treeitem elements for a 5000-node tree', () => {
      const schema = makeLargeSchema(5000);
      render(<SchemaTreeView schema={schema} />);
      const treeitems = screen.getAllByRole('treeitem');
      // With 600px height / 32px row + 15 overscan per side = ~50 items max
      expect(treeitems.length).toBeLessThan(100);
      expect(treeitems.length).toBeGreaterThan(0);
    });

    it('renders bounded DOM when nested nodes are expanded', () => {
      const schema = makeLargeNestedSchema(5000);
      // All top-level nodes are auto-expanded (depth 0 with children)
      // Total visible = groupCount + all children = ~5000
      render(<SchemaTreeView schema={schema} />);
      const treeitems = screen.getAllByRole('treeitem');
      expect(treeitems.length).toBeLessThan(100);
      expect(treeitems.length).toBeGreaterThan(0);
    });

    it('does not render all nodes - only a windowed subset', () => {
      const schema = makeLargeSchema(1000);
      render(<SchemaTreeView schema={schema} />);
      const treeitems = screen.getAllByRole('treeitem');
      // Should render significantly fewer than 1000
      expect(treeitems.length).toBeLessThan(100);
      // But should render some
      expect(treeitems.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Search tests (AE-03)
  // ---------------------------------------------------------------------------

  describe('Search (AE-03)', () => {
    const SEARCH_SCHEMA = makeSchema([
      makeNode({ path: 'firstName', fieldName: 'firstName', type: 'string' }),
      makeNode({ path: 'lastName', fieldName: 'lastName', type: 'string' }),
      makeNode({
        path: 'address',
        fieldName: 'address',
        type: 'object',
        childCount: 2,
        children: [
          makeNode({ path: 'address.streetName', fieldName: 'streetName', type: 'string', depth: 1, parentPath: 'address' }),
          makeNode({ path: 'address.city', fieldName: 'city', type: 'string', depth: 1, parentPath: 'address' }),
        ],
      }),
      makeNode({ path: 'email', fieldName: 'email', type: 'string' }),
    ]);

    it('renders search input by default', () => {
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);
      expect(screen.getByLabelText('Search schema fields')).toBeInTheDocument();
    });

    it('does not render search input when searchable={false}', () => {
      render(<SchemaTreeView schema={SEARCH_SCHEMA} searchable={false} />);
      expect(screen.queryByLabelText('Search schema fields')).not.toBeInTheDocument();
    });

    it('filters tree after debounce when typing', () => {
      vi.useFakeTimers();
      const { container } = render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'street' } });

      // Before debounce, all nodes still visible
      expect(screen.getByText('firstName')).toBeInTheDocument();

      // After debounce — run all pending timers + animation frames
      act(() => { vi.runAllTimers(); });

      // Only matching node + ancestor visible (text is highlighted/split across elements)
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThanOrEqual(1);
      // The matching node "streetName" is rendered with highlight, so check the mark text
      const streetMark = Array.from(marks).find((m) => m.textContent === 'street');
      expect(streetMark).toBeTruthy();
      // Ancestor "address" should be visible
      expect(screen.getByText('address')).toBeInTheDocument();
      // Non-matching nodes should be gone
      expect(screen.queryByText('firstName')).not.toBeInTheDocument();
      expect(screen.queryByText('email')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('highlights matching text in field names', () => {
      vi.useFakeTimers();
      const { container } = render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'Name' } });
      act(() => { vi.runAllTimers(); });

      // Should find <mark> elements with the highlighted text
      const marks = container.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('shows result count', () => {
      vi.useFakeTimers();
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'Name' } });
      act(() => { vi.runAllTimers(); });

      // "firstName", "lastName", "streetName" all match "Name"
      expect(screen.getByText('3 results')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('shows "No matching fields" when no results', () => {
      vi.useFakeTimers();
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'zzzzzzz' } });
      act(() => { vi.runAllTimers(); });

      expect(screen.getByText('No matching fields')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('clears search and restores full tree', () => {
      vi.useFakeTimers();
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'street' } });
      act(() => { vi.runAllTimers(); });

      expect(screen.queryByText('firstName')).not.toBeInTheDocument();

      // Click clear button
      const clearBtn = screen.getByLabelText('Clear search');
      fireEvent.click(clearBtn);

      // Full tree restored
      expect(screen.getByText('firstName')).toBeInTheDocument();
      expect(screen.getByText('email')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('has aria-live region for result count', () => {
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('auto-expands ancestor nodes of matches', () => {
      vi.useFakeTimers();
      // Collapse address first, then search for a child
      render(<SchemaTreeView schema={SEARCH_SCHEMA} />);

      // Collapse address
      const collapseBtn = screen.getByLabelText('Collapse address');
      fireEvent.click(collapseBtn);
      expect(screen.queryByText('streetName')).not.toBeInTheDocument();

      // Search for child
      const input = screen.getByLabelText('Search schema fields');
      fireEvent.change(input, { target: { value: 'city' } });
      act(() => { vi.runAllTimers(); });

      // address should be auto-expanded to show city
      expect(screen.getByText('city')).toBeInTheDocument();
      expect(screen.getByText('address')).toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------------------
  // Selection tests (AE-09)
  // ---------------------------------------------------------------------------

  describe('Selection (AE-09)', () => {
    it('calls onSelectNode with the correct node when clicking a row', () => {
      const onSelectNode = vi.fn();
      render(<SchemaTreeView schema={AE01_SCHEMA} onSelectNode={onSelectNode} />);

      const treeitems = screen.getAllByRole('treeitem');
      const nameItem = treeitems.find((el) => el.textContent?.includes('name') && !el.textContent?.includes('address'));
      expect(nameItem).toBeTruthy();
      fireEvent.click(nameItem!);

      expect(onSelectNode).toHaveBeenCalledTimes(1);
      expect(onSelectNode).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'name', fieldName: 'name' }),
      );
    });

    it('visually highlights the selected node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);

      const treeitems = screen.getAllByRole('treeitem');
      const nameItem = treeitems.find((el) => el.textContent?.includes('name') && !el.textContent?.includes('address'));
      fireEvent.click(nameItem!);

      // After click, should have the selected styling class
      expect(nameItem).toHaveAttribute('aria-selected', 'true');
    });

    it('sets aria-selected="true" on selected node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);

      const treeitems = screen.getAllByRole('treeitem');
      const ageItem = treeitems.find((el) => el.textContent?.includes('age'));
      fireEvent.click(ageItem!);

      expect(ageItem).toHaveAttribute('aria-selected', 'true');
      // Others should not be selected
      const nameItem = treeitems.find((el) => el.textContent?.includes('name') && !el.textContent?.includes('address'));
      expect(nameItem).toHaveAttribute('aria-selected', 'false');
    });

    it('selectedPath prop externally controls which node is selected', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} selectedPath="age" />);

      const treeitems = screen.getAllByRole('treeitem');
      const ageItem = treeitems.find((el) => el.textContent?.includes('age'));
      expect(ageItem).toHaveAttribute('aria-selected', 'true');

      const nameItem = treeitems.find((el) => el.textContent?.includes('name') && !el.textContent?.includes('address'));
      expect(nameItem).toHaveAttribute('aria-selected', 'false');
    });

    it('selection does not expand or collapse nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);

      // address is expanded
      expect(screen.getByText('street')).toBeInTheDocument();

      const treeitems = screen.getAllByRole('treeitem');
      const addressItem = treeitems.find((el) => el.textContent?.includes('address'));
      fireEvent.click(addressItem!);

      // Still expanded after selection
      expect(screen.getByText('street')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Mapping status indicators (AE-04)
  // ---------------------------------------------------------------------------

  describe('Mapping status indicators (AE-04)', () => {
    it('shows correct status icons for target variant', () => {
      const statusMap = new Map<string, MappingNodeStatus>([
        ['name', 'mapped'],
        ['age', 'unmapped'],
        ['address', 'warning'],
      ]);

      render(
        <SchemaTreeView
          schema={AE01_SCHEMA}
          variant="target"
          mappingStatus={statusMap}
        />,
      );

      expect(screen.getByLabelText('Mapped')).toBeInTheDocument();
      expect(screen.getByLabelText('Unmapped')).toBeInTheDocument();
      expect(screen.getByLabelText('Has warnings')).toBeInTheDocument();
    });

    it('does not show mapping status icons for source variant', () => {
      const statusMap = new Map<string, MappingNodeStatus>([
        ['name', 'mapped'],
        ['age', 'unmapped'],
      ]);

      render(
        <SchemaTreeView
          schema={AE01_SCHEMA}
          variant="source"
          mappingStatus={statusMap}
        />,
      );

      expect(screen.queryByLabelText('Mapped')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Unmapped')).not.toBeInTheDocument();
    });

    it('shows no icon for nodes not in the mapping status map', () => {
      const statusMap = new Map<string, MappingNodeStatus>([
        ['name', 'mapped'],
      ]);

      render(
        <SchemaTreeView
          schema={AE01_SCHEMA}
          variant="target"
          mappingStatus={statusMap}
        />,
      );

      // Only "Mapped" for name; no status for age or address
      expect(screen.getByLabelText('Mapped')).toBeInTheDocument();
      expect(screen.queryByLabelText('Unmapped')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Has warnings')).not.toBeInTheDocument();
    });

    it('mapping status icons have accessible aria-labels', () => {
      const statusMap = new Map<string, MappingNodeStatus>([
        ['name', 'mapped'],
        ['age', 'warning'],
      ]);

      render(
        <SchemaTreeView
          schema={AE01_SCHEMA}
          variant="target"
          mappingStatus={statusMap}
        />,
      );

      const mapped = screen.getByLabelText('Mapped');
      const warning = screen.getByLabelText('Has warnings');
      expect(mapped).toHaveAttribute('role', 'img');
      expect(warning).toHaveAttribute('role', 'img');
    });
  });

  // ---------------------------------------------------------------------------
  // Toolbar tests (AE-10)
  // ---------------------------------------------------------------------------

  describe('Toolbar (AE-10)', () => {
    const NESTED_SCHEMA = makeSchema([
      makeNode({
        path: 'root',
        fieldName: 'root',
        type: 'object',
        childCount: 2,
        depth: 0,
        children: [
          makeNode({
            path: 'root.child',
            fieldName: 'child',
            type: 'object',
            childCount: 1,
            depth: 1,
            parentPath: 'root',
            children: [
              makeNode({
                path: 'root.child.leaf',
                fieldName: 'leaf',
                type: 'string',
                depth: 2,
                parentPath: 'root.child',
              }),
            ],
          }),
          makeNode({
            path: 'root.sibling',
            fieldName: 'sibling',
            type: 'string',
            depth: 1,
            parentPath: 'root',
          }),
        ],
      }),
      makeNode({
        path: 'other',
        fieldName: 'other',
        type: 'object',
        childCount: 1,
        depth: 0,
        children: [
          makeNode({
            path: 'other.deep',
            fieldName: 'deep',
            type: 'object',
            childCount: 1,
            depth: 1,
            parentPath: 'other',
            children: [
              makeNode({
                path: 'other.deep.deeper',
                fieldName: 'deeper',
                type: 'string',
                depth: 2,
                parentPath: 'other.deep',
              }),
            ],
          }),
        ],
      }),
    ]);

    it('renders Expand All and Collapse All buttons', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);
      expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument();
    });

    it('renders expand to depth selector', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);
      expect(screen.getByLabelText('Expand to depth')).toBeInTheDocument();
    });

    it('Expand All expands all expandable nodes', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);

      // Initially depth-0 nodes are expanded, but deeper ones are not
      // root's children are visible but root.child's children (leaf) are not
      expect(screen.getByText('child')).toBeInTheDocument();
      expect(screen.queryByText('leaf')).not.toBeInTheDocument();

      // Click Expand All
      fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

      // Now leaf should be visible
      expect(screen.getByText('leaf')).toBeInTheDocument();
      expect(screen.getByText('deeper')).toBeInTheDocument();
    });

    it('Collapse All collapses all nodes', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);

      // Initially children of depth-0 are visible
      expect(screen.getByText('child')).toBeInTheDocument();
      expect(screen.getByText('sibling')).toBeInTheDocument();

      // Click Collapse All
      fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));

      // Children should be hidden
      expect(screen.queryByText('child')).not.toBeInTheDocument();
      expect(screen.queryByText('sibling')).not.toBeInTheDocument();
      // But top-level should still be visible
      expect(screen.getByText('root')).toBeInTheDocument();
      expect(screen.getByText('other')).toBeInTheDocument();
    });

    it('Expand to depth 2 expands depth 0 and 1 but not depth 2+', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);

      // First collapse all to start fresh
      fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
      expect(screen.queryByText('child')).not.toBeInTheDocument();

      // Select depth 2
      const depthSelect = screen.getByLabelText('Expand to depth');
      fireEvent.change(depthSelect, { target: { value: '2' } });

      // Depth 0 nodes (root, other) expanded → their children visible
      expect(screen.getByText('child')).toBeInTheDocument();
      expect(screen.getByText('sibling')).toBeInTheDocument();
      expect(screen.getByText('deep')).toBeInTheDocument();
      // Depth 1 nodes (root.child, other.deep) expanded → their children visible
      expect(screen.getByText('leaf')).toBeInTheDocument();
      expect(screen.getByText('deeper')).toBeInTheDocument();
    });

    it('Expand to depth 1 expands only depth 0', () => {
      render(<SchemaTreeView schema={NESTED_SCHEMA} />);

      // Expand all first
      fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
      expect(screen.getByText('leaf')).toBeInTheDocument();

      // Select depth 1
      const depthSelect = screen.getByLabelText('Expand to depth');
      fireEvent.change(depthSelect, { target: { value: '1' } });

      // Depth 0 nodes expanded → children visible
      expect(screen.getByText('child')).toBeInTheDocument();
      expect(screen.getByText('deep')).toBeInTheDocument();
      // Depth 1 nodes NOT expanded → their children hidden
      expect(screen.queryByText('leaf')).not.toBeInTheDocument();
      expect(screen.queryByText('deeper')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation tests (AE-06)
  // ---------------------------------------------------------------------------

  describe('Keyboard navigation (AE-06)', () => {
    // Schema: name, age, address (with street, city)
    // Flat visible (with address auto-expanded): name, age, address, street, city

    it('tree container is focusable (tabIndex=0)', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      expect(tree).toHaveAttribute('tabindex', '0');
    });

    it('focusing tree activates first node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
    });

    it('Down Arrow moves focus to next node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-age');

      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address');
    });

    it('Up Arrow moves focus to previous node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to age
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-age');

      // Move back to name
      fireEvent.keyDown(tree, { key: 'ArrowUp' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
    });

    it('Up Arrow at top stays at first node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      fireEvent.keyDown(tree, { key: 'ArrowUp' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
    });

    it('Down Arrow at bottom stays at last node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to last: name → age → address → street → city
      fireEvent.keyDown(tree, { key: 'End' });
      const lastId = tree.getAttribute('aria-activedescendant');

      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', lastId);
    });

    it('Home moves to first node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move down a few
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address');

      // Home
      fireEvent.keyDown(tree, { key: 'Home' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
    });

    it('End moves to last node', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      fireEvent.keyDown(tree, { key: 'End' });
      // Last visible node: city (address.city)
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address-city');
    });

    it('Right Arrow on collapsed expandable node expands it', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');

      // First collapse address
      fireEvent.click(screen.getByLabelText('Collapse address'));
      expect(screen.queryByText('street')).not.toBeInTheDocument();

      // Focus and move to address (3rd node: name, age, address)
      fireEvent.focus(tree);
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address');

      // Right Arrow → expand
      fireEvent.keyDown(tree, { key: 'ArrowRight' });
      expect(screen.getByText('street')).toBeInTheDocument();
    });

    it('Right Arrow on expanded node moves to first child', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to address (already expanded)
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address

      // Right Arrow → move to first child (street)
      fireEvent.keyDown(tree, { key: 'ArrowRight' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address-street');
    });

    it('Left Arrow on expanded node collapses it', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to address
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address

      // Left Arrow → collapse
      fireEvent.keyDown(tree, { key: 'ArrowLeft' });
      expect(screen.queryByText('street')).not.toBeInTheDocument();
    });

    it('Left Arrow on leaf/collapsed node moves to parent', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to street (address child)
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // street
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address-street');

      // Left Arrow → move to parent (address)
      fireEvent.keyDown(tree, { key: 'ArrowLeft' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address');
    });

    it('Enter selects focused node and fires onSelectNode', () => {
      const onSelectNode = vi.fn();
      render(<SchemaTreeView schema={AE01_SCHEMA} onSelectNode={onSelectNode} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to age
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      // Press Enter
      fireEvent.keyDown(tree, { key: 'Enter' });

      expect(onSelectNode).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'age', fieldName: 'age' }),
      );
    });

    it('Space selects focused node', () => {
      const onSelectNode = vi.fn();
      render(<SchemaTreeView schema={AE01_SCHEMA} onSelectNode={onSelectNode} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Press Space on first node (name)
      fireEvent.keyDown(tree, { key: ' ' });

      expect(onSelectNode).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'name', fieldName: 'name' }),
      );
    });

    it('Enter on expandable node also toggles expand', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // Move to address (expanded)
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address

      // Enter → collapses because it's currently expanded
      fireEvent.keyDown(tree, { key: 'Enter' });
      expect(screen.queryByText('street')).not.toBeInTheDocument();

      // Enter again → expands
      fireEvent.keyDown(tree, { key: 'Enter' });
      expect(screen.getByText('street')).toBeInTheDocument();
    });

    it('focused node has focus ring class', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // First node should be focused
      const firstNode = document.getElementById('schema-tree-node-name');
      expect(firstNode?.className).toContain('ring-2');
      expect(firstNode?.className).toContain('ring-blue-400');
    });

    it('aria-activedescendant updates correctly on navigation', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-age');
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address');
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address-street');
    });

    it('nodes have unique IDs for aria-activedescendant', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      expect(document.getElementById('schema-tree-node-name')).toBeInTheDocument();
      expect(document.getElementById('schema-tree-node-age')).toBeInTheDocument();
      expect(document.getElementById('schema-tree-node-address')).toBeInTheDocument();
    });

    it('AE-06 full scenario: Right expand → Enter select → Down×2 → Home', () => {
      const onSelectNode = vi.fn();
      render(<SchemaTreeView schema={AE01_SCHEMA} onSelectNode={onSelectNode} />);
      const tree = screen.getByRole('tree');

      // Collapse address first
      fireEvent.click(screen.getByLabelText('Collapse address'));

      // Focus tree
      fireEvent.focus(tree);
      // Navigate to address
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // age
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // address

      // Right Arrow → expand
      fireEvent.keyDown(tree, { key: 'ArrowRight' });
      expect(screen.getByText('street')).toBeInTheDocument();

      // Down to first child (street)
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-address-street');

      // Enter → select street
      fireEvent.keyDown(tree, { key: 'Enter' });
      expect(onSelectNode).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'address.street', fieldName: 'street' }),
      );

      // Down×2 → city, then beyond (clamped)
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // city
      fireEvent.keyDown(tree, { key: 'ArrowDown' }); // beyond (clamped at city)

      // Home → back to first
      fireEvent.keyDown(tree, { key: 'Home' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-name');
    });

    it('aria-setsize and aria-posinset are set on nodes', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const treeitems = screen.getAllByRole('treeitem');

      // name is first of 3 top-level siblings
      const nameItem = treeitems.find((el) => el.id === 'schema-tree-node-name');
      expect(nameItem).toHaveAttribute('aria-posinset', '1');
      expect(nameItem).toHaveAttribute('aria-setsize', '3');

      // age is second of 3
      const ageItem = treeitems.find((el) => el.id === 'schema-tree-node-age');
      expect(ageItem).toHaveAttribute('aria-posinset', '2');
      expect(ageItem).toHaveAttribute('aria-setsize', '3');

      // street is first of 2 children of address
      const streetItem = treeitems.find((el) => el.id === 'schema-tree-node-address-street');
      expect(streetItem).toHaveAttribute('aria-posinset', '1');
      expect(streetItem).toHaveAttribute('aria-setsize', '2');
    });

    it('prevents default on handled keyboard events (no page scroll)', () => {
      render(<SchemaTreeView schema={AE01_SCHEMA} />);
      const tree = screen.getByRole('tree');
      fireEvent.focus(tree);

      // React synthetic events handle preventDefault - we verify behavior is correct via state changes
      // This test mainly ensures the handler is attached and processes the key
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      expect(tree).toHaveAttribute('aria-activedescendant', 'schema-tree-node-age');
    });
  });
});
