import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders Grid view and Table view buttons', () => {
    render(<ViewToggle viewMode="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Table view' })).toBeInTheDocument();
  });

  it('Grid view button has aria-pressed=true when viewMode is grid', () => {
    render(<ViewToggle viewMode="grid" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Table view button has aria-pressed=true when viewMode is table', () => {
    render(<ViewToggle viewMode="table" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with "table" when Table view button is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle viewMode="grid" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));
    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('calls onChange with "grid" when Grid view button is clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle viewMode="table" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });

  it('clicking already-active button still calls onChange', () => {
    const onChange = vi.fn();
    render(<ViewToggle viewMode="grid" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });
});
