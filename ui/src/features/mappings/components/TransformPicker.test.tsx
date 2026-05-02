import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TransformPicker } from './TransformPicker';
import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof TransformPicker>> = {},
) {
  const defaults: React.ComponentProps<typeof TransformPicker> = {
    selectedSourceFields: [],
    onFunctionSelect: vi.fn(),
    catalog: DSL_FUNCTION_CATALOG,
  };
  return render(<TransformPicker {...defaults} {...overrides} />);
}

describe('TransformPicker', () => {
  it('renders the search input', () => {
    renderPicker();
    expect(screen.getByRole('textbox', { name: 'Search transform functions' })).toBeInTheDocument();
  });

  it('renders category accordion headers', () => {
    renderPicker();
    // String category is expanded by default, others collapsed
    expect(screen.getByRole('button', { name: /String/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Date & Time/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Math/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conditional/i })).toBeInTheDocument();
  });

  it('does not render SourceAccess functions', () => {
    renderPicker();
    // Expand all by searching
    fireEvent.change(screen.getByRole('textbox', { name: 'Search transform functions' }), {
      target: { value: 'source' },
    });
    // 'source' function (SourceAccess) should not appear as a clickable function entry
    const functionButtons = screen.queryAllByRole('button', { name: /^source:/ });
    expect(functionButtons).toHaveLength(0);
  });

  it('shows function name, description and param count in expanded category', () => {
    renderPicker();
    // String is expanded by default — concat should be visible
    expect(screen.getByRole('button', { name: /concat.*Concatenates/i })).toBeInTheDocument();
    // Param count badge
    expect(screen.getByText('1+ params')).toBeInTheDocument();
  });

  it('expands and collapses a category on click', () => {
    renderPicker();
    // Click "Math" to expand
    const mathHeader = screen.getByRole('button', { name: /Math/ });
    fireEvent.click(mathHeader);
    expect(mathHeader).toHaveAttribute('aria-expanded', 'true');
    // Click again to collapse
    fireEvent.click(mathHeader);
    expect(mathHeader).toHaveAttribute('aria-expanded', 'false');
  });

  it('filters functions by search query and auto-expands matching categories', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(screen.getByRole('textbox', { name: 'Search transform functions' }), 'upper');
    // 'upper' is a String function — should appear
    expect(screen.getByRole('button', { name: /upper.*Converts a string to uppercase/i })).toBeInTheDocument();
    // 'round' is Math — should not appear for 'upper' query
    expect(screen.queryByRole('button', { name: /^round:/i })).not.toBeInTheDocument();
  });

  it('shows no-results message when search matches nothing', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.type(
      screen.getByRole('textbox', { name: 'Search transform functions' }),
      'zzznomatch',
    );
    expect(screen.getByText(/No functions match your search/i)).toBeInTheDocument();
  });

  it('calls onFunctionSelect with the function name when clicked', () => {
    const onFunctionSelect = vi.fn();
    renderPicker({ onFunctionSelect });
    // String is expanded by default
    fireEvent.click(screen.getByRole('button', { name: /upper.*Converts a string to uppercase/i }));
    expect(onFunctionSelect).toHaveBeenCalledWith('upper');
  });

  it('shows param count as "1 param" for single-param functions', () => {
    renderPicker();
    // 'upper' has parameterCount: 1
    const btn = screen.getByRole('button', { name: /upper/i });
    expect(btn).toHaveTextContent('1 param');
  });

  it('shows param count as "N params" for multi-param functions', () => {
    renderPicker();
    // 'replace' has parameterCount: 3
    // Search for it to make sure it's visible
    fireEvent.change(screen.getByRole('textbox', { name: 'Search transform functions' }), {
      target: { value: 'replace' },
    });
    const replaceBtn = screen.getAllByRole('button', { name: /^replace:/i });
    expect(replaceBtn[0]).toHaveTextContent('3 params');
  });
});
