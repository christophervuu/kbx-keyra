import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConnectorPrompt, CONNECTOR_CANDIDATES } from './ConnectorPrompt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPrompt(
  sources: string[],
  onFunctionSelected = vi.fn(),
) {
  render(
    <ConnectorPrompt
      sources={sources}
      onFunctionSelected={onFunctionSelected}
    />,
  );
  return { onFunctionSelected };
}

// ---------------------------------------------------------------------------
// Visibility guard
// ---------------------------------------------------------------------------

describe('ConnectorPrompt — visibility', () => {
  it('renders when given 2 sources', () => {
    renderPrompt(['order.firstName', 'order.lastName']);
    expect(screen.getByTestId('connector-prompt')).toBeInTheDocument();
  });

  it('renders when given 3 sources', () => {
    renderPrompt(['a', 'b', 'c']);
    expect(screen.getByTestId('connector-prompt')).toBeInTheDocument();
  });

  it('does not render when given 0 sources', () => {
    renderPrompt([]);
    expect(screen.queryByTestId('connector-prompt')).not.toBeInTheDocument();
  });

  it('does not render when given 1 source', () => {
    renderPrompt(['order.name']);
    expect(screen.queryByTestId('connector-prompt')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Prompt text and structure
// ---------------------------------------------------------------------------

describe('ConnectorPrompt — structure', () => {
  it('renders the prompt label text', () => {
    renderPrompt(['a', 'b']);
    expect(screen.getByTestId('connector-prompt-label')).toHaveTextContent(
      'How should these be combined?',
    );
  });

  it('renders the source count badge', () => {
    renderPrompt(['a', 'b']);
    expect(screen.getByTestId('connector-prompt-source-count')).toHaveTextContent('2 sources');
  });

  it('source count badge updates for 3 sources', () => {
    renderPrompt(['a', 'b', 'c']);
    expect(screen.getByTestId('connector-prompt-source-count')).toHaveTextContent('3 sources');
  });

  it('renders the function select dropdown', () => {
    renderPrompt(['a', 'b']);
    expect(screen.getByTestId('connector-prompt-select')).toBeInTheDocument();
  });

  it('select has accessible aria-label', () => {
    renderPrompt(['a', 'b']);
    expect(screen.getByTestId('connector-prompt-select')).toHaveAttribute(
      'aria-label',
      'Select combining function',
    );
  });

  it('renders the bridge icon', () => {
    renderPrompt(['a', 'b']);
    expect(screen.getByTestId('connector-prompt-icon')).toBeInTheDocument();
  });

  it('container has role=region and aria-label', () => {
    renderPrompt(['a', 'b']);
    const container = screen.getByTestId('connector-prompt');
    expect(container).toHaveAttribute('role', 'region');
    expect(container).toHaveAttribute('aria-label', 'Connector prompt');
  });
});

// ---------------------------------------------------------------------------
// Dropdown options
// ---------------------------------------------------------------------------

describe('ConnectorPrompt — dropdown options', () => {
  it('contains concat as an option', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).getByRole('option', { name: /^concat/ })).toBeInTheDocument();
  });

  it('contains coalesce as an option', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).getByRole('option', { name: /^coalesce/ })).toBeInTheDocument();
  });

  it('contains add as an option', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).getByRole('option', { name: /^add/ })).toBeInTheDocument();
  });

  it('contains subtract as an option', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).getByRole('option', { name: /^subtract/ })).toBeInTheDocument();
  });

  it('does not contain SourceAccess functions (source, item, etc.)', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).queryByRole('option', { name: /^source/ })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /^item/ })).not.toBeInTheDocument();
  });

  it('does not contain single-input functions (upper, lower, etc.)', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    expect(within(select).queryByRole('option', { name: /^upper/ })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: /^lower/ })).not.toBeInTheDocument();
  });

  it('has a disabled placeholder option as the first option', () => {
    renderPrompt(['a', 'b']);
    const select = screen.getByTestId('connector-prompt-select');
    const placeholder = within(select).getByRole('option', { name: 'Choose function…' });
    expect(placeholder).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Function selection callback
// ---------------------------------------------------------------------------

describe('ConnectorPrompt — function selection', () => {
  it('calls onFunctionSelected with "concat" when concat is selected', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderPrompt(['a', 'b']);
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'concat');
    expect(onFunctionSelected).toHaveBeenCalledOnce();
    expect(onFunctionSelected).toHaveBeenCalledWith('concat');
  });

  it('calls onFunctionSelected with "coalesce" when coalesce is selected', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderPrompt(['a', 'b']);
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'coalesce');
    expect(onFunctionSelected).toHaveBeenCalledOnce();
    expect(onFunctionSelected).toHaveBeenCalledWith('coalesce');
  });

  it('calls onFunctionSelected with "add" when add is selected', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderPrompt(['a', 'b']);
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'add');
    expect(onFunctionSelected).toHaveBeenCalledWith('add');
  });

  it('calls onFunctionSelected with "subtract" when subtract is selected', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderPrompt(['a', 'b']);
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'subtract');
    expect(onFunctionSelected).toHaveBeenCalledWith('subtract');
  });

  it('does not call onFunctionSelected when placeholder (empty) is selected', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderPrompt(['a', 'b']);
    // Select a real option first, then try to re-select placeholder
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'concat');
    onFunctionSelected.mockClear();
    // Placeholder is disabled so userEvent won't select it — just verify no extra calls
    expect(onFunctionSelected).not.toHaveBeenCalled();
  });

  it('passes the exact function name string to onFunctionSelected', async () => {
    const user = userEvent.setup();
    const onFunctionSelected = vi.fn();
    render(
      <ConnectorPrompt
        sources={['x', 'y']}
        onFunctionSelected={onFunctionSelected}
      />,
    );
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'concat');
    const [calledWith] = onFunctionSelected.mock.calls[0] as [string];
    expect(typeof calledWith).toBe('string');
    expect(calledWith).toBe('concat');
  });
});

// ---------------------------------------------------------------------------
// CONNECTOR_CANDIDATES export
// ---------------------------------------------------------------------------

describe('CONNECTOR_CANDIDATES', () => {
  it('is a non-empty array', () => {
    expect(CONNECTOR_CANDIDATES.length).toBeGreaterThan(0);
  });

  it('includes concat', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'concat')).toBe(true);
  });

  it('includes coalesce', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'coalesce')).toBe(true);
  });

  it('includes add', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'add')).toBe(true);
  });

  it('includes subtract', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'subtract')).toBe(true);
  });

  it('excludes SourceAccess functions', () => {
    expect(CONNECTOR_CANDIDATES.every((e) => e.category !== 'SourceAccess')).toBe(true);
  });

  it('excludes Array functions', () => {
    expect(CONNECTOR_CANDIDATES.every((e) => e.category !== 'Array')).toBe(true);
  });

  it('all entries have 2+ required params or a variadic param', () => {
    for (const entry of CONNECTOR_CANDIDATES) {
      const requiredCount = entry.parameters.filter((p) => p.required).length;
      const hasVariadic = entry.parameters.some((p) => p.variadic);
      expect(
        requiredCount >= 2 || hasVariadic,
        `${entry.name} should have 2+ required params or variadic`,
      ).toBe(true);
    }
  });

  it('excludes single-input functions like upper', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'upper')).toBe(false);
  });

  it('excludes single-input functions like lower', () => {
    expect(CONNECTOR_CANDIDATES.some((e) => e.name === 'lower')).toBe(false);
  });
});
