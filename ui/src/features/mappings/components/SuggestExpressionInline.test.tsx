/**
 * SuggestExpressionInline component tests (FS-042 T-05).
 *
 * Covers all 5 state variants: idle, inputting, loading, success, error.
 * Tests keyboard shortcuts, button interactions, and accessibility attributes.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SuggestExpressionInline } from './SuggestExpressionInline';
import type { SuggestExpressionState } from '../hooks/use-suggest-expression';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TARGET_PATH = 'Order.Header.Currency';
const TARGET_TYPE = 'string';

const IDLE_STATE: SuggestExpressionState = {
  status: 'idle',
  result: null,
  error: null,
};

const INPUTTING_STATE: SuggestExpressionState = {
  status: 'inputting',
  result: null,
  error: null,
};

const LOADING_STATE: SuggestExpressionState = {
  status: 'loading',
  result: null,
  error: null,
};

const SUCCESS_STATE: SuggestExpressionState = {
  status: 'success',
  result: {
    expression: 'default(source("Invoice.CurrencyCode"), "USD")',
    explanation: 'Uses source currency and falls back to USD.',
  },
  error: null,
};

const SUCCESS_STATE_NO_EXPLANATION: SuggestExpressionState = {
  status: 'success',
  result: {
    expression: 'source("Invoice.CurrencyCode")',
    explanation: '',
  },
  error: null,
};

const ERROR_STATE: SuggestExpressionState = {
  status: 'error',
  result: null,
  error: 'Suggest Expression is not available in offline mode',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProps(
  state: SuggestExpressionState,
  overrides: Partial<{
    onGenerate: (instruction: string) => void;
    onAccept: (expression: string) => void;
    onDismiss: () => void;
  }> = {},
) {
  return {
    state,
    targetPath: TARGET_PATH,
    targetType: TARGET_TYPE,
    onGenerate: vi.fn(),
    onAccept: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuggestExpressionInline', () => {
  it('renders nothing when state is idle', () => {
    const { container } = render(<SuggestExpressionInline {...makeProps(IDLE_STATE)} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows textarea and Generate button when inputting', () => {
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE)} />);

    expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /natural language instruction/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows target path and type context when inputting', () => {
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE)} />);

    expect(screen.getByText(TARGET_PATH)).toBeInTheDocument();
    expect(screen.getByText(`(${TARGET_TYPE})`)).toBeInTheDocument();
  });

  it('Generate button is disabled when instruction is empty', () => {
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE)} />);

    const generateBtn = screen.getByRole('button', { name: /generate/i });
    expect(generateBtn).toBeDisabled();
  });

  it('Generate button is enabled when instruction has content', async () => {
    const user = userEvent.setup();
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE)} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    await user.type(textarea, 'default to USD');

    const generateBtn = screen.getByRole('button', { name: /generate expression/i });
    expect(generateBtn).not.toBeDisabled();
  });

  it('calls onGenerate with trimmed instruction when Generate is clicked', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE, { onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    await user.type(textarea, '  default to USD  ');

    const generateBtn = screen.getByRole('button', { name: /generate expression/i });
    await user.click(generateBtn);

    expect(onGenerate).toHaveBeenCalledWith('default to USD');
  });

  it('Ctrl+Enter submits instruction when non-empty', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE, { onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    await user.type(textarea, 'default to USD');
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onGenerate).toHaveBeenCalledWith('default to USD');
  });

  it('Ctrl+Enter does not submit when instruction is empty', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE, { onGenerate })} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    await user.click(textarea);
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('Escape key calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE, { onDismiss })} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    await user.click(textarea);
    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows loading state with disabled textarea and Generating button', () => {
    render(<SuggestExpressionInline {...makeProps(LOADING_STATE)} />);

    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    expect(textarea).toBeDisabled();

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled();
    // Cancel still available
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('Cancel during loading calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestExpressionInline {...makeProps(LOADING_STATE, { onDismiss })} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows expression in code block on success', () => {
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE)} />);

    expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();
    expect(
      screen.getByText('default(source("Invoice.CurrencyCode"), "USD")'),
    ).toBeInTheDocument();
  });

  it('shows explanation text when present in result', () => {
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE)} />);

    expect(
      screen.getByText('Uses source currency and falls back to USD.'),
    ).toBeInTheDocument();
  });

  it('does not show explanation area when explanation is empty', () => {
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE_NO_EXPLANATION)} />);

    expect(
      screen.queryByText('Uses source currency and falls back to USD.'),
    ).not.toBeInTheDocument();
  });

  it('calls onAccept with expression when Accept is clicked', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE, { onAccept })} />);

    await user.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith(
      'default(source("Invoice.CurrencyCode"), "USD")',
    );
  });

  it('calls onDismiss when Dismiss is clicked on success', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE, { onDismiss })} />);

    // There are two dismiss buttons (header X + Dismiss button) — click the text button
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss suggestion' });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows error message and Try Again button on error state', () => {
    render(<SuggestExpressionInline {...makeProps(ERROR_STATE)} />);

    expect(
      screen.getByText('Suggest Expression is not available in offline mode'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onDismiss when Dismiss is clicked on error state', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuggestExpressionInline {...makeProps(ERROR_STATE, { onDismiss })} />);

    const dismissBtn = screen.getAllByRole('button', { name: /dismiss/i })[0];
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('has correct ARIA attributes', () => {
    render(<SuggestExpressionInline {...makeProps(INPUTTING_STATE)} />);

    const region = screen.getByRole('region', { name: /suggest expression/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('data-testid', 'suggest-expression-inline');
  });

  it('result area has aria-live polite on success', () => {
    render(<SuggestExpressionInline {...makeProps(SUCCESS_STATE)} />);

    const liveRegion = screen.getByRole('region', { name: /suggest expression/i })
      .querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});
