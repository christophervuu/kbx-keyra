/**
 * ChainBuilderShell tests — FS-038 T-04
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { ChainBuilderShell } from './ChainBuilderShell';
import type { ChainBuilderShellProps } from './ChainBuilderShell';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { ExplainRuleResult, SuggestExpressionResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_PROPS: ChainBuilderShellProps = {
  targetPath: 'customer.email',
  targetType: 'string',
  isRequired: false,
  expression: '',
  result: null,
  isEvaluating: false,
  sourceDataAvailable: false,
  isMapped: false,
  isBuilderMode: true,
  onToggleMode: vi.fn(),
  onClearMapping: vi.fn(),
  onExpressionClick: vi.fn(),
  onExpressionAccept: vi.fn(),
  children: <div data-testid="test-children">Builder content</div>,
};

function makeDefaultAdapter(): Partial<ApiAdapter> {
  return {
    explainRule: vi.fn().mockResolvedValue({ explanation: 'Test explanation.' } satisfies ExplainRuleResult),
    suggestExpression: vi.fn().mockResolvedValue({
      expression: 'source("email")',
      explanation: 'Maps email.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      context: {
        sourceNodeCount: 10,
        includedNodeCount: 10,
        truncated: false,
        approxTokenCount: 64,
        byteLength: 512,
      },
    } satisfies SuggestExpressionResult),
  };
}

function renderShell(
  overrides: Partial<ChainBuilderShellProps> = {},
  adapter?: Partial<ApiAdapter>,
) {
  const mockAdapter = adapter ?? makeDefaultAdapter();
  const result = render(
    <AdapterProvider adapter={mockAdapter as ApiAdapter}>
      <ChainBuilderShell {...DEFAULT_PROPS} {...overrides} />
    </AdapterProvider>,
  );
  const rerender = (element: React.ReactElement) => {
    result.rerender(
      <AdapterProvider adapter={mockAdapter as ApiAdapter}>
        {element}
      </AdapterProvider>,
    );
  };
  return { ...result, rerender };
}

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — header row', () => {
  it('renders the shell container', () => {
    renderShell();
    expect(screen.getByTestId('chain-builder-shell')).toBeInTheDocument();
  });

  it('renders the header', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-header')).toBeInTheDocument();
  });

  it('renders the type badge with correct type', () => {
    renderShell({ targetType: 'number' });
    expect(screen.getByTestId('chain-shell-type-badge')).toHaveTextContent('number');
  });

  it('renders the target path', () => {
    renderShell({ targetPath: 'order.amount' });
    expect(screen.getByTestId('chain-shell-target-path')).toHaveTextContent('order.amount');
  });

  it('renders "required" tag when isRequired is true', () => {
    renderShell({ isRequired: true });
    expect(screen.getByTestId('chain-shell-required-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-shell-optional-tag')).not.toBeInTheDocument();
  });

  it('renders "optional" tag when isRequired is false', () => {
    renderShell({ isRequired: false });
    expect(screen.getByTestId('chain-shell-optional-tag')).toBeInTheDocument();
    expect(screen.queryByTestId('chain-shell-required-tag')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Builder/Editor toggle
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — mode toggle', () => {
  it('renders the mode toggle', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-mode-toggle')).toBeInTheDocument();
  });

  it('Builder button is active (pressed) when isBuilderMode is true', () => {
    renderShell({ isBuilderMode: true });
    expect(screen.getByTestId('chain-shell-toggle-builder')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chain-shell-toggle-editor')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Editor button is active (pressed) when isBuilderMode is false', () => {
    renderShell({ isBuilderMode: false });
    expect(screen.getByTestId('chain-shell-toggle-editor')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('chain-shell-toggle-builder')).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onToggleMode when Editor button is clicked in Builder mode', async () => {
    const user = userEvent.setup();
    const onToggleMode = vi.fn();
    renderShell({ isBuilderMode: true, onToggleMode });
    await user.click(screen.getByTestId('chain-shell-toggle-editor'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleMode when Builder button is clicked in Editor mode', async () => {
    const user = userEvent.setup();
    const onToggleMode = vi.fn();
    renderShell({ isBuilderMode: false, onToggleMode });
    await user.click(screen.getByTestId('chain-shell-toggle-builder'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AI action bar
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — AI action bar', () => {
  it('renders the AI bar', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-bar')).toBeInTheDocument();
  });

  it('renders Suggest button as enabled (FS-042)', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).not.toBeDisabled();
  });

  it('renders Explain button as disabled', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-explain')).toBeDisabled();
  });

  it('renders Fix button as disabled', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-fix')).toBeDisabled();
  });

  it('Suggest button has correct tooltip (FS-042)', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).toHaveAttribute(
      'title',
      'Generate a DSL expression from natural language',
    );
  });

  it('Suggest button has aria-label (FS-042)', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-suggest')).toHaveAttribute(
      'aria-label',
      'Suggest expression',
    );
  });

  it('Explain button has aria-label', () => {
    renderShell();
    // Empty expression → "No expression to explain" variant
    expect(screen.getByTestId('chain-shell-ai-explain')).toHaveAttribute(
      'aria-label',
      'Explain — No expression to explain',
    );
  });

  it('Fix button has aria-label', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-ai-fix')).toHaveAttribute(
      'aria-label',
      'Fix expression (coming soon)',
    );
  });
});

// ---------------------------------------------------------------------------
// Clear button
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — Clear button', () => {
  it('Clear button is NOT rendered when isMapped is false', () => {
    renderShell({ isMapped: false });
    expect(screen.queryByTestId('chain-shell-clear-btn')).not.toBeInTheDocument();
  });

  it('Clear button IS rendered when isMapped is true', () => {
    renderShell({ isMapped: true });
    expect(screen.getByTestId('chain-shell-clear-btn')).toBeInTheDocument();
  });

  it('Clear button fires onClearMapping when clicked', async () => {
    const user = userEvent.setup();
    const onClearMapping = vi.fn();
    renderShell({ isMapped: true, onClearMapping });
    await user.click(screen.getByTestId('chain-shell-clear-btn'));
    expect(onClearMapping).toHaveBeenCalledTimes(1);
  });

  it('Clear button has aria-label', () => {
    renderShell({ isMapped: true });
    expect(screen.getByTestId('chain-shell-clear-btn')).toHaveAttribute('aria-label', 'Clear mapping');
  });
});

// NOTE: legacy pinned expression/result sections were retired from ChainBuilderShell.

// ---------------------------------------------------------------------------
// Scrollable content area
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — scrollable content area', () => {
  it('renders the content area', () => {
    renderShell();
    expect(screen.getByTestId('chain-shell-content')).toBeInTheDocument();
  });

  it('renders children in the content area', () => {
    renderShell();
    expect(screen.getByTestId('test-children')).toBeInTheDocument();
    expect(screen.getByTestId('test-children')).toHaveTextContent('Builder content');
  });

  it('AE-11: does NOT render a suggested-sources row', () => {
    renderShell();
    // No suggested-sources element should exist
    expect(screen.queryByTestId('suggested-sources')).not.toBeInTheDocument();
    expect(screen.queryByText(/suggested/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — keyboard accessibility', () => {
  it('mode toggle buttons are keyboard focusable', () => {
    renderShell({ isBuilderMode: true });
    const editorBtn = screen.getByTestId('chain-shell-toggle-editor');
    editorBtn.focus();
    expect(document.activeElement).toBe(editorBtn);
  });

  it('Clear button is keyboard focusable when visible', () => {
    renderShell({ isMapped: true });
    const clearBtn = screen.getByTestId('chain-shell-clear-btn');
    clearBtn.focus();
    expect(document.activeElement).toBe(clearBtn);
  });
});

// ---------------------------------------------------------------------------
// FS-041: Explain Rule integration (AE-02)
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — Explain Rule (FS-041)', () => {
  it('Explain button is disabled when expression is empty', () => {
    renderShell({ expression: '' });
    const btn = screen.getByTestId('chain-shell-ai-explain');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'No expression to explain');
  });

  it('Explain button is enabled when expression is non-empty', () => {
    renderShell({ expression: 'source("email")' });
    const btn = screen.getByTestId('chain-shell-ai-explain');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Explain this expression using AI');
  });

  it('AE-02/AE-04: shows explanation panel with text and generated-assistance label on success', async () => {
    const explainRule = vi.fn().mockResolvedValue({
      explanation: 'Maps the email field from the source.',
      confidence: 'high',
      limitations: ['Assumes source email is present.'],
    } satisfies ExplainRuleResult);
    renderShell({ expression: 'source("email")' }, { explainRule });

    fireEvent.click(screen.getByTestId('chain-shell-ai-explain'));

    await waitFor(() => {
      expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explanation-panel')).toHaveTextContent(
      'Maps the email field from the source.',
    );
    expect(screen.getByTestId('explanation-assistance-label')).toHaveTextContent(
      'AI-generated assistance. This explanation is not persisted to mapping content.',
    );
  });

  it('shows error state with Try again button', async () => {
    const explainRule = vi.fn().mockRejectedValue(
      new Error('Not available in offline mode'),
    );
    renderShell({ expression: 'source("email")' }, { explainRule });

    fireEvent.click(screen.getByTestId('chain-shell-ai-explain'));

    await waitFor(() => {
      expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explanation-panel')).toHaveTextContent(
      'Explain is not available in offline mode',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('dismiss closes the panel', async () => {
    const explainRule = vi.fn().mockResolvedValue({
      explanation: 'Some explanation.',
    } satisfies ExplainRuleResult);
    renderShell({ expression: 'source("email")' }, { explainRule });

    fireEvent.click(screen.getByTestId('chain-shell-ai-explain'));
    await waitFor(() => {
      expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss explanation' }));
    expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument();
  });

  it('explanation panel disappears when targetPath changes', async () => {
    const explainRule = vi.fn().mockResolvedValue({
      explanation: 'Some explanation.',
    } satisfies ExplainRuleResult);
    const { rerender } = renderShell({ expression: 'source("email")' }, { explainRule });

    fireEvent.click(screen.getByTestId('chain-shell-ai-explain'));
    await waitFor(() => {
      expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
    });

    rerender(
      <ChainBuilderShell
        {...DEFAULT_PROPS}
        targetPath="customer.name"
        expression='source("name")'
      />,
    );

    expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FS-042: Suggest Expression integration
// ---------------------------------------------------------------------------

describe('ChainBuilderShell — Suggest Expression (FS-042)', () => {
  it('clicking Suggest button opens the inline input area', () => {
    renderShell();
    fireEvent.click(screen.getByTestId('chain-shell-ai-suggest'));
    expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /natural language instruction/i }),
    ).toBeInTheDocument();
  });

  it('SuggestExpressionInline is not rendered when suggest state is idle', () => {
    renderShell();
    expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
  });

  it('suggest panel resets when targetPath changes', async () => {
    const { rerender } = renderShell();

    // Open suggest panel
    fireEvent.click(screen.getByTestId('chain-shell-ai-suggest'));
    expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();

    // Navigate to a different field
    rerender(
      <ChainBuilderShell
        {...DEFAULT_PROPS}
        targetPath="customer.name"
        expression=""
      />,
    );

    expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
  });

  it('Accept calls onExpressionAccept with the suggested expression', async () => {
    const onExpressionAccept = vi.fn();
    const suggestExpression = vi.fn().mockResolvedValue({
      expression: 'source("email")',
      explanation: 'Maps email.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      context: {
        sourceNodeCount: 10,
        includedNodeCount: 10,
        truncated: false,
        approxTokenCount: 64,
        byteLength: 512,
      },
    } satisfies SuggestExpressionResult);
    renderShell({ onExpressionAccept }, { suggestExpression });

    // Open suggest panel
    fireEvent.click(screen.getByTestId('chain-shell-ai-suggest'));

    // Type instruction and generate
    const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
    fireEvent.change(textarea, { target: { value: 'map email field' } });
    fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

    // Wait for success state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onExpressionAccept).toHaveBeenCalledWith('source("email")');
    // Panel should close after accept
    expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
  });

  it('uses canonical suggest payload and renders current-vs-generated comparison', async () => {
    const suggestExpression = vi.fn().mockResolvedValue({
      expression: 'source("email")',
      explanation: 'Maps email.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      context: {
        sourceNodeCount: 10,
        includedNodeCount: 10,
        truncated: false,
        approxTokenCount: 64,
        byteLength: 512,
      },
    } satisfies SuggestExpressionResult);

    renderShell({ expression: 'source("customer.email")' }, { suggestExpression });

    fireEvent.click(screen.getByTestId('chain-shell-ai-suggest'));
    fireEvent.change(screen.getByRole('textbox', { name: /natural language instruction/i }), {
      target: { value: 'map email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

    await waitFor(() => {
      expect(screen.getByTestId('suggest-expression-comparison')).toBeInTheDocument();
    });

    const payload = suggestExpression.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      instruction: 'map email',
      targetPath: 'customer.email',
      targetType: 'string',
    });
    expect(payload).not.toHaveProperty('sourceContext');

    expect(screen.getByText('Current expression')).toBeInTheDocument();
    expect(screen.getByText('Generated suggestion')).toBeInTheDocument();
  });
});
