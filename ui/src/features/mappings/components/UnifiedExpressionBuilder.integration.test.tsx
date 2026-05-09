/**
 * UnifiedExpressionBuilder — T-09 integration tests
 *
 * Tests the FS-029 Source Card builder integration:
 *   - Empty state → BuilderEntryActions
 *   - Source added via SourceChipPicker → SourceCard (DirectCopy)
 *   - Source + transform → SourceWithTransform expression
 *   - Add Transformation from empty state → FunctionCall
 *   - 2 sources → ConnectorPrompt → FunctionCall
 *   - Expression generation on every state change
 *
 * Existing UnifiedExpressionBuilder tests (mode tabs, SourceChipPicker,
 * static value, Direct Copy removed) are in UnifiedExpressionBuilder.test.tsx
 * and must continue to pass unchanged.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 4,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    {
      path: 'order.firstName',
      fieldName: 'firstName',
      type: 'string',
      depth: 1,
      isArray: false,
      isRequired: true,
      parentPath: 'order',
      childCount: 0,
      children: [],
    },
    {
      path: 'order.lastName',
      fieldName: 'lastName',
      type: 'string',
      depth: 1,
      isArray: false,
      isRequired: true,
      parentPath: 'order',
      childCount: 0,
      children: [],
    },
    {
      path: 'order.amount',
      fieldName: 'amount',
      type: 'number',
      depth: 1,
      isArray: false,
      isRequired: false,
      parentPath: 'order',
      childCount: 0,
      children: [],
    },
    {
      path: 'order.createdAt',
      fieldName: 'createdAt',
      type: 'string',
      depth: 1,
      isArray: false,
      isRequired: false,
      parentPath: 'order',
      childCount: 0,
      children: [],
    },
  ],
};

function renderBuilder(overrides: Partial<React.ComponentProps<typeof UnifiedExpressionBuilder>> = {}) {
  const onExpressionChange = vi.fn();
  const defaults: React.ComponentProps<typeof UnifiedExpressionBuilder> = {
    expression: '',
    onExpressionChange,
    onApply: vi.fn(),
    selectedTargetPath: 'target.field',
    parsedSourceSchema: MOCK_SCHEMA,
  };
  render(<UnifiedExpressionBuilder {...defaults} {...overrides} onExpressionChange={overrides.onExpressionChange ?? onExpressionChange} />);
  return { onExpressionChange: overrides.onExpressionChange ?? onExpressionChange as ReturnType<typeof vi.fn> };
}

/** Selects a source field via the SourceChipPicker search input. */
async function selectSourceViaChipPicker(user: ReturnType<typeof userEvent.setup>, fieldPath: string) {
  const input = screen.getByTestId('source-search-input');
  await user.click(input);
  const suggestion = await screen.findByTestId(`suggestion-${fieldPath}`);
  await user.click(suggestion);
}

// ---------------------------------------------------------------------------
// Source Card builder area renders
// ---------------------------------------------------------------------------

describe('T-09 — Source Card builder area', () => {
  it('renders the source-card-builder container in value mode', () => {
    renderBuilder();
    expect(screen.getByTestId('source-card-builder')).toBeInTheDocument();
  });

  it('does not render source-card-builder in conditional mode', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.queryByTestId('source-card-builder')).not.toBeInTheDocument();
  });

  it('does not render source-card-builder in value map mode', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-valueMap'));
    expect(screen.queryByTestId('source-card-builder')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-01: Empty state → source → DirectCopy expression
// ---------------------------------------------------------------------------

describe('T-09 — AE-01: DirectCopy via SourceChipPicker', () => {
  it('selecting a source via SourceChipPicker renders a SourceCard', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    expect(screen.getByTestId('source-card')).toBeInTheDocument();
  });

  it('SourceCard shows the selected source path', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    expect(screen.getByTestId('source-card-path')).toHaveTextContent('order.firstName');
  });

  it('selecting a source fires onExpressionChange with source("path") (AE-01)', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await selectSourceViaChipPicker(user, 'order.firstName');
    expect(onExpressionChange).toHaveBeenCalledWith('source("order.firstName")');
  });

  it('SourceCard has a remove button', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    expect(screen.getByTestId('source-card-remove')).toBeInTheDocument();
  });

  it('removing the SourceCard clears the source card area', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-remove'));
    expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-02: Source + transform → SourceWithTransform expression
// ---------------------------------------------------------------------------

describe('T-09 — AE-02: SourceWithTransform', () => {
  it('SourceCard shows [+ Add Transformation] button', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    expect(screen.getByTestId('source-card-add-transform')).toBeInTheDocument();
  });

  it('clicking [+ Add Transformation] opens the function picker', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-add-transform'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a transform function fires onExpressionChange with wrapped expression (AE-02)', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    // Should emit upper(source("order.firstName"))
    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('upper(source("order.firstName"))');
  });

  it('transform badge appears after selecting a transform', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(screen.getByTestId('source-card-transform-badge')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-transform-badge')).toHaveTextContent('upper');
  });

  it('selecting a transform once keeps argument form visible without requiring a second click', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));

    expect(screen.getByTestId('source-card-transform-badge')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-argument-form')).toBeInTheDocument();
  });

  it('removing the transform reverts to DirectCopy expression', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    onExpressionChange.mockClear();
    await user.click(screen.getByTestId('source-card-remove-transform'));
    expect(onExpressionChange).toHaveBeenCalledWith('source("order.firstName")');
  });

  it('formatDate includes input and output format arguments after selecting dropdown values', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });

    await selectSourceViaChipPicker(user, 'order.createdAt');
    await user.click(screen.getByTestId('source-card-add-transform'));
    await user.type(screen.getByTestId('transform-function-search'), 'formatDate');
    await user.click(screen.getByTestId('transform-fn-formatDate'));

    const slot1 = screen.getByTestId('argument-slot-input-0');
    const slot2 = screen.getByTestId('argument-slot-input-1');

    await user.selectOptions(
      within(slot1).getByTestId('argument-slot-input-0-dropdown'),
      'ISO8601',
    );
    await user.selectOptions(
      within(slot2).getByTestId('argument-slot-input-1-dropdown'),
      'YYYY-MM-DD',
    );

    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('formatDate(source("order.createdAt"), "ISO8601", "YYYY-MM-DD")');
  });
});

