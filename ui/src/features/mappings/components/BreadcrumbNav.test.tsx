import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BreadcrumbNav } from './BreadcrumbNav';

describe('BreadcrumbNav', () => {
  it('renders Root button always', () => {
    render(<BreadcrumbNav currentPath={null} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('breadcrumb-root')).toBeInTheDocument();
  });

  it('renders no segments when currentPath is null', () => {
    render(<BreadcrumbNav currentPath={null} onNavigate={vi.fn()} />);
    expect(screen.queryByTestId(/breadcrumb-segment/)).not.toBeInTheDocument();
  });

  it('renders correct segments for a dot-path', () => {
    render(<BreadcrumbNav currentPath="address.billing" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('breadcrumb-segment-address')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-segment-address.billing')).toBeInTheDocument();
  });

  it('clicking Root fires onNavigate(null)', () => {
    const onNavigate = vi.fn();
    render(<BreadcrumbNav currentPath="address.billing" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('breadcrumb-root'));
    expect(onNavigate).toHaveBeenCalledWith(null);
  });

  it('clicking a segment fires onNavigate with that segment path', () => {
    const onNavigate = vi.fn();
    render(<BreadcrumbNav currentPath="address.billing.city" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('breadcrumb-segment-address'));
    expect(onNavigate).toHaveBeenCalledWith('address');
  });

  it('last segment has aria-current="page"', () => {
    render(<BreadcrumbNav currentPath="address.billing" onNavigate={vi.fn()} />);
    const last = screen.getByTestId('breadcrumb-segment-address.billing');
    expect(last).toHaveAttribute('aria-current', 'page');
  });

  it('non-last segments do not have aria-current', () => {
    render(<BreadcrumbNav currentPath="address.billing" onNavigate={vi.fn()} />);
    const first = screen.getByTestId('breadcrumb-segment-address');
    expect(first).not.toHaveAttribute('aria-current');
  });

  it('Root has aria-current="page" when currentPath is null', () => {
    render(<BreadcrumbNav currentPath={null} onNavigate={vi.fn()} />);
    expect(screen.getByTestId('breadcrumb-root')).toHaveAttribute('aria-current', 'page');
  });

  it('truncates to last 4 segments for deep paths', () => {
    render(
      <BreadcrumbNav
        currentPath="a.b.c.d.e"
        onNavigate={vi.fn()}
      />,
    );
    // Only last 4 segments visible: b.c, b.c.d, b.c.d.e... let's check the last 4
    expect(screen.queryByTestId('breadcrumb-segment-a')).not.toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-segment-a.b.c.d.e')).toBeInTheDocument();
  });
});
