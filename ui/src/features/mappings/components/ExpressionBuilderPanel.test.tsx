import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ExpressionBuilderPanel } from './ExpressionBuilderPanel';
import type { ExpressionBuilderPanelRef } from './ExpressionBuilderPanel';
import type { ExpressionBuilderResult } from '../hooks/use-expression-builder';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBuilderState(overrides: Partial<ExpressionBuilderResult> = {}): ExpressionBuilderResult {
  return {
    mode: 'editor',
    switchToEditor: vi.fn(),
    switchToBuilder: vi.fn(),
    dismissDecompositionWarning: vi.fn(),
    forceBuilder: vi.fn(),
    expression: 'source("name")',
    setExpression: vi.fn(),
    validationResult: null,
    isValid: true,
    isValidating: false,
    errorDecorations: [],
    selectedRule: { target: 'output.name', type: 'string', expression: 'source("name")' },
    canDecompose: true,
    hasUnsavedChanges: false,
    decompositionWarning: null,
    initialBuilderState: null,
    ...overrides,
  };
}

function renderPanel(state: ExpressionBuilderResult | null) {
  const adapter: Partial<ApiAdapter> = {
    explainRule: vi.fn().mockResolvedValue({ explanation: 'ok' }),
    suggestExpression: vi.fn().mockResolvedValue({ expression: 'source("name")' }),
  };
  return render(
    <AdapterProvider adapter={adapter as ApiAdapter}>
      <ExpressionBuilderPanel builderState={state} />
    </AdapterProvider>,
  );
}

function renderPanelWithRef(state: ExpressionBuilderResult | null) {
  const adapter: Partial<ApiAdapter> = {
    explainRule: vi.fn().mockResolvedValue({ explanation: 'ok' }),
    suggestExpression: vi.fn().mockResolvedValue({ expression: 'source("name")' }),
  };
  const ref = createRef<ExpressionBuilderPanelRef>();
  const utils = render(
    <AdapterProvider adapter={adapter as ApiAdapter}>
      <ExpressionBuilderPanel builderState={state} ref={ref} />
    </AdapterProvider>,
  );
  return { ref, ...utils };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExpressionBuilderPanel', () => {
  it('renders empty state when builderState is null', () => {
    renderPanel(null);
    expect(
      screen.getByText('Select a rule to edit its expression, or add a new rule.'),
    ).toBeInTheDocument();
  });

  it('renders empty state when selectedRule is null', () => {
    const state = makeBuilderState({ selectedRule: null });
    renderPanel(state);
    expect(
      screen.getByText('Select a rule to edit its expression, or add a new rule.'),
    ).toBeInTheDocument();
  });

  it('renders mode toggle when rule is selected', () => {
    renderPanel(makeBuilderState());
    expect(screen.getByRole('group', { name: 'Expression builder mode' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Builder' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Editor' })).toBeInTheDocument();
  });

  it('highlights the active mode button', () => {
    renderPanel(makeBuilderState({ mode: 'editor' }));
    expect(screen.getByRole('radio', { name: 'Editor' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Builder' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls switchToBuilder when Builder button is clicked', async () => {
    const user = userEvent.setup();
    const switchToBuilder = vi.fn();
    renderPanel(makeBuilderState({ switchToBuilder }));

    await user.click(screen.getByRole('radio', { name: 'Builder' }));
    expect(switchToBuilder).toHaveBeenCalledOnce();
  });

  it('calls switchToEditor when Editor button is clicked (from builder mode)', async () => {
    const user = userEvent.setup();
    const switchToEditor = vi.fn();
    renderPanel(makeBuilderState({ mode: 'builder', switchToEditor }));

    await user.click(screen.getByRole('radio', { name: 'Editor' }));
    expect(switchToEditor).toHaveBeenCalledOnce();
  });

  it('renders editor slot in editor mode', () => {
    renderPanel(makeBuilderState({ mode: 'editor' }));
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
  });

  it('renders builder slot in builder mode', () => {
    renderPanel(makeBuilderState({ mode: 'builder' }));
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
  });

  it('shows unsaved changes indicator when hasUnsavedChanges is true', () => {
    renderPanel(makeBuilderState({ hasUnsavedChanges: true }));
    expect(
      screen.getByText(/Expression has syntax errors — not saved to rule/),
    ).toBeInTheDocument();
  });

  it('does not show unsaved changes indicator when hasUnsavedChanges is false', () => {
    renderPanel(makeBuilderState({ hasUnsavedChanges: false }));
    expect(
      screen.queryByText(/Expression has syntax errors/),
    ).not.toBeInTheDocument();
  });

  it('shows decomposition warning when decompositionWarning is set (AE-07)', () => {
    renderPanel(
      makeBuilderState({
        decompositionWarning: 'Expression nests too deeply for the guided builder.',
      }),
    );
    expect(screen.getByTestId('decomposition-warning-container')).toBeInTheDocument();
    expect(screen.getByText(/nests too deeply/i)).toBeInTheDocument();
  });

  it('does not show decomposition warning when decompositionWarning is null', () => {
    renderPanel(makeBuilderState({ decompositionWarning: null }));
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  it('"Stay in Editor" in warning calls dismissDecompositionWarning', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn();
    renderPanel(
      makeBuilderState({
        decompositionWarning: 'Too complex.',
        dismissDecompositionWarning: dismiss,
      }),
    );
    await user.click(screen.getByText(/stay in editor/i));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('"Try Builder anyway" in warning calls forceBuilder', async () => {
    const user = userEvent.setup();
    const forceBuilder = vi.fn();
    renderPanel(
      makeBuilderState({
        decompositionWarning: 'Too complex.',
        forceBuilder,
      }),
    );
    await user.click(screen.getByText(/try builder anyway/i));
    expect(forceBuilder).toHaveBeenCalledOnce();
  });

  it('insertSourceField inserts enrichment DSL in editor mode', () => {
    const setExpression = vi.fn();
    const state = makeBuilderState({ mode: 'editor', expression: '', setExpression });
    const { ref } = renderPanelWithRef(state);

    ref.current?.insertSourceField({
      path: 'customerId',
      kind: 'enrichment',
      alias: 'profile',
      expression: 'get(external("profile"), "customerId")',
    });

    expect(setExpression).toHaveBeenCalledWith('get(external("profile"), "customerId")');
  });

  it('insertSourceField in builder mode sets primary source path and emits source(path)', async () => {
    const user = userEvent.setup();
    const setExpression = vi.fn();
    const state = makeBuilderState({ mode: 'builder', expression: '', setExpression });
    const { ref } = renderPanelWithRef(state);

    act(() => {
      ref.current?.insertSourceField({
        path: 'order.id',
        kind: 'primary',
        expression: 'source("order.id")',
      });
    });

    // Trigger the builder chain effect by adding a logic step (causes new chain generation)
    await user.click(await screen.findByTestId('chain-source-card-add-logic'));
    expect(setExpression).toHaveBeenCalledWith('source("order.id")');
  });

  it('insertSourceField in builder mode sets enrichment source path and emits get(external(...), ...)', async () => {
    const user = userEvent.setup();
    const setExpression = vi.fn();
    const state = makeBuilderState({ mode: 'builder', expression: '', setExpression });
    const { ref } = renderPanelWithRef(state);

    act(() => {
      ref.current?.insertSourceField({
        path: 'customerId',
        kind: 'enrichment',
        alias: 'profile',
        expression: 'get(external("profile"), "customerId")',
      });
    });

    await user.click(await screen.findByTestId('chain-source-card-add-logic'));
    expect(setExpression).toHaveBeenCalledWith('get(external("profile"), "customerId")');
  });
});
