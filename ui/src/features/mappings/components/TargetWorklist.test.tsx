import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TargetWorklist', () => {
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
    expect(screen.getByTestId('coverage-text')).toHaveTextContent('1/2 mapped');
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
  // Filter chips
  // ---------------------------------------------------------------------------

  it('renders all four filter chips', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.getByTestId('target-filter-unmapped')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-warnings')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-required')).toBeInTheDocument();
    expect(screen.getByTestId('target-filter-arrays')).toBeInTheDocument();
  });

  it('filter chips start inactive (aria-pressed=false)', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    expect(screen.getByTestId('target-filter-unmapped')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking a filter chip activates it (aria-pressed=true)', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.click(screen.getByTestId('target-filter-required'));
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking an active filter chip deactivates it', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.click(screen.getByTestId('target-filter-required'));
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('target-filter-required'));
    expect(screen.getByTestId('target-filter-required')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Required filter shows only required fields', () => {
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} />);
    fireEvent.click(screen.getByTestId('target-filter-required'));
    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
  });

  it('Unmapped filter shows only unmapped fields', () => {
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    fireEvent.click(screen.getByTestId('target-filter-unmapped'));
    expect(screen.queryByTestId('target-field-row-firstName')).not.toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-lastName')).toBeInTheDocument();
    expect(screen.getByTestId('target-field-row-age')).toBeInTheDocument();
  });

  it('AND logic: Required + Unmapped shows only required AND unmapped fields', () => {
    // firstName is required but mapped; lastName is not required; age is not required
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    fireEvent.click(screen.getByTestId('target-filter-required'));
    fireEvent.click(screen.getByTestId('target-filter-unmapped'));
    // firstName is required but mapped — fails unmapped filter
    // lastName/age are unmapped but not required — fail required filter
    expect(screen.getByTestId('target-worklist-no-results')).toBeInTheDocument();
  });

  it('Arrays filter shows only array-type fields', () => {
    const nodesWithArray: SchemaTreeNode[] = [
      ...FLAT_NODES,
      makeNode('tags', 'tags', 'array', 0, false),
    ];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={nodesWithArray} />);
    fireEvent.click(screen.getByTestId('target-filter-arrays'));
    expect(screen.getByTestId('target-field-row-tags')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-firstName')).not.toBeInTheDocument();
  });

  it('Warnings filter shows only fields with warning/error status', () => {
    const rules = [makeRule('firstName'), makeRule('lastName')];
    const validation = makeValidation([
      { code: 'W001', severity: 'warning', message: 'warn', targetPath: 'firstName' },
    ]);
    render(
      <TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} validationResult={validation} />,
    );
    fireEvent.click(screen.getByTestId('target-filter-warnings'));
    expect(screen.getByTestId('target-field-row-firstName')).toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-lastName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('target-field-row-age')).not.toBeInTheDocument();
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

  it('shows expression summary on mapped field rows', () => {
    const rules = [makeRule('firstName')];
    render(<TargetWorklist {...DEFAULT_PROPS} nodes={FLAT_NODES} rules={rules} />);
    expect(screen.getByTestId('expression-summary')).toBeInTheDocument();
  });
});
