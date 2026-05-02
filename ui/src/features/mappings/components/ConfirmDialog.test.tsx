import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

// ---------------------------------------------------------------------------
// ConfirmDialog Tests
// ---------------------------------------------------------------------------

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Delete Item',
    message: 'Are you sure you want to delete this item?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders nothing when open is false', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog when open is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('displays the title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
  });

  it('displays the message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByTestId('confirm-dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-dialog-overlay').firstElementChild!);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('uses custom confirm and cancel labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
      />,
    );
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
    expect(screen.getByText('No, Keep')).toBeInTheDocument();
  });

  it('has role="alertdialog" and aria-modal', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('traps focus - Tab wraps from last to first element', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByTestId('confirm-dialog');
    const cancelButton = screen.getByTestId('confirm-dialog-cancel');
    const confirmButton = screen.getByTestId('confirm-dialog-confirm');

    // Focus on confirm button (last focusable element)
    confirmButton.focus();
    expect(document.activeElement).toBe(confirmButton);

    // Tab should wrap to cancel button (first)
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(cancelButton);
  });

  it('traps focus - Shift+Tab wraps from first to last element', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByTestId('confirm-dialog');
    const cancelButton = screen.getByTestId('confirm-dialog-cancel');
    const confirmButton = screen.getByTestId('confirm-dialog-confirm');

    // Focus on cancel button (first focusable element)
    cancelButton.focus();
    expect(document.activeElement).toBe(cancelButton);

    // Shift+Tab should wrap to confirm button (last)
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirmButton);
  });
});
