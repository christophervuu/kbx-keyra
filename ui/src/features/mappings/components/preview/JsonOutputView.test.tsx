import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JsonOutputView } from './JsonOutputView';

import { buildRenderableOutput } from '@/features/mappings/lib';

describe('JsonOutputView', () => {
  it('renders interactive JSON output with path key buttons', () => {
    const onPathClick = vi.fn();
    render(
      <JsonOutputView
        renderableOutput={buildRenderableOutput({ Order: { Status: 'Active' } })}
        onPathClick={onPathClick}
      />,
    );

    const keyButton = screen.getByTestId('output-key-Order.Status');
    expect(keyButton.tagName.toLowerCase()).toBe('button');
    fireEvent.click(keyButton);
    expect(onPathClick).toHaveBeenCalledWith('Order.Status');
  });

  it('auto-expands ancestor branches for search matches and highlights matched rows', () => {
    render(
      <JsonOutputView
        renderableOutput={buildRenderableOutput({
          Order: { Header: { DocumentType: 'INV', Currency: 'USD' } },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId('output-toggle-Order'));
    expect(screen.getByTestId('output-toggle-Order')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(screen.getByTestId('output-search-input'), {
      target: { value: 'documenttype' },
    });

    expect(screen.getByTestId('output-toggle-Order')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('output-search-match-Order.Header.DocumentType')).toHaveClass('bg-amber-500/20');
  });

  it('shows explicit no-results message when search has no path matches', () => {
    render(
      <JsonOutputView
        renderableOutput={buildRenderableOutput({ Order: { Status: 'Active' } })}
      />,
    );

    fireEvent.change(screen.getByTestId('output-search-input'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByTestId('output-search-no-results')).toHaveTextContent('No matching output nodes');
  });

  it('does not render duplicate commas between sibling properties', () => {
    render(
      <JsonOutputView
        renderableOutput={buildRenderableOutput({
          organizationCode: 'recycling',
          locationCode: 'test',
        })}
      />,
    );

    expect(screen.getByLabelText('Execution output').textContent).not.toContain(',,');
  });
});
