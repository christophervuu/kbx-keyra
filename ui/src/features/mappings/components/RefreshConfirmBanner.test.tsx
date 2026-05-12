import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RefreshConfirmBanner } from './RefreshConfirmBanner';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RefreshConfirmBanner', () => {
  it('renders the banner with role="alertdialog"', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={2}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-confirm-banner')).toBeInTheDocument();
  });

  it('shows refresh count in message', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-message')).toHaveTextContent('5');
    expect(screen.getByTestId('refresh-confirm-message')).toHaveTextContent('suggestions');
  });

  it('shows singular "suggestion" when refreshCount is 1', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={1}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-message')).toHaveTextContent('1 suggestion.');
  });

  it('shows preserved count when > 0', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={3}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-message')).toHaveTextContent('3');
    expect(screen.getByTestId('refresh-confirm-message')).toHaveTextContent('preserved');
  });

  it('does not show preserved text when preservedCount is 0', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-message')).not.toHaveTextContent('preserved');
  });

  it('renders Confirm and Cancel buttons', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-ok')).toBeInTheDocument();
    expect(screen.getByTestId('refresh-confirm-cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when Refresh All button is clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('refresh-confirm-ok'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByTestId('refresh-confirm-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows countdown in Cancel button', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        autoTimeoutMs={5000}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-cancel')).toHaveTextContent('5s');
  });

  it('auto-dismisses after timeout and calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        autoTimeoutMs={3000}
      />,
    );
    expect(onCancel).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('decrements countdown each second', () => {
    render(
      <RefreshConfirmBanner
        refreshCount={5}
        preservedCount={0}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        autoTimeoutMs={5000}
      />,
    );
    expect(screen.getByTestId('refresh-confirm-cancel')).toHaveTextContent('5s');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('refresh-confirm-cancel')).toHaveTextContent('4s');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('refresh-confirm-cancel')).toHaveTextContent('3s');
  });
});
