// NeedsAttention.test.tsx — Component tests for the Needs Attention section (FS-049 T-02)

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NeedsAttention } from '../NeedsAttention';

describe('NeedsAttention', () => {
  it('renders data-testid="needs-attention" on root element', () => {
    render(<NeedsAttention errorsCount={0} />);
    expect(screen.getByTestId('needs-attention')).toBeInTheDocument();
  });

  it('renders "Nothing needs attention" when errorsCount is 0', () => {
    render(<NeedsAttention errorsCount={0} />);
    expect(screen.getByText(/nothing needs attention/i)).toBeInTheDocument();
  });

  it('does not render attention item rows when errorsCount is 0', () => {
    render(<NeedsAttention errorsCount={0} />);
    expect(screen.queryByTestId('attention-errors')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attention-stale-deploys')).not.toBeInTheDocument();
    expect(screen.queryByTestId('attention-unsynced-schemas')).not.toBeInTheDocument();
  });

  it('renders "Mappings with errors" row when errorsCount > 0', () => {
    render(<NeedsAttention errorsCount={2} />);
    expect(screen.getByTestId('attention-errors')).toBeInTheDocument();
    expect(screen.getByText('Mappings with errors')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders scaffold items when errorsCount > 0', () => {
    render(<NeedsAttention errorsCount={1} />);
    expect(screen.getByTestId('attention-stale-deploys')).toBeInTheDocument();
    expect(screen.getByText('Stale deployments')).toBeInTheDocument();
    expect(screen.getByTestId('attention-unsynced-schemas')).toBeInTheDocument();
    expect(screen.getByText('Unsynced schemas')).toBeInTheDocument();
  });

  it('scaffold items show placeholder "—" value', () => {
    render(<NeedsAttention errorsCount={3} />);
    // Both scaffold items show "—"
    const dashes = screen.getAllByText('—');
    expect(dashes).toHaveLength(2);
  });

  it('renders correct count for multiple errors', () => {
    render(<NeedsAttention errorsCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders "Needs Attention" section heading', () => {
    render(<NeedsAttention errorsCount={0} />);
    expect(screen.getByRole('heading', { name: /needs attention/i })).toBeInTheDocument();
  });

  it('attention item rows are disabled buttons (non-interactive)', () => {
    render(<NeedsAttention errorsCount={1} />);
    const errorsBtn = screen.getByTestId('attention-errors');
    expect(errorsBtn).toBeDisabled();
    const staleBtn = screen.getByTestId('attention-stale-deploys');
    expect(staleBtn).toBeDisabled();
    const unsyncedBtn = screen.getByTestId('attention-unsynced-schemas');
    expect(unsyncedBtn).toBeDisabled();
  });

  it('does not render "Nothing needs attention" when errorsCount > 0', () => {
    render(<NeedsAttention errorsCount={1} />);
    expect(screen.queryByText(/nothing needs attention/i)).not.toBeInTheDocument();
  });
});
