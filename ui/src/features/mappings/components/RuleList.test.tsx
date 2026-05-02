import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticDetail } from './DiagnosticDetail';
import { RuleList } from './RuleList';
import { RuleRow } from './RuleRow';
import { ValidationSummaryBar } from './ValidationSummaryBar';

import type { Diagnostic } from '@/lib/engine';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_RULES: MappingRule[] = [
  { target: 'Order.Header.DocType', type: 'string', expression: 'static("PO")' },
  { target: 'Order.Header.Date', type: 'string', expression: 'source("orderDate")' },
  { target: 'Order.Lines', type: 'array', expression: 'map(source("items"), source("name"))' },
  { target: 'Order.Header.Status', type: 'string', expression: 'if(eq(source("urgent"), true), static("Rush"), static("Normal"))' },
  { target: 'Order.Header.Amount', type: 'number', expression: 'source("total")' },
];

const MOCK_DIAGNOSTICS: Diagnostic[] = [
  {
    code: 'KEYRA-E030',
    severity: 'error',
    message: "Source path 'nonExistentField' does not exist in source schema",
    ruleIndex: 4,
    expression: 'source("nonExistentField")',
  },
  {
    code: 'KEYRA-W010',
    severity: 'warning',
    message: 'Duplicate target path detected',
    ruleIndex: 2,
  },
];

const EMPTY_SUMMARY = { total: 0, valid: 0, warnings: 0, errors: 0 };
const MOCK_SUMMARY = { total: 5, valid: 3, warnings: 1, errors: 1 };

function noDiagnostics(): readonly Diagnostic[] {
  return [];
}

function mockDiagnosticsForRule(ruleIndex: number): readonly Diagnostic[] {
  return MOCK_DIAGNOSTICS.filter((d) => d.ruleIndex === ruleIndex);
}

// ---------------------------------------------------------------------------
// ValidationSummaryBar
// ---------------------------------------------------------------------------