// ---------------------------------------------------------------------------
// AE-03: Empty state → Add Transformation → FunctionCall
// ---------------------------------------------------------------------------

describe('T-09 — AE-03: Add Transformation from empty state', () => {
  it('BuilderEntryActions renders when no source is selected', () => {
    renderBuilder();
    expect(screen.getByTestId('builder-entry-actions')).toBeInTheDocument();
  });

  it('[+ Add Transformation] button is present in empty state', () => {
    renderBuilder();
    expect(screen.getByTestId('builder-add-transform-btn')).toBeInTheDocument();
  });

  it('clicking [+ Add Transformation] opens the function picker', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a function from empty state renders ArgumentForm', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(screen.getByTestId('function-call-area')).toBeInTheDocument();
    expect(screen.getByTestId('argument-form-upper')).toBeInTheDocument();
  });

  it('selecting concat from empty state renders ArgumentForm for concat', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-concat'));
    expect(screen.getByTestId('argument-form-concat')).toBeInTheDocument();
  });

  it('filling concat slots fires onExpressionChange with correct DSL (AE-03)', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-concat'));
    // Fill slot 0 (source mode) with a path
    const slot0 = screen.getByTestId('argument-slot-input-0');
    const sourceInput0 = within(slot0).getByTestId('argument-slot-input-0-source-input');
    await user.type(sourceInput0, 'firstName');
    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    // concat with one source slot filled
    expect(lastExpr).toContain('concat(');
    expect(lastExpr).toContain('source("firstName")');
  });
});

// ---------------------------------------------------------------------------
// AE-04: 2 sources → ConnectorPrompt → FunctionCall
// ---------------------------------------------------------------------------

describe('T-09 — AE-04: ConnectorPrompt with 2 sources', () => {
  it('adding 2 sources via SourceChipPicker shows ConnectorPrompt', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await selectSourceViaChipPicker(user, 'order.lastName');
    expect(screen.getByTestId('connector-prompt')).toBeInTheDocument();
  });

  it('ConnectorPrompt shows "How should these be combined?"', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await selectSourceViaChipPicker(user, 'order.lastName');
    expect(screen.getByTestId('connector-prompt-label')).toHaveTextContent(
      'How should these be combined?',
    );
  });

  it('ConnectorPrompt shows 2 source cards', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await selectSourceViaChipPicker(user, 'order.lastName');
    expect(screen.getAllByTestId('source-card')).toHaveLength(2);
  });

  it('selecting concat from ConnectorPrompt renders ArgumentForm with pre-filled source slots', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await selectSourceViaChipPicker(user, 'order.lastName');
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'concat');
    expect(screen.getByTestId('function-call-area')).toBeInTheDocument();
    expect(screen.getByTestId('argument-form-concat')).toBeInTheDocument();
  });

  it('selecting concat from ConnectorPrompt fires onExpressionChange with pre-filled sources (AE-04)', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await selectSourceViaChipPicker(user, 'order.firstName');
    await selectSourceViaChipPicker(user, 'order.lastName');
    await user.selectOptions(screen.getByTestId('connector-prompt-select'), 'concat');
    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('concat(source("order.firstName"), source("order.lastName"))');
  });
});

// ---------------------------------------------------------------------------
// Mode switch confirmation with SC state
// ---------------------------------------------------------------------------

describe('T-09 — mode switch confirmation with Source Card state', () => {
  it('shows confirmation dialog when switching mode after selecting a source', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('shows confirmation dialog when switching mode after selecting a function', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('confirming mode switch clears Source Card state', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceViaChipPicker(user, 'order.firstName');
    await user.click(screen.getByTestId('mode-tab-conditional'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-conditional')).toHaveAttribute('aria-selected', 'true');
  });
});

// ---------------------------------------------------------------------------
// Static mode — SC builder hidden
// ---------------------------------------------------------------------------

describe('T-09 — static mode hides Source Card builder', () => {
  it('switching to static mode hides the source-card-builder', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('input-type-static'));
    // source-card-builder container should not be visible (hidden by !isStaticMode)
    expect(screen.queryByTestId('source-card-builder')).not.toBeInTheDocument();
  });

  it('switching back to source mode shows source-card-builder', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('input-type-static'));
    await user.click(screen.getByTestId('input-type-source'));
    expect(screen.getByTestId('source-card-builder')).toBeInTheDocument();
  });
});
