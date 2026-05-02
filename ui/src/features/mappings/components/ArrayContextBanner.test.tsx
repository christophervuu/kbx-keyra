import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArrayContextBanner } from './ArrayContextBanner';

describe('ArrayContextBanner', () => {
  it('renders with map function and source field', () => {
    render(<ArrayContextBanner functionName="map" sourceField="order.items" />);
    const banner = screen.getByTestId('array-context-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('map()');
    expect(banner.textContent).toContain('order.items');
    expect(banner.textContent).toContain('item()');
  });

  it('renders with filter function', () => {
    render(<ArrayContextBanner functionName="filter" sourceField="products" />);
    expect(screen.getByTestId('array-context-banner').textContent).toContain('filter()');
  });

  it('has role="status" for accessibility', () => {
    render(<ArrayContextBanner functionName="map" sourceField="items" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('mentions item() in the message', () => {
    render(<ArrayContextBanner functionName="map" sourceField="lines" />);
    expect(screen.getByText(/use/i).closest('[data-testid]')?.textContent).toContain('item()');
  });
});
