import { render, screen } from '@testing-library/react';

import { Card } from '@/components/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);

    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders with title header', () => {
    render(<Card title="My Card">Content</Card>);

    expect(screen.getByText('My Card')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    render(
      <Card title="My Card" description="Card description">
        Content
      </Card>,
    );

    expect(screen.getByText('My Card')).toBeInTheDocument();
    expect(screen.getByText('Card description')).toBeInTheDocument();
  });

  it('does not render header when no title or description', () => {
    const { container } = render(<Card>Content only</Card>);

    // No h3 element should be present
    expect(container.querySelector('h3')).not.toBeInTheDocument();
  });

  it('applies additional className', () => {
    const { container } = render(<Card className="custom-class">Content</Card>);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders as a bordered container', () => {
    const { container } = render(<Card>Content</Card>);

    expect(container.firstChild).toHaveClass('rounded-lg', 'border', 'border-slate-700');
  });
});
