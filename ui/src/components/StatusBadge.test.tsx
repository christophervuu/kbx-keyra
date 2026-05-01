import { render, screen } from '@testing-library/react';

import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders "Deployed" with green dot (AE-09)', () => {
    const { container } = render(<StatusBadge status="deployed" />);

    expect(screen.getByText('Deployed')).toBeInTheDocument();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-green-500');
  });

  it('renders "Stale" with orange dot (AE-09)', () => {
    const { container } = render(<StatusBadge status="stale" />);

    expect(screen.getByText('Stale')).toBeInTheDocument();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-orange-500');
  });

  it('renders "Not deployed" with gray dot (AE-09)', () => {
    const { container } = render(<StatusBadge status="not-deployed" />);

    expect(screen.getByText('Not deployed')).toBeInTheDocument();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-slate-500');
  });

  it('renders "Deploying" with yellow dot (AE-09)', () => {
    const { container } = render(<StatusBadge status="deploying" />);

    expect(screen.getByText('Deploying')).toBeInTheDocument();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-yellow-500');
  });

  it('renders as inline element suitable for tables and cards', () => {
    const { container } = render(<StatusBadge status="deployed" />);

    expect(container.firstChild).toHaveClass('inline-flex');
  });
});