describe('ValidationSummaryBar', () => {
  it('shows schemas-missing message when schemasLoaded is false', () => {
    render(
      <ValidationSummaryBar
        summary={EMPTY_SUMMARY}
        coveragePercent={0}
        isValidating={false}
        schemasLoaded={false}
      />,
    );
    expect(screen.getByText('Attach source and target schemas to enable validation')).toBeInTheDocument();
  });

  it('shows rule count and valid count', () => {
    render(
      <ValidationSummaryBar
        summary={MOCK_SUMMARY}
        coveragePercent={80}
        isValidating={false}
        schemasLoaded={true}
      />,
    );
    expect(screen.getByText('5 rules')).toBeInTheDocument();
    expect(screen.getByText('3 valid')).toBeInTheDocument();
  });

  it('shows warning count when > 0', () => {
    render(
      <ValidationSummaryBar
        summary={MOCK_SUMMARY}
        coveragePercent={80}
        isValidating={false}
        schemasLoaded={true}
      />,
    );
    expect(screen.getByText('1 warning')).toBeInTheDocument();
  });

  it('shows error count when > 0', () => {
    render(
      <ValidationSummaryBar
        summary={MOCK_SUMMARY}
        coveragePercent={80}
        isValidating={false}
        schemasLoaded={true}
      />,
    );
    expect(screen.getByText('1 error')).toBeInTheDocument();
  });

  it('shows coverage percentage', () => {
    render(
      <ValidationSummaryBar
        summary={MOCK_SUMMARY}
        coveragePercent={80}
        isValidating={false}
        schemasLoaded={true}
      />,
    );
    expect(screen.getByText('80% coverage')).toBeInTheDocument();
  });

  it('shows validating indicator when isValidating is true', () => {
    render(
      <ValidationSummaryBar
        summary={MOCK_SUMMARY}
        coveragePercent={80}
        isValidating={true}
        schemasLoaded={true}
      />,
    );
    expect(screen.getByText(/Validating/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// DiagnosticDetail
// ---------------------------------------------------------------------------

describe('DiagnosticDetail', () => {
  it('renders nothing when diagnostics array is empty', () => {
    const { container } = render(<DiagnosticDetail diagnostics={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders diagnostic code', () => {
    render(<DiagnosticDetail diagnostics={[MOCK_DIAGNOSTICS[0]]} />);
    expect(screen.getByText('KEYRA-E030')).toBeInTheDocument();
  });

  it('renders diagnostic message', () => {
    render(<DiagnosticDetail diagnostics={[MOCK_DIAGNOSTICS[0]]} />);
    expect(screen.getByText(/Source path 'nonExistentField'/)).toBeInTheDocument();
  });

  it('renders severity badge', () => {
    render(<DiagnosticDetail diagnostics={[MOCK_DIAGNOSTICS[0]]} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders expression snippet when available', () => {
    render(<DiagnosticDetail diagnostics={[MOCK_DIAGNOSTICS[0]]} />);
    expect(screen.getByText('source("nonExistentField")')).toBeInTheDocument();
  });

  it('renders disabled Fix button with tooltip', () => {
    render(<DiagnosticDetail diagnostics={[MOCK_DIAGNOSTICS[0]]} />);
    const fixButton = screen.getByRole('button', { name: /Fix/i });
    expect(fixButton).toBeDisabled();
    expect(fixButton).toHaveAttribute('title', 'Coming in Phase 2');
  });
});

// ---------------------------------------------------------------------------
// RuleRow
// ---------------------------------------------------------------------------

describe('RuleRow', () => {
  const defaultProps = {
    index: 0,
    rule: MOCK_RULES[0],
    diagnostics: [] as Diagnostic[],
    schemasLoaded: true,
    selected: false,
  };

  it('renders the 1-based row number', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders the target path', () => {
    render(<RuleRow {...defaultProps} />);
    expect(screen.getByText('Order.Header.DocType')).toBeInTheDocument();
  });

  it('renders the expression', () => {
    render(<RuleRow {...defaultProps} />);
    expect(screen.getByText('static("PO")')).toBeInTheDocument();
  });

  it('renders the type badge with correct label', () => {
    render(<RuleRow {...defaultProps} />);
    expect(screen.getByTestId('rule-type-badge-0')).toHaveTextContent('Static Value');
  });

  it('renders "Direct Copy" type badge for source()', () => {
    render(<RuleRow {...defaultProps} rule={MOCK_RULES[1]} index={1} />);
    expect(screen.getByTestId('rule-type-badge-1')).toHaveTextContent('Direct Copy');
  });

  it('renders green icon when no diagnostics and schemas loaded', () => {
    render(<RuleRow {...defaultProps} />);
    const icon = screen.getByLabelText('Valid');
    expect(icon).toBeInTheDocument();
  });

  it('renders gray icon when schemas not loaded', () => {
    render(<RuleRow {...defaultProps} schemasLoaded={false} />);
    const icon = screen.getByLabelText('Not validated');
    expect(icon).toBeInTheDocument();
  });

  it('renders red icon when diagnostics contain errors', () => {
    render(
      <RuleRow
        {...defaultProps}
        index={4}
        rule={MOCK_RULES[4]}
        diagnostics={[MOCK_DIAGNOSTICS[0]]}
      />,
    );
    const icon = screen.getByLabelText('Error');
    expect(icon).toBeInTheDocument();
  });

  it('renders yellow icon when diagnostics contain only warnings', () => {
    render(
      <RuleRow
        {...defaultProps}
        index={2}
        rule={MOCK_RULES[2]}
        diagnostics={[MOCK_DIAGNOSTICS[1]]}
      />,
    );
    const icon = screen.getByLabelText('Warning');
    expect(icon).toBeInTheDocument();
  });

  it('expands diagnostic detail on validation icon click', () => {
    render(
      <RuleRow
        {...defaultProps}
        index={4}
        rule={MOCK_RULES[4]}
        diagnostics={[MOCK_DIAGNOSTICS[0]]}
      />,
    );

    expect(screen.queryByTestId('diagnostic-detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('validation-icon-4'));
    expect(screen.getByTestId('diagnostic-detail')).toBeInTheDocument();
    expect(screen.getByText('KEYRA-E030')).toBeInTheDocument();
  });

  it('does not expand when there are no diagnostics', () => {
    render(<RuleRow {...defaultProps} />);
    fireEvent.click(screen.getByTestId('validation-icon-0'));
    expect(screen.queryByTestId('diagnostic-detail')).not.toBeInTheDocument();
  });

  it('renders checkbox with correct aria-label', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByLabelText('Select rule 3')).toBeInTheDocument();
  });

  it('calls onSelectionChange when checkbox is toggled', () => {
    const onSelectionChange = vi.fn();
    render(<RuleRow {...defaultProps} onSelectionChange={onSelectionChange} />);
    fireEvent.click(screen.getByLabelText('Select rule 1'));
    expect(onSelectionChange).toHaveBeenCalledWith(0, true);
  });

  it('renders edit button with correct aria-label', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByLabelText('Edit rule 3')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<RuleRow {...defaultProps} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('rule-edit-0'));
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('renders delete button with correct aria-label', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByLabelText('Delete rule 3')).toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<RuleRow {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('rule-delete-0'));
    expect(onDelete).toHaveBeenCalledWith(0);
  });

  // Drag handle tests
  it('renders drag handle with correct aria-label', () => {
    render(<RuleRow {...defaultProps} />);
    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument();
  });

  it('renders drag handle on every row', () => {
    render(<RuleRow {...defaultProps} index={3} />);
    expect(screen.getByTestId('drag-handle-3')).toBeInTheDocument();
  });

  // Move Up/Down button tests
  it('renders Move Up button with correct aria-label', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByLabelText('Move rule 3 up')).toBeInTheDocument();
  });

  it('renders Move Down button with correct aria-label', () => {
    render(<RuleRow {...defaultProps} index={2} />);
    expect(screen.getByLabelText('Move rule 3 down')).toBeInTheDocument();
  });

  it('calls onMoveUp when Move Up button is clicked', () => {
    const onMoveUp = vi.fn();
    render(<RuleRow {...defaultProps} index={2} onMoveUp={onMoveUp} />);
    fireEvent.click(screen.getByTestId('rule-move-up-2'));
    expect(onMoveUp).toHaveBeenCalledWith(2);
  });

  it('calls onMoveDown when Move Down button is clicked', () => {
    const onMoveDown = vi.fn();
    render(<RuleRow {...defaultProps} index={2} onMoveDown={onMoveDown} />);
    fireEvent.click(screen.getByTestId('rule-move-down-2'));
    expect(onMoveDown).toHaveBeenCalledWith(2);
  });

  it('Move Up button is disabled when isFirst is true', () => {
    render(<RuleRow {...defaultProps} index={0} isFirst={true} />);
    expect(screen.getByTestId('rule-move-up-0')).toBeDisabled();
  });

  it('Move Down button is disabled when isLast is true', () => {
    render(<RuleRow {...defaultProps} index={4} isLast={true} />);
    expect(screen.getByTestId('rule-move-down-4')).toBeDisabled();
  });

  it('Move Up button is not disabled for non-first rule', () => {
    render(<RuleRow {...defaultProps} index={2} isFirst={false} />);
    expect(screen.getByTestId('rule-move-up-2')).not.toBeDisabled();
  });

  it('Move Down button is not disabled for non-last rule', () => {
    render(<RuleRow {...defaultProps} index={2} isLast={false} />);
    expect(screen.getByTestId('rule-move-down-2')).not.toBeDisabled();
  });

  it('applies opacity-50 class when isDragging is true', () => {
    render(<RuleRow {...defaultProps} isDragging={true} />);
    const row = screen.getByTestId('rule-row-0');
    expect(row.className).toContain('opacity-50');
  });
});

// ---------------------------------------------------------------------------
// RuleList — Read-only rendering (T-03 tests)
// ---------------------------------------------------------------------------

describe('RuleList', () => {
  const defaultProps = {
    rules: MOCK_RULES,
    schemasLoaded: true,
    summary: MOCK_SUMMARY,
    coveragePercent: 80,
    isValidating: false,
    diagnosticsForRule: mockDiagnosticsForRule,
  };

  it('renders correct number of rule rows', () => {
    render(<RuleList {...defaultProps} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`rule-row-${i}`)).toBeInTheDocument();
    }
  });

  it('renders validation summary bar', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('validation-summary-bar')).toBeInTheDocument();
  });

  it('renders empty state when rules array is empty', () => {
    render(
      <RuleList
        {...defaultProps}
        rules={[]}
        summary={EMPTY_SUMMARY}
        coveragePercent={0}
        diagnosticsForRule={noDiagnostics}
      />,
    );
    expect(screen.getByTestId('rule-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No rules yet. Add your first rule to start mapping.')).toBeInTheDocument();
  });

  it('renders "Add Rule" button in empty state', () => {
    render(
      <RuleList
        {...defaultProps}
        rules={[]}
        summary={EMPTY_SUMMARY}
        coveragePercent={0}
        diagnosticsForRule={noDiagnostics}
      />,
    );
    expect(screen.getByRole('button', { name: /Add Rule/i })).toBeInTheDocument();
  });

  it('renders disabled "Auto-Map with AI" button in empty state', () => {
    render(
      <RuleList
        {...defaultProps}
        rules={[]}
        summary={EMPTY_SUMMARY}
        coveragePercent={0}
        diagnosticsForRule={noDiagnostics}
      />,
    );
    const aiButton = screen.getByRole('button', { name: /Auto-Map with AI/i });
    expect(aiButton).toBeDisabled();
    expect(aiButton).toHaveAttribute('title', 'Coming soon');
  });

  it('shows schemas-missing message when schemasLoaded is false', () => {
    render(<RuleList {...defaultProps} schemasLoaded={false} />);
    expect(screen.getByText('Attach source and target schemas to enable validation')).toBeInTheDocument();
  });

  it('renders rule type badges correctly for all rule types', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('rule-type-badge-0')).toHaveTextContent('Static Value');
    expect(screen.getByTestId('rule-type-badge-1')).toHaveTextContent('Direct Copy');
    expect(screen.getByTestId('rule-type-badge-2')).toHaveTextContent('Array');
    expect(screen.getByTestId('rule-type-badge-3')).toHaveTextContent('Conditional');
    expect(screen.getByTestId('rule-type-badge-4')).toHaveTextContent('Direct Copy');
  });

  it('renders drag handle on each rule row', () => {
    render(<RuleList {...defaultProps} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`drag-handle-${i}`)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// RuleList — CRUD operations (T-04 tests)
// ---------------------------------------------------------------------------

describe('RuleList CRUD', () => {
  const defaultProps = {
    rules: MOCK_RULES,
    schemasLoaded: true,
    summary: MOCK_SUMMARY,
    coveragePercent: 80,
    isValidating: false,
    diagnosticsForRule: mockDiagnosticsForRule,
    onAddRule: vi.fn(),
    onEditRule: vi.fn(),
    onDeleteRule: vi.fn(),
    onReorderRule: vi.fn(),
  };

  describe('Add Rule', () => {
    it('shows "Add Rule" button above the list', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByTestId('add-rule-button')).toBeInTheDocument();
    });

    it('clicking "Add Rule" shows the add form', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('add-rule-button'));
      expect(screen.getByTestId('rule-form')).toBeInTheDocument();
      expect(screen.getByLabelText('Add rule form')).toBeInTheDocument();
    });

    it('filling in fields and saving calls onAddRule', () => {
      const onAddRule = vi.fn();
      render(<RuleList {...defaultProps} onAddRule={onAddRule} />);

      fireEvent.click(screen.getByTestId('add-rule-button'));
      fireEvent.change(screen.getByTestId('rule-form-target-input'), {
        target: { value: 'Order.Header.NewField' },
      });
      fireEvent.change(screen.getByTestId('rule-form-expression-input'), {
        target: { value: 'static("test")' },
      });
      fireEvent.click(screen.getByTestId('rule-form-save'));

      expect(onAddRule).toHaveBeenCalledWith({
        target: 'Order.Header.NewField',
        expression: 'static("test")',
        description: undefined,
      });
    });

    it('cancelling add form hides it', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('add-rule-button'));
      expect(screen.getByTestId('rule-form')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('rule-form-cancel'));
      expect(screen.queryByTestId('rule-form')).not.toBeInTheDocument();
    });

    it('"Add Rule" in empty state opens the add form', () => {
      render(
        <RuleList
          {...defaultProps}
          rules={[]}
          summary={EMPTY_SUMMARY}
          coveragePercent={0}
          diagnosticsForRule={noDiagnostics}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /Add Rule/i }));
      expect(screen.getByTestId('rule-form')).toBeInTheDocument();
    });
  });

  describe('Edit Rule', () => {
    it('clicking edit button on a row shows edit form with pre-populated values', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('rule-edit-0'));

      expect(screen.getByTestId('rule-form')).toBeInTheDocument();
      expect(screen.getByLabelText('Edit rule form')).toBeInTheDocument();
      expect(screen.getByTestId('rule-form-target-input')).toHaveValue('Order.Header.DocType');
      expect(screen.getByTestId('rule-form-expression-input')).toHaveValue('static("PO")');
    });

    it('editing and saving calls onEditRule with the correct index', () => {
      const onEditRule = vi.fn();
      render(<RuleList {...defaultProps} onEditRule={onEditRule} />);

      fireEvent.click(screen.getByTestId('rule-edit-1'));
      fireEvent.change(screen.getByTestId('rule-form-expression-input'), {
        target: { value: 'source("newDate")' },
      });
      fireEvent.click(screen.getByTestId('rule-form-save'));

      expect(onEditRule).toHaveBeenCalledWith(1, {
        target: 'Order.Header.Date',
        expression: 'source("newDate")',
        description: undefined,
      });
    });

    it('cancelling edit mode shows the rule row again', () => {
      render(<RuleList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rule-edit-0'));
      expect(screen.queryByTestId('rule-row-0')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('rule-form-cancel'));
      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
    });

    it('only one rule is editable at a time', () => {
      render(<RuleList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rule-edit-0'));
      expect(screen.queryByTestId('rule-row-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('rule-row-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('rule-edit-1'));
      expect(screen.getByTestId('rule-row-0')).toBeInTheDocument();
      expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument();
    });
  });

  describe('Delete Rule', () => {
    it('clicking delete button shows confirmation dialog', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('rule-delete-0'));

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText("Delete rule targeting 'Order.Header.DocType'?")).toBeInTheDocument();
    });

    it('confirming delete calls onDeleteRule with the correct index', () => {
      const onDeleteRule = vi.fn();
      render(<RuleList {...defaultProps} onDeleteRule={onDeleteRule} />);

      fireEvent.click(screen.getByTestId('rule-delete-2'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(onDeleteRule).toHaveBeenCalledWith(2);
    });

    it('cancelling delete closes dialog without calling onDeleteRule', () => {
      const onDeleteRule = vi.fn();
      render(<RuleList {...defaultProps} onDeleteRule={onDeleteRule} />);

      fireEvent.click(screen.getByTestId('rule-delete-0'));
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(onDeleteRule).not.toHaveBeenCalled();
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });

    it('confirmation dialog has "Delete" as confirm label', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('rule-delete-0'));
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete');
    });
  });

  describe('Interaction between CRUD modes', () => {
    it('entering edit mode hides the "Add Rule" button', () => {
      render(<RuleList {...defaultProps} />);

      expect(screen.getByTestId('add-rule-button')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('rule-edit-0'));
      expect(screen.queryByTestId('add-rule-button')).not.toBeInTheDocument();
    });

    it('cancelling edit mode restores the "Add Rule" button', () => {
      render(<RuleList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('rule-edit-0'));
      expect(screen.queryByTestId('add-rule-button')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('rule-form-cancel'));
      expect(screen.getByTestId('add-rule-button')).toBeInTheDocument();
    });

    it('hides "Add Rule" button while add form is open', () => {
      render(<RuleList {...defaultProps} />);

      fireEvent.click(screen.getByTestId('add-rule-button'));
      expect(screen.queryByTestId('add-rule-button')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// RuleList — Reorder (T-05 tests)
// ---------------------------------------------------------------------------

describe('RuleList Reorder', () => {
  const defaultProps = {
    rules: MOCK_RULES,
    schemasLoaded: true,
    summary: MOCK_SUMMARY,
    coveragePercent: 80,
    isValidating: false,
    diagnosticsForRule: mockDiagnosticsForRule,
    onReorderRule: vi.fn(),
  };

  it('renders Move Up button on each row', () => {
    render(<RuleList {...defaultProps} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`rule-move-up-${i}`)).toBeInTheDocument();
    }
  });

  it('renders Move Down button on each row', () => {
    render(<RuleList {...defaultProps} />);
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`rule-move-down-${i}`)).toBeInTheDocument();
    }
  });

  it('Move Up is disabled on first rule', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('rule-move-up-0')).toBeDisabled();
  });

  it('Move Down is disabled on last rule', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('rule-move-down-4')).toBeDisabled();
  });

  it('Move Up is enabled for non-first rules', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('rule-move-up-1')).not.toBeDisabled();
    expect(screen.getByTestId('rule-move-up-2')).not.toBeDisabled();
  });

  it('Move Down is enabled for non-last rules', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('rule-move-down-0')).not.toBeDisabled();
    expect(screen.getByTestId('rule-move-down-3')).not.toBeDisabled();
  });

  it('clicking Move Up calls onReorderRule(index, index - 1)', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-up-2'));
    expect(onReorderRule).toHaveBeenCalledWith(2, 1);
  });

  it('clicking Move Down calls onReorderRule(index, index + 1)', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-down-1'));
    expect(onReorderRule).toHaveBeenCalledWith(1, 2);
  });

  it('Move Up does not call onReorderRule for first rule (disabled)', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-up-0'));
    expect(onReorderRule).not.toHaveBeenCalled();
  });

  it('Move Down does not call onReorderRule for last rule (disabled)', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-down-4'));
    expect(onReorderRule).not.toHaveBeenCalled();
  });

  it('displays ARIA live region for position announcements', () => {
    render(<RuleList {...defaultProps} />);
    expect(screen.getByTestId('reorder-announcement')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-announcement')).toHaveAttribute('aria-live', 'assertive');
  });

  it('announces new position after Move Up', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-up-2'));
    expect(screen.getByTestId('reorder-announcement')).toHaveTextContent('Rule moved to position 2');
  });

  it('announces new position after Move Down', () => {
    const onReorderRule = vi.fn();
    render(<RuleList {...defaultProps} onReorderRule={onReorderRule} />);

    fireEvent.click(screen.getByTestId('rule-move-down-1'));
    expect(screen.getByTestId('reorder-announcement')).toHaveTextContent('Rule moved to position 3');
  });

  it('renders DnD context (drag handles are interactive)', () => {
    render(<RuleList {...defaultProps} />);
    // All drag handles should have the aria-label
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`drag-handle-${i}`)).toHaveAttribute('aria-label', 'Drag to reorder');
    }
  });
});

