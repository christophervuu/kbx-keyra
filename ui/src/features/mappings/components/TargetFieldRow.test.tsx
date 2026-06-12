import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TargetFieldRow } from './TargetFieldRow';
import { truncateExpression } from '../lib/truncate-expression';

// ---------------------------------------------------------------------------
// truncateExpression unit tests
// ---------------------------------------------------------------------------

describe('truncateExpression', () => {
  it('returns full expression when ≤ 60 chars', () => {
    const expr = 'source("firstName")';
    expect(truncateExpression(expr)).toBe(expr);
  });

  it('returns full expression when exactly 60 chars', () => {
    const expr = 'a'.repeat(60);
    expect(truncateExpression(expr)).toBe(expr);
  });

  it('truncates plain string (no function call) with ellipsis', () => {
    const expr = 'a'.repeat(80);
    const result = truncateExpression(expr);
    expect(result.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('shows outermost function name + first arg when truncated', () => {
    const expr = 'concat(source("firstName"), source("lastName"), source("middleName"))';
    const result = truncateExpression(expr);
    expect(result).toContain('concat');
    expect(result).toContain('source("firstName")');
    expect(result).toContain('\u2026');
    expect(result.length).toBeLessThanOrEqual(62);
  });

  it('shows full expression when single-arg function fits', () => {
    const expr = 'source("firstName")';
    expect(truncateExpression(expr)).toBe('source("firstName")');
  });

  it('replaces object template arg with {…}', () => {
    const expr = 'map(source("items"), {field: source("items[*].name"), other: source("items[*].id")})';
    const result = truncateExpression(expr);
    expect(result).toContain('map');
    expect(result).toContain('…');
  });

  it('respects custom maxLen', () => {
    const expr = 'concat(source("a"), source("b"))';
    const result = truncateExpression(expr, 20);
    expect(result.length).toBeLessThanOrEqual(22);
  });

  it('returns empty string unchanged', () => {
    expect(truncateExpression('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// TargetFieldRow fixtures
// ---------------------------------------------------------------------------

const BASE_PROPS = {
  fieldName: 'firstName',
  fieldPath: 'patient.firstName',
  fieldType: 'string' as const,
  required: false,
  status: 'unmapped' as const,
  isSelected: false,
  depth: 0,
  isExpandable: false,
  isExpanded: false,
  onClick: vi.fn(),
};

// ---------------------------------------------------------------------------
// TargetFieldRow tests
// ---------------------------------------------------------------------------

describe('TargetFieldRow', () => {
  it('renders field name', () => {
    render(<TargetFieldRow {...BASE_PROPS} />);
    expect(screen.getByText('firstName')).toBeInTheDocument();
  });

  it('renders type badge', () => {
    render(<TargetFieldRow {...BASE_PROPS} />);
    expect(screen.getByTestId('type-badge')).toHaveTextContent('str');
  });

  it('shows required indicator when required=true', () => {
    render(<TargetFieldRow {...BASE_PROPS} required={true} />);
    expect(screen.getByTestId('required-indicator')).toBeInTheDocument();
  });

  it('does not show required indicator when required=false', () => {
    render(<TargetFieldRow {...BASE_PROPS} required={false} />);
    expect(screen.queryByTestId('required-indicator')).not.toBeInTheDocument();
  });

  it('shows unmapped status icon', () => {
    render(<TargetFieldRow {...BASE_PROPS} status="unmapped" />);
    expect(screen.getByTestId('status-icon-unmapped')).toBeInTheDocument();
  });

  it('shows mapped status icon', () => {
    render(<TargetFieldRow {...BASE_PROPS} status="mapped" />);
    expect(screen.getByTestId('status-icon-mapped')).toBeInTheDocument();
  });

  it('shows warning status icon', () => {
    render(<TargetFieldRow {...BASE_PROPS} status="warning" />);
    expect(screen.getByTestId('status-icon-warning')).toBeInTheDocument();
  });

  it('shows error status icon', () => {
    render(<TargetFieldRow {...BASE_PROPS} status="error" />);
    expect(screen.getByTestId('status-icon-error')).toBeInTheDocument();
  });

  it('does not render expression summary row', () => {
    render(<TargetFieldRow {...BASE_PROPS} />);
    expect(screen.queryByTestId('expression-summary')).not.toBeInTheDocument();
  });

  it('renders mapping method in a badge', () => {
    render(<TargetFieldRow {...BASE_PROPS} mappingTypeLabel="Direct Copy" />);
    const method = screen.getByTestId('mapping-type');
    expect(method).toHaveTextContent('Direct Copy');
    const badge = method.querySelector('span');
    expect(badge?.className).toContain('rounded');
    expect(badge?.className).toContain('border');
  });

  it('applies indentation to target content based on depth', () => {
    const { rerender } = render(<TargetFieldRow {...BASE_PROPS} depth={0} />);
    let targetCell = screen.getByTestId('row-col-target');
    let targetContent = targetCell.querySelector('div');
    expect(targetContent).toHaveStyle({ paddingLeft: '0px' });

    rerender(<TargetFieldRow {...BASE_PROPS} depth={2} />);
    targetCell = screen.getByTestId('row-col-target');
    targetContent = targetCell.querySelector('div');
    expect(targetContent).toHaveStyle({ paddingLeft: '32px' });
  });

  it('shows expand chevron for expandable nodes', () => {
    render(<TargetFieldRow {...BASE_PROPS} isExpandable={true} isExpanded={false} />);
    expect(screen.getByTestId(`expand-toggle-${BASE_PROPS.fieldPath}`)).toBeInTheDocument();
  });

  it('does not show expand chevron for non-expandable nodes', () => {
    render(<TargetFieldRow {...BASE_PROPS} isExpandable={false} />);
    expect(screen.queryByTestId(`expand-toggle-${BASE_PROPS.fieldPath}`)).not.toBeInTheDocument();
  });

  it('fires onClick when row is clicked', () => {
    const onClick = vi.fn();
    render(<TargetFieldRow {...BASE_PROPS} onClick={onClick} />);
    fireEvent.click(screen.getByRole('row'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleExpand (not onClick) when chevron is clicked', () => {
    const onClick = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <TargetFieldRow
        {...BASE_PROPS}
        isExpandable={true}
        isExpanded={false}
        onClick={onClick}
        onToggleExpand={onToggleExpand}
      />,
    );
    fireEvent.click(screen.getByTestId(`expand-toggle-${BASE_PROPS.fieldPath}`));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies selected highlight class when isSelected=true', () => {
    render(<TargetFieldRow {...BASE_PROPS} isSelected={true} />);
    const row = screen.getByRole('row');
    expect(row.className).toContain('bg-blue-950/35');
  });

  it('does not apply selected highlight when isSelected=false', () => {
    render(<TargetFieldRow {...BASE_PROPS} isSelected={false} />);
    const row = screen.getByRole('row');
    expect(row.className).not.toContain('bg-blue-950/35');
  });

  it('displays coverage text for object nodes', () => {
    render(
      <TargetFieldRow
        {...BASE_PROPS}
        fieldType="object"
        isExpandable={true}
        coverage={{ mapped: 3, total: 5 }}
      />,
    );
    expect(screen.getByTestId('coverage-progress')).toBeInTheDocument();
    expect(screen.getByTestId('coverage-text')).toHaveTextContent('3/5');
  });

  it('does not display coverage text when not provided', () => {
    render(<TargetFieldRow {...BASE_PROPS} />);
    expect(screen.queryByTestId('coverage-text')).not.toBeInTheDocument();
  });

  it('row is keyboard focusable (tabIndex=0)', () => {
    render(<TargetFieldRow {...BASE_PROPS} />);
    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '0');
  });

  it('fires onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<TargetFieldRow {...BASE_PROPS} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Space key', () => {
    const onClick = vi.fn();
    render(<TargetFieldRow {...BASE_PROPS} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('row'), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
