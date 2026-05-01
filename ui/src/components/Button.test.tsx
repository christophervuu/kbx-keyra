import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { Button } from '@/components/Button';

describe('Button', () => {
  describe('variants', () => {
    it('renders primary variant by default', () => {
      render(<Button>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('bg-blue-600');
    });

    it('renders secondary variant', () => {
      render(<Button variant="secondary">Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('bg-slate-700');
    });

    it('renders ghost variant', () => {
      render(<Button variant="ghost">Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('bg-transparent');
    });

    it('renders danger variant', () => {
      render(<Button variant="danger">Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('bg-red-600');
    });
  });

  describe('sizes', () => {
    it('renders md size by default', () => {
      render(<Button>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('px-4', 'py-2', 'text-sm');
    });

    it('renders sm size', () => {
      render(<Button size="sm">Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('px-2.5', 'py-1', 'text-xs');
    });

    it('renders lg size', () => {
      render(<Button size="lg">Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toHaveClass('px-5', 'py-2.5', 'text-base');
    });
  });

  describe('states', () => {
    it('handles disabled state', () => {
      render(<Button disabled>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toBeDisabled();
    });

    it('shows loading state with spinner and disables interaction', () => {
      render(<Button loading>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('calls onClick when not disabled', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(<Button onClick={onClick}>Click</Button>);
      await user.click(screen.getByRole('button', { name: 'Click' }));

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <Button disabled onClick={onClick}>
          Click
        </Button>,
      );
      await user.click(screen.getByRole('button', { name: 'Click' }));

      expect(onClick).not.toHaveBeenCalled();
    });

    it('does not call onClick when loading', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <Button loading onClick={onClick}>
          Click
        </Button>,
      );
      await user.click(screen.getByRole('button', { name: 'Click' }));

      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
