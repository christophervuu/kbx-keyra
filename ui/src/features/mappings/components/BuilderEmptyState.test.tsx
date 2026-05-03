import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuilderEmptyState } from './BuilderEmptyState';

describe('BuilderEmptyState', () => {
  it('renders guidance heading', () => {
    render(<BuilderEmptyState onFilterRequired={vi.fn()} />);
    expect(screen.getByTestId('empty-state-heading')).toHaveTextContent(
      'Select a target field to create its mapping',
    );
  });

  it('renders all three CTA elements', () => {
    render(<BuilderEmptyState onFilterRequired={vi.fn()} />);
    expect(screen.getByTestId('cta-required-fields')).toBeInTheDocument();
    expect(screen.getByTestId('cta-automap')).toBeInTheDocument();
    expect(screen.getByTestId('cta-select-hint')).toBeInTheDocument();
  });

  it('"Start with required fields" fires onFilterRequired callback', () => {
    const onFilterRequired = vi.fn();
    render(<BuilderEmptyState onFilterRequired={onFilterRequired} />);
    fireEvent.click(screen.getByTestId('cta-required-fields'));
    expect(onFilterRequired).toHaveBeenCalledTimes(1);
  });

  it('"Auto-map this schema" is disabled', () => {
    render(<BuilderEmptyState onFilterRequired={vi.fn()} />);
    const btn = screen.getByTestId('cta-automap');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('"Auto-map this schema" has correct tooltip text', () => {
    render(<BuilderEmptyState onFilterRequired={vi.fn()} />);
    expect(screen.getByTestId('cta-automap')).toHaveAttribute(
      'title',
      'AI-powered auto-mapping \u2014 available in a future release',
    );
  });

  it('"Auto-map this schema" click does not fire any handler', () => {
    const onFilterRequired = vi.fn();
    render(<BuilderEmptyState onFilterRequired={onFilterRequired} />);
    fireEvent.click(screen.getByTestId('cta-automap'));
    expect(onFilterRequired).not.toHaveBeenCalled();
  });

  it('does not contain legacy "No rules yet" text', () => {
    render(<BuilderEmptyState onFilterRequired={vi.fn()} />);
    expect(screen.queryByText(/no rules yet/i)).not.toBeInTheDocument();
  });
});
