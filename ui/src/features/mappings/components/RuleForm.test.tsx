import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RuleForm } from './RuleForm';

// ---------------------------------------------------------------------------
// RuleForm Tests
// ---------------------------------------------------------------------------

describe('RuleForm', () => {
  const defaultProps = {
    mode: 'add' as const,
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders in add mode with empty fields', () => {
    render(<RuleForm {...defaultProps} />);
    expect(screen.getByTestId('rule-form')).toBeInTheDocument();
    expect(screen.getByTestId('rule-form-target-input')).toHaveValue('');
    expect(screen.getByTestId('rule-form-expression-input')).toHaveValue('');
    expect(screen.getByTestId('rule-form-description-input')).toHaveValue('');
  });

  it('renders in edit mode with pre-populated values', () => {
    render(
      <RuleForm
        mode="edit"
        initialValues={{
          target: 'Order.Header.DocType',
          expression: 'static("PO")',
          description: 'Document type',
        }}
        onSave={defaultProps.onSave}
        onCancel={defaultProps.onCancel}
      />,
    );
    expect(screen.getByTestId('rule-form-target-input')).toHaveValue('Order.Header.DocType');
    expect(screen.getByTestId('rule-form-expression-input')).toHaveValue('static("PO")');
    expect(screen.getByTestId('rule-form-description-input')).toHaveValue('Document type');
  });

  it('shows "Add Rule" button text in add mode', () => {
    render(<RuleForm {...defaultProps} />);
    expect(screen.getByTestId('rule-form-save')).toHaveTextContent('Add Rule');
  });

  it('shows "Save Changes" button text in edit mode', () => {
    render(<RuleForm {...defaultProps} mode="edit" />);
    expect(screen.getByTestId('rule-form-save')).toHaveTextContent('Save Changes');
  });

  it('calls onSave with form values on submit', () => {
    const onSave = vi.fn();
    render(<RuleForm {...defaultProps} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('rule-form-target-input'), {
      target: { value: 'Order.Header.Date' },
    });
    fireEvent.change(screen.getByTestId('rule-form-expression-input'), {
      target: { value: 'source("orderDate")' },
    });
    fireEvent.change(screen.getByTestId('rule-form-description-input'), {
      target: { value: 'The order date' },
    });
    fireEvent.click(screen.getByTestId('rule-form-save'));

    expect(onSave).toHaveBeenCalledWith({
      target: 'Order.Header.Date',
      expression: 'source("orderDate")',
      description: 'The order date',
    });
  });

  it('trims whitespace from values before saving', () => {
    const onSave = vi.fn();
    render(<RuleForm {...defaultProps} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('rule-form-target-input'), {
      target: { value: '  Order.Header.Date  ' },
    });
    fireEvent.change(screen.getByTestId('rule-form-expression-input'), {
      target: { value: '  source("orderDate")  ' },
    });
    fireEvent.click(screen.getByTestId('rule-form-save'));

    expect(onSave).toHaveBeenCalledWith({
      target: 'Order.Header.Date',
      expression: 'source("orderDate")',
      description: undefined,
    });
  });

  it('shows validation error when target is empty', () => {
    const onSave = vi.fn();
    render(<RuleForm {...defaultProps} onSave={onSave} />);

    // Submit without filling target
    fireEvent.click(screen.getByTestId('rule-form-save'));

    expect(screen.getByText('Target path is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows validation error when target is whitespace only', () => {
    const onSave = vi.fn();
    render(<RuleForm {...defaultProps} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('rule-form-target-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('rule-form-save'));

    expect(screen.getByText('Target path is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears validation error when user types in target field', () => {
    render(<RuleForm {...defaultProps} />);

    // Trigger error
    fireEvent.click(screen.getByTestId('rule-form-save'));
    expect(screen.getByText('Target path is required')).toBeInTheDocument();

    // Start typing
    fireEvent.change(screen.getByTestId('rule-form-target-input'), {
      target: { value: 'O' },
    });
    expect(screen.queryByText('Target path is required')).not.toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<RuleForm {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('rule-form-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('sets description to undefined when empty', () => {
    const onSave = vi.fn();
    render(<RuleForm {...defaultProps} onSave={onSave} />);

    fireEvent.change(screen.getByTestId('rule-form-target-input'), {
      target: { value: 'Order.Amount' },
    });
    fireEvent.click(screen.getByTestId('rule-form-save'));

    expect(onSave).toHaveBeenCalledWith({
      target: 'Order.Amount',
      expression: '',
      description: undefined,
    });
  });

  it('has correct aria-label for add mode', () => {
    render(<RuleForm {...defaultProps} />);
    expect(screen.getByLabelText('Add rule form')).toBeInTheDocument();
  });

  it('has correct aria-label for edit mode', () => {
    render(<RuleForm {...defaultProps} mode="edit" />);
    expect(screen.getByLabelText('Edit rule form')).toBeInTheDocument();
  });

  it('marks target input as aria-invalid when error is present', () => {
    render(<RuleForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId('rule-form-save'));
    expect(screen.getByTestId('rule-form-target-input')).toHaveAttribute('aria-invalid', 'true');
  });
});
