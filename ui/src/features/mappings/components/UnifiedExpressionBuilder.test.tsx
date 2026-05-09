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
  totalFieldCount: 3,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    {
      path: 'email',
      fieldName: 'email',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'name',
      fieldName: 'name',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'age',
      fieldName: 'age',
      type: 'number',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 0,
      children: [],
    },
  ],
};

function renderBuilder(overrides: Partial<React.ComponentProps<typeof UnifiedExpressionBuilder>> = {}) {
  const defaults: React.ComponentProps<typeof UnifiedExpressionBuilder> = {
    expression: '',
    onExpressionChange: vi.fn(),
    onApply: vi.fn(),
    selectedTargetPath: 'target.field',
    parsedSourceSchema: MOCK_SCHEMA,
  };
  return {
    ...render(<UnifiedExpressionBuilder {...defaults} {...overrides} />),
    onExpressionChange: (overrides.onExpressionChange ?? defaults.onExpressionChange) as ReturnType<typeof vi.fn>,
    onApply: (overrides.onApply ?? defaults.onApply) as ReturnType<typeof vi.fn>,
  };
}

// ---------------------------------------------------------------------------
// Mode tabs
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — mode tabs', () => {
  it('renders 3 mode tabs: Value, Conditional, Value Map', () => {
    renderBuilder();
    expect(screen.getByTestId('mode-tab-value')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-conditional')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-valueMap')).toBeInTheDocument();
  });

  it('Value tab is selected by default', () => {
    renderBuilder();
    expect(screen.getByTestId('mode-tab-value')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mode-tab-conditional')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('mode-tab-valueMap')).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking Conditional tab with empty state switches immediately', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.getByTestId('mode-tab-conditional')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('conditional-mode-placeholder')).toBeInTheDocument();
  });

  it('clicking Value Map tab with empty state switches immediately', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-valueMap'));
    expect(screen.getByTestId('mode-tab-valueMap')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('value-map-mode-placeholder')).toBeInTheDocument();
  });

  it('clicking the already-active tab does nothing', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-value'));
    expect(screen.getByTestId('mode-tab-value')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mode switch confirmation (AE-13)
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — mode switch confirmation', () => {
  async function selectSourceField(user: ReturnType<typeof userEvent.setup>, fieldPath: string) {
    const input = screen.getByTestId('source-search-input');
    await user.click(input);
    const suggestion = await screen.findByTestId(`suggestion-${fieldPath}`);
    await user.click(suggestion);
  }

  it('shows confirmation dialog when switching mode with non-empty state (AE-13)', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceField(user, 'email');
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/switching modes will reset/i)).toBeInTheDocument();
  });

  it('confirming mode switch resets state and switches mode', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceField(user, 'email');
    await user.click(screen.getByTestId('mode-tab-conditional'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-conditional')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('conditional-mode-placeholder')).toBeInTheDocument();
  });

  it('cancelling mode switch preserves state and stays on current mode', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await selectSourceField(user, 'email');
    await user.click(screen.getByTestId('mode-tab-conditional'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-value')).toHaveAttribute('aria-selected', 'true');
    // The chip should still be there
    expect(within(screen.getByTestId('selected-sources')).getByText('email')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SourceChipPicker integration
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — source chip picker', () => {
  it('renders source search input in value mode', () => {
    renderBuilder();
    expect(screen.getByTestId('source-search-input')).toBeInTheDocument();
  });

  it('shows suggestions when search input is focused', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('source-search-input'));
    expect(screen.getByTestId('source-suggestions')).toBeInTheDocument();
  });

  it('clicking a suggestion adds it as a chip', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('source-search-input'));
    await user.click(screen.getByTestId('suggestion-email'));
    expect(screen.getByTestId('selected-sources')).toBeInTheDocument();
    expect(within(screen.getByTestId('selected-sources')).getByText('email')).toBeInTheDocument();
  });

  it('clicking x on a chip removes it', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('source-search-input'));
    await user.click(screen.getByTestId('suggestion-email'));
    const removeBtn = screen.getByRole('button', { name: /remove source email/i });
    await user.click(removeBtn);
    expect(screen.queryByTestId('selected-sources')).not.toBeInTheDocument();
  });

  it('search filters suggestions by query', async () => {
    const user = userEvent.setup();
    renderBuilder();
    const input = screen.getByTestId('source-search-input');
    await user.click(input);
    await user.type(input, 'em');
    expect(screen.getByTestId('suggestion-email')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-name')).not.toBeInTheDocument();
  });

  it('fires onExpressionChange when a source is selected', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await user.click(screen.getByTestId('source-search-input'));
    await user.click(screen.getByTestId('suggestion-email'));
    expect(onExpressionChange).toHaveBeenCalledWith('source("email")');
  });
});

// ---------------------------------------------------------------------------
// Static value toggle — segmented control (T-06 / AE-14)
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — static value toggle (T-06)', () => {
  it('clicking "Static value" segment shows static value input', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('input-type-static'));
    expect(screen.getByTestId('static-value-input')).toBeInTheDocument();
    expect(screen.queryByTestId('source-search-input')).not.toBeInTheDocument();
  });

  it('clicking "Source field" segment returns to field picker', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('input-type-static'));
    await user.click(screen.getByTestId('input-type-source'));
    expect(screen.getByTestId('source-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('static-value-input')).not.toBeInTheDocument();
  });

  it('static value input generates bare literal expression (AE-14 / T-06)', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await user.click(screen.getByTestId('input-type-static'));
    const input = screen.getByRole('textbox', { name: /static string value/i });
    await user.clear(input);
    await user.type(input, 'hello');
    // Last call should be bare literal "hello"
    const calls = onExpressionChange.mock.calls;
    const lastCall = calls[calls.length - 1][0] as string;
    expect(lastCall).toBe('"hello"');
  });

  it('segmented control shows "Source field" selected by default', () => {
    renderBuilder();
    expect(screen.getByTestId('input-type-source')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('input-type-static')).toHaveAttribute('aria-selected', 'false');
  });

  it('segmented control shows "Static value" selected after toggle', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('input-type-static'));
    expect(screen.getByTestId('input-type-static')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('input-type-source')).toHaveAttribute('aria-selected', 'false');
  });
});

// ---------------------------------------------------------------------------
// Direct Copy removed (AE-15)
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — Direct Copy removed (AE-15)', () => {
  it('does not render a Direct Copy button at any point', () => {
    renderBuilder();
    expect(screen.queryByTestId('direct-copy-btn')).not.toBeInTheDocument();
  });

  it('Direct Copy button is absent even after selecting a source field', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('source-search-input'));
    await user.click(screen.getByTestId('suggestion-email'));
    expect(screen.queryByTestId('direct-copy-btn')).not.toBeInTheDocument();
  });

  it('selecting a source field with no transforms still fires onExpressionChange with source("path")', async () => {
    const user = userEvent.setup();
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    await user.click(screen.getByTestId('source-search-input'));
    await user.click(screen.getByTestId('suggestion-email'));
    expect(onExpressionChange).toHaveBeenCalledWith('source("email")');
  });
});

// ---------------------------------------------------------------------------
// Saved expression hydration
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — saved expression hydration', () => {
  it('hydrates SourceCard transform UI from saved expression in value mode', () => {
    renderBuilder({
      expression: 'upper(source("email"))',
      initialState: {
        mode: 'value',
        inputType: 'source',
        sources: [{ path: 'email', type: 'string' }],
        transforms: [],
      },
    });

    expect(screen.getByTestId('source-card')).toBeInTheDocument();
    expect(screen.getByTestId('source-card-step-badge-0')).toHaveTextContent('upper');
  });
});