// ---------------------------------------------------------------------------
// RuleList — Multi-select & Bulk Actions (T-06 tests)
// ---------------------------------------------------------------------------

describe('RuleList Multi-select & Bulk Actions', () => {
  const defaultProps = {
    rules: MOCK_RULES,
    schemasLoaded: true,
    summary: MOCK_SUMMARY,
    coveragePercent: 80,
    isValidating: false,
    diagnosticsForRule: mockDiagnosticsForRule,
    onAddRule: vi.fn(),
    onEditRule: vi.fn(),
    onDeleteRule: vi.fn(),
    onReorderRule: vi.fn(),
    onBulkDelete: vi.fn(),
    onBulkDuplicate: vi.fn(),
    onPasteRules: vi.fn(),
  };

  describe('Selection', () => {
    it('renders a checkbox on each rule row', () => {
      render(<RuleList {...defaultProps} />);
      for (let i = 0; i < 5; i++) {
        expect(screen.getByLabelText(`Select rule ${i + 1}`)).toBeInTheDocument();
      }
    });

    it('renders a "Select All" checkbox', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument();
    });

    it('clicking a row checkbox shows the bulk action bar', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();
    });

    it('shows correct selection count in bulk action bar', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 3'));

      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('2 rules selected');
    });

    it('shows "1 rule selected" for singular selection', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 2'));

      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('1 rule selected');
    });

    it('deselecting all hides the bulk action bar', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });

    it('"Select All" selects all rules', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('select-all-checkbox'));

      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('5 rules selected');
    });

    it('"Select All" when all are selected deselects all', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('select-all-checkbox'));
      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('5 rules selected');

      fireEvent.click(screen.getByTestId('select-all-checkbox'));
      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });

    it('"Select All" when some are selected selects all', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 3'));
      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('2 rules selected');

      fireEvent.click(screen.getByTestId('select-all-checkbox'));
      expect(screen.getByTestId('bulk-selection-count')).toHaveTextContent('5 rules selected');
    });
  });

  describe('Bulk Delete', () => {
    it('"Delete selected" opens confirmation dialog', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 3'));

      fireEvent.click(screen.getByTestId('bulk-delete'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText('Delete 2 selected rules?')).toBeInTheDocument();
    });

    it('confirming bulk delete calls onBulkDelete with correct indices', () => {
      const onBulkDelete = vi.fn();
      render(<RuleList {...defaultProps} onBulkDelete={onBulkDelete} />);

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 3'));
      fireEvent.click(screen.getByTestId('bulk-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(onBulkDelete).toHaveBeenCalledWith([2, 0]); // descending order for safe removal
    });

    it('cancelling bulk delete closes dialog without calling onBulkDelete', () => {
      const onBulkDelete = vi.fn();
      render(<RuleList {...defaultProps} onBulkDelete={onBulkDelete} />);

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByTestId('bulk-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      expect(onBulkDelete).not.toHaveBeenCalled();
    });

    it('bulk delete clears selection after completion', () => {
      const onBulkDelete = vi.fn();
      render(<RuleList {...defaultProps} onBulkDelete={onBulkDelete} />);

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 2'));
      fireEvent.click(screen.getByTestId('bulk-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });
  });

  describe('Bulk Duplicate', () => {
    it('"Duplicate selected" calls onBulkDuplicate with selected indices', () => {
      const onBulkDuplicate = vi.fn();
      render(<RuleList {...defaultProps} onBulkDuplicate={onBulkDuplicate} />);

      fireEvent.click(screen.getByLabelText('Select rule 2'));
      fireEvent.click(screen.getByLabelText('Select rule 4'));
      fireEvent.click(screen.getByTestId('bulk-duplicate'));

      expect(onBulkDuplicate).toHaveBeenCalledWith([1, 3]); // ascending order
    });

    it('bulk duplicate clears selection after completion', () => {
      const onBulkDuplicate = vi.fn();
      render(<RuleList {...defaultProps} onBulkDuplicate={onBulkDuplicate} />);

      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByTestId('bulk-duplicate'));

      expect(screen.queryByTestId('bulk-action-bar')).not.toBeInTheDocument();
    });
  });

  describe('Bulk Copy to Clipboard', () => {
    it('"Copy" calls navigator.clipboard.writeText with selected rules as JSON', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText, readText: vi.fn() },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByLabelText('Select rule 3'));
      fireEvent.click(screen.getByTestId('bulk-copy'));

      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          JSON.stringify([MOCK_RULES[0], MOCK_RULES[2]], null, 2),
        );
      });
    });

    it('shows clipboard error when writeText fails', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      Object.assign(navigator, {
        clipboard: { writeText, readText: vi.fn() },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));
      fireEvent.click(screen.getByTestId('bulk-copy'));

      await vi.waitFor(() => {
        expect(screen.getByTestId('clipboard-error')).toBeInTheDocument();
        expect(screen.getByText('Clipboard access denied')).toBeInTheDocument();
      });
    });
  });

  describe('Per-row Copy', () => {
    it('renders copy button on each rule row', () => {
      render(<RuleList {...defaultProps} />);
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`rule-copy-${i}`)).toBeInTheDocument();
      }
    });

    it('clicking copy button writes single rule as JSON array to clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText, readText: vi.fn() },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('rule-copy-0'));

      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          JSON.stringify([MOCK_RULES[0]], null, 2),
        );
      });
    });

    it('per-row copy has correct aria-label', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByLabelText('Copy rule 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Copy rule 5')).toBeInTheDocument();
    });
  });

  describe('Paste Rules', () => {
    it('renders a "Paste" button in toolbar', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByTestId('paste-rules-button')).toBeInTheDocument();
    });

    it('paste button reads clipboard and calls onPasteRules with valid data', async () => {
      const validData = [
        { target: 'A.B', expression: 'source("x")', type: 'string', description: 'test' },
      ];
      const readText = vi.fn().mockResolvedValue(JSON.stringify(validData));
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn(), readText },
      });

      const onPasteRules = vi.fn();
      render(<RuleList {...defaultProps} onPasteRules={onPasteRules} />);
      fireEvent.click(screen.getByTestId('paste-rules-button'));

      await vi.waitFor(() => {
        expect(onPasteRules).toHaveBeenCalledWith(validData);
      });
    });

    it('paste with invalid JSON shows error notification', async () => {
      const readText = vi.fn().mockResolvedValue('not valid json {{{');
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn(), readText },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('paste-rules-button'));

      await vi.waitFor(() => {
        expect(screen.getByTestId('clipboard-error')).toBeInTheDocument();
        expect(screen.getByText('Invalid rule data in clipboard')).toBeInTheDocument();
      });
    });

    it('paste with valid JSON but invalid rule format shows error', async () => {
      const invalidRules = [{ foo: 'bar' }]; // Missing required fields
      const readText = vi.fn().mockResolvedValue(JSON.stringify(invalidRules));
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn(), readText },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('paste-rules-button'));

      await vi.waitFor(() => {
        expect(screen.getByTestId('clipboard-error')).toBeInTheDocument();
        expect(screen.getByText('Invalid rule data in clipboard')).toBeInTheDocument();
      });
    });

    it('clipboard error can be dismissed', async () => {
      const readText = vi.fn().mockResolvedValue('invalid');
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn(), readText },
      });

      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('paste-rules-button'));

      await vi.waitFor(() => {
        expect(screen.getByTestId('clipboard-error')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText('Dismiss error'));
      expect(screen.queryByTestId('clipboard-error')).not.toBeInTheDocument();
    });

    it('paste button has correct aria-label', () => {
      render(<RuleList {...defaultProps} />);
      expect(screen.getByLabelText('Paste rules from clipboard')).toBeInTheDocument();
    });
  });

  describe('BulkActionBar ARIA', () => {
    it('bulk action bar has aria-live="assertive" for screen reader announcement', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));

      const bar = screen.getByTestId('bulk-action-bar');
      expect(bar).toHaveAttribute('aria-live', 'assertive');
    });

    it('bulk action bar has role="toolbar"', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));

      const bar = screen.getByTestId('bulk-action-bar');
      expect(bar).toHaveAttribute('role', 'toolbar');
    });

    it('bulk action bar has aria-label="Bulk actions"', () => {
      render(<RuleList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Select rule 1'));

      const bar = screen.getByTestId('bulk-action-bar');
      expect(bar).toHaveAttribute('aria-label', 'Bulk actions');
    });
  });
});
