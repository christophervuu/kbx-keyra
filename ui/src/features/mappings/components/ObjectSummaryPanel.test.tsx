import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ObjectSummaryPanel } from './ObjectSummaryPanel';
import type { ChildFieldInfo, ObjectSummaryPanelProps } from './ObjectSummaryPanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHILDREN: ChildFieldInfo[] = [
  { path: 'patient.firstName', fieldName: 'firstName', fieldType: 'string', status: 'mapped', required: true },
  { path: 'patient.lastName', fieldName: 'lastName', fieldType: 'string', status: 'unmapped', required: false },
  { path: 'patient.age', fieldName: 'age', fieldType: 'number', status: 'warning', required: false },
  { path: 'patient.id', fieldName: 'id', fieldType: 'string', status: 'error', required: true },
];

const DEFAULT_PROPS: ObjectSummaryPanelProps = {
  objectPath: 'patient',
  childFields: CHILDREN,
  coverage: { mapped: 1, total: 4 },
  onFilterRequired: vi.fn(),
  onValidateSection: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ObjectSummaryPanel', () => {
  it('renders object path in header', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('object-path')).toHaveTextContent('patient');
  });

  it('renders coverage text', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('coverage-indicator')).toHaveTextContent('1/4 mapped');
  });

  it('renders all children in the list', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('child-row-patient.firstName')).toBeInTheDocument();
    expect(screen.getByTestId('child-row-patient.lastName')).toBeInTheDocument();
    expect(screen.getByTestId('child-row-patient.age')).toBeInTheDocument();
    expect(screen.getByTestId('child-row-patient.id')).toBeInTheDocument();
  });

  it('shows mapped status icon for mapped child', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.firstName');
    expect(row.querySelector('[aria-label="Mapped"]')).toBeInTheDocument();
  });

  it('shows unmapped status icon for unmapped child', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.lastName');
    expect(row.querySelector('[aria-label="Unmapped"]')).toBeInTheDocument();
  });

  it('shows warning status icon for warning child', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.age');
    expect(row.querySelector('[aria-label="Warning"]')).toBeInTheDocument();
  });

  it('shows error status icon for error child', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.id');
    expect(row.querySelector('[aria-label="Error"]')).toBeInTheDocument();
  });

  it('error child row has visual emphasis class', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.id');
    expect(row.className).toContain('bg-red-950');
  });

  it('warning child row has visual emphasis class', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.age');
    expect(row.className).toContain('bg-amber-950');
  });

  it('Auto-map section button is disabled', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('automap-btn')).toBeDisabled();
  });

  it('Auto-map section button has correct tooltip', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('automap-btn')).toHaveAttribute(
      'title',
      'AI-powered auto-mapping \u2014 available in a future release',
    );
  });

  it('clicking disabled Auto-map button does not fire any handler', () => {
    const onFilterRequired = vi.fn();
    const onValidateSection = vi.fn();
    render(
      <ObjectSummaryPanel
        {...DEFAULT_PROPS}
        onFilterRequired={onFilterRequired}
        onValidateSection={onValidateSection}
      />,
    );
    fireEvent.click(screen.getByTestId('automap-btn'));
    expect(onFilterRequired).not.toHaveBeenCalled();
    expect(onValidateSection).not.toHaveBeenCalled();
  });

  it('clicking Map required fields first fires onFilterRequired with object path', () => {
    const onFilterRequired = vi.fn();
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} onFilterRequired={onFilterRequired} />);
    fireEvent.click(screen.getByTestId('filter-required-btn'));
    expect(onFilterRequired).toHaveBeenCalledWith('patient');
  });

  it('clicking Validate section fires onValidateSection with object path', () => {
    const onValidateSection = vi.fn();
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} onValidateSection={onValidateSection} />);
    fireEvent.click(screen.getByTestId('validate-section-btn'));
    expect(onValidateSection).toHaveBeenCalledWith('patient');
  });
});

// ---------------------------------------------------------------------------
// T-04: Clickable child rows and empty state (AE-06)
// ---------------------------------------------------------------------------

describe('ObjectSummaryPanel — clickable child rows (AE-06)', () => {
  it('child rows are rendered as buttons', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.firstName');
    expect(row.tagName).toBe('BUTTON');
  });

  it('clicking a child row fires onNavigateToChild with the child path', () => {
    const onNavigateToChild = vi.fn();
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} onNavigateToChild={onNavigateToChild} />);
    fireEvent.click(screen.getByTestId('child-row-patient.lastName'));
    expect(onNavigateToChild).toHaveBeenCalledWith('patient.lastName');
  });

  it('clicking a mapped child row fires onNavigateToChild with correct path', () => {
    const onNavigateToChild = vi.fn();
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} onNavigateToChild={onNavigateToChild} />);
    fireEvent.click(screen.getByTestId('child-row-patient.firstName'));
    expect(onNavigateToChild).toHaveBeenCalledWith('patient.firstName');
  });

  it('clicking a child row without onNavigateToChild does not throw', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(() => {
      fireEvent.click(screen.getByTestId('child-row-patient.firstName'));
    }).not.toThrow();
  });

  it('renders empty state when childFields is empty', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} childFields={[]} coverage={{ mapped: 0, total: 0 }} />);
    expect(screen.getByTestId('child-list-empty')).toBeInTheDocument();
    expect(screen.getByTestId('child-list-empty')).toHaveTextContent('No child fields');
    expect(screen.queryByTestId('child-list')).not.toBeInTheDocument();
  });

  it('renders object name and type badge in header (AE-06)', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('object-path')).toHaveTextContent('patient');
    // type badge is always rendered as "object"
    expect(screen.getByText('object')).toBeInTheDocument();
  });

  it('renders correct mapped ratio from coverage prop (AE-06)', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} coverage={{ mapped: 3, total: 7 }} />);
    expect(screen.getByTestId('coverage-indicator')).toHaveTextContent('3/7 mapped');
  });

  it('unmapped child shows unmapped indicator', () => {
    render(<ObjectSummaryPanel {...DEFAULT_PROPS} />);
    const row = screen.getByTestId('child-row-patient.lastName');
    expect(row.querySelector('[aria-label="Unmapped"]')).toBeInTheDocument();
  });
});
