import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { AsyncErrorBanner, ErrorBanner } from '@/components/ErrorBanner';
import type { AsyncState } from '@/lib/state/async-state';

// ---------------------------------------------------------------------------
// ErrorBanner
// ---------------------------------------------------------------------------

describe('ErrorBanner', () => {
  describe('rendering', () => {
    it('renders the error message', () => {
      render(<ErrorBanner message="Something went wrong" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('has role="alert" for accessibility', () => {
      render(<ErrorBanner message="Error" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('applies red styling for non-retryable errors by default', () => {
      render(<ErrorBanner message="Error" />);
      expect(screen.getByRole('alert')).toHaveClass('bg-red-950');
    });

    it('applies amber styling when retryable with onRetry', () => {
      render(<ErrorBanner message="Error" retryable onRetry={vi.fn()} />);
      expect(screen.getByRole('alert')).toHaveClass('bg-amber-950');
    });

    it('accepts optional className', () => {
      render(<ErrorBanner message="Error" className="mt-4" />);
      expect(screen.getByRole('alert')).toHaveClass('mt-4');
    });
  });

  describe('retry button visibility', () => {
    it('shows retry button when retryable=true and onRetry provided', () => {
      render(<ErrorBanner message="Error" retryable onRetry={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('hides retry button when retryable=false', () => {
      render(<ErrorBanner message="Error" retryable={false} onRetry={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('hides retry button when onRetry is not provided', () => {
      render(<ErrorBanner message="Error" retryable />);
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('hides retry button when neither retryable nor onRetry provided', () => {
      render(<ErrorBanner message="Error" />);
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
  });

  describe('retry button interaction', () => {
    it('calls onRetry when retry button is clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();

      render(<ErrorBanner message="Error" retryable onRetry={onRetry} />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('shows spinner on retry button when retrying=true', () => {
      render(<ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying />);
      const button = screen.getByRole('button', { name: 'Retry' });
      // Spinner is a Loader2 SVG with animate-spin; button is disabled during retry
      expect(button).toBeDisabled();
      // The SVG inside should have animate-spin class
      const spinner = button.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('disables retry button when retrying=true', () => {
      render(<ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying />);
      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });

    it('does not call onRetry when retrying=true and button clicked', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();

      render(<ErrorBanner message="Error" retryable onRetry={onRetry} retrying />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('recovered state', () => {
    it('shows "Recovered" status when retrying transitions from true to false', async () => {
      const { rerender } = render(
        <ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying />,
      );

      rerender(<ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying={false} />);

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.getByText('Recovered')).toBeInTheDocument();
      });
    });

    it('"Recovered" state auto-dismisses after ~2 seconds', async () => {
      vi.useFakeTimers();

      const { rerender } = render(
        <ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying />,
      );

      rerender(<ErrorBanner message="Error" retryable onRetry={vi.fn()} retrying={false} />);

      // Recovered should be visible immediately after transition
      await waitFor(() => {
        expect(screen.getByText('Recovered')).toBeInTheDocument();
      });

      // Advance past the 2-second auto-dismiss
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      await waitFor(() => {
        expect(screen.queryByText('Recovered')).not.toBeInTheDocument();
      });

      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// AsyncErrorBanner
// ---------------------------------------------------------------------------

describe('AsyncErrorBanner', () => {
  it('renders nothing when state is idle', () => {
    const state: AsyncState<string> = { status: 'idle' };
    const { container } = render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when state is loading', () => {
    const state: AsyncState<string> = { status: 'loading' };
    const { container } = render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when state is success', () => {
    const state: AsyncState<string> = { status: 'success', data: 'ok', updatedAt: new Date() };
    const { container } = render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when state is stale', () => {
    const state: AsyncState<string> = { status: 'stale', data: 'ok', refreshing: false };
    const { container } = render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders ErrorBanner when state is error', () => {
    const state: AsyncState<string> = {
      status: 'error',
      error: { message: 'Load failed', code: 'INTERNAL_ERROR', retryable: true },
      retryable: true,
    };
    render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Load failed')).toBeInTheDocument();
  });

  it('passes retryable=false from state to ErrorBanner', () => {
    const state: AsyncState<string> = {
      status: 'error',
      error: { message: 'Not found', code: 'RESOURCE_NOT_FOUND', retryable: false },
      retryable: false,
    };
    render(<AsyncErrorBanner state={state} retry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('passes retry callback and shows retry button when retryable', () => {
    const retry = vi.fn();
    const state: AsyncState<string> = {
      status: 'error',
      error: { message: 'Server error', code: 'INTERNAL_ERROR', retryable: true },
      retryable: true,
    };
    render(<AsyncErrorBanner state={state} retry={retry} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('forwards className to ErrorBanner', () => {
    const state: AsyncState<string> = {
      status: 'error',
      error: { message: 'Error', code: 'INTERNAL_ERROR', retryable: false },
      retryable: false,
    };
    render(<AsyncErrorBanner state={state} retry={vi.fn()} className="my-custom-class" />);
    expect(screen.getByRole('alert')).toHaveClass('my-custom-class');
  });
});
