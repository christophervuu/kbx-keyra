import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { TargetWorklist } from './TargetWorklist';

import type { ValidationResult } from '@/lib/engine';
import type { MappingRule, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeNode = (
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'] = 'string',
  depth = 0,
  isRequired = false,
  children: SchemaTreeNode[] = [],
): SchemaTreeNode => ({
  path,
  fieldName,
  type,
  depth,
  isArray: type === 'array',
  isRequired,
  parentPath: depth > 0 ? path.split('.').slice(0, -1).join('.') : null,
  childCount: children.length,
  children,
});

const FLAT_NODES: SchemaTreeNode[] = [
  makeNode('firstName', 'firstName', 'string', 0, true),
  makeNode('lastName', 'lastName', 'string', 0, false),
  makeNode('age', 'age', 'number', 0, false),
];

const NESTED_NODES: SchemaTreeNode[] = (() => {
  const nameChildren = [
    makeNode('name.first', 'first', 'string', 1, true),
    makeNode('name.last', 'last', 'string', 1, false),
  ];
  const nameNode = makeNode('name', 'name', 'object', 0, false, nameChildren);
  return [nameNode, ...nameChildren, makeNode('age', 'age', 'number', 0)];
})();

const makeArrayTree = (arrayPath: string, childCount: number): SchemaTreeNode[] => {
  const children = Array.from({ length: childCount }, (_, index) =>
    makeNode(`${arrayPath}.field${index + 1}`, `field${index + 1}`, 'string', 1, index % 3 === 0),
  );
  const parent = makeNode(arrayPath, arrayPath.split('.').at(-1) ?? 'items', 'array', 0, false, children);
  return [parent, ...children];
};

const makeRule = (target: string): MappingRule => ({
  target,
  type: 'string',
  expression: `source("${target}")`,
});

const makeValidation = (diagnostics: ValidationResult['diagnostics']): ValidationResult => ({
  valid: diagnostics.length === 0,
  diagnostics,
});

const DEFAULT_PROPS = {
  rules: [] as MappingRule[],
  validationResult: null,
  selectedPath: null,
  groupingMode: 'schema' as const,
  onSelectNode: vi.fn(),
  sort: 'schema' as const,
  onSortChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TargetWorklist', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all target fields from a flat schema', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-age')).toBeInTheDocument();
  });

  it('shows empty state when no nodes provided', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={[]} />);
    expect(screen.getByTestId('target-worklist-empty')).toBeInTheDocument();
  });

  it('shows unmapped status when no rules exist', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={[]} />);
    expect(screen.getAllByTestId('status-icon-unmapped')).toHaveLength(3);
  });

  it('shows mapped status when a matching rule exists', () => {
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    expect(screen.getByTestId('status-icon-mapped')).toBeInTheDocument();
    expect(screen.getAllByTestId('status-icon-unmapped')).toHaveLength(2);
  });

  it('shows AI status icon for suggested auto-map rows', () => {
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        autoMapSuggestionStatusByPath={{ firstName: 'suggested' }}
      />,
    );
    expect(screen.getByTestId('status-icon-ai')).toBeInTheDocument();
  });

  it('shows warning status from validation diagnostics', () => {
    const rules = [makeRule('firstName')];
    const validation = makeValidation([
      { code: 'W001', severity: 'warning', message: 'warn', targetPath: 'firstName' },
    ]);
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} validationResult={validation} />,
    );
    expect(screen.getByTestId('status-icon-warning')).toBeInTheDocument();
  });

  it('shows error status from validation diagnostics', () => {
    const rules = [makeRule('firstName')];
    const validation = makeValidation([
      { code: 'E001', severity: 'error', message: 'err', targetPath: 'firstName' },
    ]);
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} validationResult={validation} />,
    );
    expect(screen.getByTestId('status-icon-error')).toBeInTheDocument();
  });

  it('fires onSelectNode with correct path and type when row is clicked', () => {
    const onSelectNode = vi.fn();
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} onSelectNode={onSelectNode} />,
    );
    fireEvent.click(screen.getByTestId('target-field-row-firstName'));
    expect(onSelectNode).toHaveBeenCalledWith('firstName', 'string');
  });

  it('renders muted sample output preview when provided', () => {
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        sampleOutputByTargetPath={{ firstName: 'Alice' }}
      />,
    );
    expect(screen.getAllByTestId('sample-output-preview').length).toBeGreaterThan(0);
  });

  it('calls onClearSelection when Clear active row is clicked', () => {
    const onClearSelection = vi.fn();
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        selectedPath="firstName"
        onClearSelection={onClearSelection}
      />,
    );
    fireEvent.click(screen.getByTestId('target-clear-selection'));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('emits visible scope metadata for auto-map affordance', () => {
    const onVisibleScopeChange = vi.fn();
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        onVisibleScopeChange={onVisibleScopeChange}
      />,
    );
    expect(onVisibleScopeChange).toHaveBeenCalled();
    const lastCall = onVisibleScopeChange.mock.calls.at(-1)?.[0];
    expect(lastCall.count).toBe(3);
    expect(lastCall.visibleTargetPaths).toEqual(expect.arrayContaining(['firstName', 'lastName', 'age']));
  });

  it('highlights the selected field', () => {
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} selectedPath="lastName" />,
    );
    const row = screen.getByTestId('target-field-row-lastName');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });

  it('renders object node with coverage text after expanding', () => {
    const rules = [makeRule('name.first')];
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={NESTED_NODES} rules={rules} />,
    );
    // Expand the name node
    fireEvent.click(screen.getByTestId('expand-toggle-name'));
    expect(screen.getByTestId('coverage-text')).toHaveTextContent('1/2');
  });

  it('shows mapped status for array item descendants when array target has a rule', () => {
    const itemProductCode = makeNode('lineItems.productCode', 'productCode', 'string', 1, false);
    const itemQty = makeNode('lineItems.qty', 'qty', 'number', 1, false);
    const lineItems = makeNode('lineItems', 'lineItems', 'array', 0, false, [itemProductCode, itemQty]);
    const nodesWithArray = [lineItems, itemProductCode, itemQty];

    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={nodesWithArray}
        rules={[makeRule('lineItems')]}
      />,
    );

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));
    expect(screen.getAllByTestId('status-icon-mapped')).toHaveLength(3);
  });

  it('shows prioritized child subset for medium arrays (26–75 children)', () => {
    const nodes = makeArrayTree('lineItems', 30);
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={nodes} />);

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));

    expect(screen.getByTestId('array-summary-lineItems')).toHaveTextContent('Showing 25 prioritized of 30 child fields');
    expect(screen.getByTestId('array-summary-lineItems')).toHaveTextContent('Items: —');
    const renderedChildren = screen.getAllByTestId(/^target-field-row-lineItems\.field\d+$/);
    expect(renderedChildren).toHaveLength(25);
    expect(screen.getByTestId('target-field-row-lineItems.field1')).toBeInTheDocument();
  });

  it('shows summary-first expansion for large arrays (>75 children)', () => {
    const nodes = makeArrayTree('lineItems', 80);
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={nodes} />);

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));

    const summary = screen.getByTestId('array-summary-lineItems');
    expect(summary).toHaveTextContent('80 child fields available');
    expect(summary).toHaveTextContent('Open Array Builder');
    expect(screen.queryByTestId('target-field-row-lineItems.field1')).not.toBeInTheDocument();
    expect(screen.getByTestId('array-view-all-lineItems')).toBeInTheDocument();
    expect(screen.getByTestId('array-view-prioritized-lineItems')).toBeInTheDocument();
  });

  it('supports View all child fields action for large arrays', () => {
    const nodes = makeArrayTree('lineItems', 80);
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={nodes} />);

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));
    fireEvent.click(screen.getByTestId('array-view-all-lineItems'));

    expect(screen.getByTestId('target-field-row-lineItems.field1')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-lineItems.field80')).toBeInTheDocument();
  });

  it('routes Open Array Builder action to array parent selection', () => {
    const onSelectNode = vi.fn();
    const nodes = makeArrayTree('lineItems', 80);
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={nodes}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));
    fireEvent.click(screen.getByTestId('array-open-builder-lineItems'));

    expect(onSelectNode).toHaveBeenCalledWith('lineItems', 'array');
  });

  it('shows array parent source summary, method label, and sample item count', () => {
    const nodes = makeArrayTree('lineItems', 30);
    const rules: MappingRule[] = [
      {
        target: 'lineItems',
        type: 'array',
        expression: 'map(source("order.items"), item())',
      },
    ];

    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={nodes}
        rules={rules}
        sampleArrayItemCountByTargetPath={{ lineItems: 12 }}
      />,
    );

    fireEvent.click(screen.getByTestId('expand-toggle-lineItems'));
    const summary = screen.getByTestId('array-summary-lineItems');
    expect(summary).toHaveTextContent('Method: Map list');
    expect(summary).toHaveTextContent('Source list: order.items');
    expect(summary).toHaveTextContent('Items: 12');
  });

  it('shows extracted source field path instead of raw DSL in source summary', () => {
    const rules: MappingRule[] = [
      {
        target: 'firstName',
        type: 'string',
        expression: 'source("customer.name")',
      },
    ];

    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);

    const sourceCell = screen.getByTestId('target-field-row-firstName').querySelector('[data-testid="source-summary"]');
    expect(sourceCell).toHaveTextContent('customer.name');
    expect(sourceCell).not.toHaveTextContent('source("customer.name")');
  });

  it('shows enrichment input method label and alias-qualified source summary for enrichment-only expression', () => {
    const rules: MappingRule[] = [
      {
        target: 'firstName',
        type: 'string',
        expression: 'get(external("customerProfile"), "name")',
      },
    ];

    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);

    const row = screen.getByTestId('target-field-row-firstName');
    const sourceCell = row.querySelector('[data-testid="source-summary"]');
    const methodCell = row.querySelector('[data-testid="mapping-type"]');

    expect(sourceCell).toHaveTextContent('customerProfile.name');
    expect(methodCell).toHaveTextContent('Enrichment input');
  });

  it('shows Mixed inputs method label when expression combines primary and enrichment inputs', () => {
    const rules: MappingRule[] = [
      {
        target: 'firstName',
        type: 'string',
        expression: 'concat(source("firstName"), get(external("customerProfile"), "name"))',
      },
    ];

    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);

    const row = screen.getByTestId('target-field-row-firstName');
    const methodCell = row.querySelector('[data-testid="mapping-type"]');
    expect(methodCell).toHaveTextContent('Mixed inputs');
  });


  it('shows children after expanding an object node', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={NESTED_NODES} />);
    // Children not visible before expand
    expect(screen.queryByTestId('target-field-row-name.first')).not.toBeInTheDocument();
    // Expand
    fireEvent.click(screen.getByTestId('expand-toggle-name'));
    expect(screen.getByTestId('target-field-row-name.first')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-name.last')).toBeInTheDocument();
  });

  it('hides children after collapsing an expanded node', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={NESTED_NODES} />);
    fireEvent.click(screen.getByTestId('expand-toggle-name'));
    expect(screen.getByTestId('target-field-row-name.first')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('expand-toggle-name'));
    expect(screen.queryByTestId('target-field-row-name.first')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Internal search input
  // ---------------------------------------------------------------------------

  it('renders the internal search input', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.getByTestId('target-search')).toBeInTheDocument();
  });

  it('filters fields by typing in the search input', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'first' } });
    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('shows no-results state when search matches nothing', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'zzznomatch' } });
    expect(screen.getByTestId('target-worklist-no-results')).toBeInTheDocument();
  });

  it('shows clear button when search has a value', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.queryByTestId('target-search-clear')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'first' } });
    expect(screen.getByTestId('target-search-clear')).toBeInTheDocument();
  });

  it('clear button resets search and shows all fields', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'first' } });
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('target-search-clear'));
    expect(screen.getByTestId('target-field-row-lastName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-search-clear')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Filter menu
  // ---------------------------------------------------------------------------

  it('renders Filters button on the search row', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.getByTestId('target-filter-button')).toBeInTheDocument();
  });

  it('shows all filter options in the filter menu', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.click(screen.getByTestId('target-filter-button'));

    expect(screen.getByTestId('target-filter-menu')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-required')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-unmapped')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-warnings')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-errors')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-ai-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-mapped')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-has-notes')).toBeInTheDocument();
  });

  it('activates one filter option at a time', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);

    fireEvent.click(screen.getByTestId('target-filter-button'));

    expect(screen.getByTestId('target-filter-all')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByTestId('target-filter-required'));
    fireEvent.click(screen.getByTestId('target-filter-button'));
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('target-filter-all')).toHaveAttribute('aria-checked', 'false');
  });

  it('Required tab shows only required fields', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-required'));

    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('Unmapped tab shows only unmapped fields', () => {
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-unmapped'));

    expect(screen.queryByTestId('target-field-row-firstName')).not.toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-age')).toBeInTheDocument();
  });

  it('Warnings tab shows only warning fields', () => {
    const rules = [makeRule('firstName'), makeRule('lastName')];
    const validation = makeValidation([
      { code: 'W001', severity: 'warning', message: 'warn', targetPath: 'firstName' },
    ]);
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} validationResult={validation} />,
    );
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-warnings'));

    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('Errors tab shows only error fields', () => {
    const rules = [makeRule('firstName'), makeRule('lastName')];
    const validation = makeValidation([
      { code: 'E001', severity: 'error', message: 'err', targetPath: 'lastName' },
    ]);
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} validationResult={validation} />,
    );
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-errors'));

    expect(screen.queryByTestId('target-field-row-firstName')).not.toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-lastName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('AI Suggestions tab shows only suggested rows', () => {
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        autoMapSuggestionStatusByPath={{ firstName: 'suggested' }}
      />,
    );
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-ai-suggestions'));

    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('Mapped tab shows mapped non-suggested rows only', () => {
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        rules={[makeRule('firstName'), makeRule('lastName')]}
        autoMapSuggestionStatusByPath={{ lastName: 'suggested' }}
      />,
    );
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-mapped'));

    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('Has Notes tab shows rows with rule description notes', () => {
    const rules: MappingRule[] = [
      {
        target: 'firstName',
        type: 'string',
        expression: 'source("firstName")',
        description: 'Reviewed by analyst',
      },
    ];

    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    fireEvent.click(screen.getByTestId('target-filter-button'));
    fireEvent.click(screen.getByTestId('target-filter-has-notes'));

    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('does not render visible scope count text', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.queryByTestId('visible-scope-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/Scope:/i)).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Grouping modes
  // ---------------------------------------------------------------------------

  it('groups required fields first in required-first mode', () => {
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} groupingMode="required-first" />,
    );
    const rows = screen.getAllByRole('row');
    // firstName is required — should be first
    expect(rows[0]).toHaveAttribute('data-testid', 'target-field-row-firstName');
  });

  it('groups unmapped fields first in unmapped-first mode', () => {
    const rules = [makeRule('firstName')]; // firstName is mapped
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        rules={rules}
        groupingMode="unmapped-first"
      />,
    );
    const rows = screen.getAllByRole('row');
    // lastName and age are unmapped — should come before firstName
    const firstRowTestId = rows[0].getAttribute('data-testid');
    expect(firstRowTestId).not.toBe('target-field-row-firstName');
  });

  it('groups warning/error fields first in warnings-first mode', () => {
    const rules = [makeRule('firstName'), makeRule('lastName'), makeRule('age')];
    const validation = makeValidation([
      { code: 'E001', severity: 'error', message: 'err', targetPath: 'age' },
    ]);
    render(
      <TargetWorklist
        {...DEFAULT_PROPS}
        nodes={FLAT_NODES}
        rules={rules}
        validationResult={validation}
        groupingMode="warnings-first"
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(rows[0]).toHaveAttribute('data-testid', 'target-field-row-age');
  });

  it('does not show expression summary on mapped field rows', () => {
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    expect(screen.queryByTestId('expression-summary')).not.toBeInTheDocument();
  });

  it('does not render breadcrumb-nav', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.queryByTestId('breadcrumb-nav')).not.toBeInTheDocument();
  });

  it('clicking an object node calls onSelectNode (not drill-down)', () => {
    const onSelectNode = vi.fn();
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={NESTED_NODES} onSelectNode={onSelectNode} />);
    fireEvent.click(screen.getByTestId('target-field-row-name'));
    expect(onSelectNode).toHaveBeenCalledWith('name', 'object');
  });

  it('renders condensed header columns (status, target field, notes) in condensed mode', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} condensed />);

    expect(screen.getByTestId('target-worklist-container')).toHaveAttribute('data-condensed', 'true');
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Target field')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Source field')).not.toBeInTheDocument();
    expect(screen.queryByText('Method')).not.toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-firstName')).toHaveAttribute('data-condensed', 'true');
  });
});
