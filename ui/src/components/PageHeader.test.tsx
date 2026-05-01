import { render, screen } from '@testing-library/react';

import { PageHeader } from '@/components/PageHeader';

describe('PageHeader', () => {
  it('renders the title as an h1', () => {
    render(<PageHeader title="Dashboard" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders with optional description', () => {
    render(<PageHeader title="Dashboard" description="Overview of your projects" />);

    expect(screen.getByText('Overview of your projects')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<PageHeader title="Dashboard" />);

    const heading = screen.getByRole('heading', { name: 'Dashboard' });
    expect(heading.parentElement?.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders action slot', () => {
    render(<PageHeader title="Dashboard" actions={<button>New Project</button>} />);

    expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument();
  });

  it('does not render action container when not provided', () => {
    const { container } = render(<PageHeader title="Dashboard" />);

    // Only one direct child div (the text container)
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.children).toHaveLength(1);
  });
});
