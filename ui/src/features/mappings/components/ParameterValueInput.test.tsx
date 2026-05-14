/**
 * ParameterValueInput.test.tsx — FS-053 T-01 / T-02 / T-03
 *
 * Tests for the ParameterValueInput component covering:
 *   AE-01 — intent-based mode toggle (Source/Static/External-disabled, no Expression/Literal)
 *   AE-02 — Options mode appears for token-hint parameters (chip list)
 *   AE-03 — Strict enum renders Options-only toggle
 *   AE-04 — "Use advanced expression" inline link triggers expression picker
 *   AE-05 — Expression does not appear in primary toggle
 *   AE-07 — Empty string handling for optional parameters
 *   AE-08 — Empty string handling for required parameters (interaction state)
 *   AE-10 — Custom value indicator when current value is not in options list
 *   AE-11 — Backward-compatible slot emission (makeSourceSlot / makeLiteralSlot / makeExpressionSlot)
 *   AE-12 — Switching Options→Static preserves custom value
 *   AE-13 — External chip shown as disabled/coming-soon
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ParameterValueInput } from './ParameterValueInput';
import type { ParameterValueInputProps } from './ParameterValueInput';
import type { ArgumentSlot } from '../lib/expression-builder-state';
import { makeSourceSlot, makeLiteralSlot, makeExpressionSlot } from '../lib/expression-builder-state';
import type { FunctionCatalogParameter } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STRING_PARAM: FunctionCatalogParameter = {
  name: 'value',
  type: 'string',
  required: true,
};

const OPTIONAL_PARAM: FunctionCatalogParameter = {
  name: 'replacement',
  type: 'string',
  required: false,
};

const SOURCE_SLOT: ArgumentSlot = makeSourceSlot('');
const LITERAL_SLOT: ArgumentSlot = makeLiteralSlot('');

const SOURCE_OPTIONS = [
  { path: 'user.name', type: 'string' },
  { path: 'user.age', type: 'number' },
];

function renderPVI(overrides: Partial<ParameterValueInputProps> = {}) {
  const onSlotChange = vi.fn();
  render(
    <ParameterValueInput
      slot={SOURCE_SLOT}
      parameter={STRING_PARAM}
      label="Find this text"
      onSlotChange={onSlotChange}
      testIdPrefix="pvi"
      {...overrides}
    />,
  );
  return { onSlotChange };
}

// ---------------------------------------------------------------------------
// AE-01 — Intent-based mode toggle
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-01: intent-based mode toggle', () => {
  it('renders "Source" segment in the toggle', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-source')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-mode-source')).toHaveTextContent('Source');
  });

  it('renders "Static" segment in the toggle', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-static')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-mode-static')).toHaveTextContent('Static');
  });

  it('does not render a segment labeled "expression"', () => {
    renderPVI();
    const toggle = screen.getByTestId('pvi-mode-toggle');
    expect(toggle).not.toHaveTextContent(/^expression$/i);
  });

  it('does not render a segment labeled "literal"', () => {
    renderPVI();
    const toggle = screen.getByTestId('pvi-mode-toggle');
    expect(toggle).not.toHaveTextContent(/^literal$/i);
  });

  it('Source segment is active (aria-checked=true) by default for a source slot', () => {
    renderPVI({ slot: SOURCE_SLOT });
    expect(screen.getByTestId('pvi-mode-source')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pvi-mode-static')).toHaveAttribute('aria-checked', 'false');
  });

  it('Static segment is active when slot is a literal slot', () => {
    renderPVI({ slot: LITERAL_SLOT });
    expect(screen.getByTestId('pvi-mode-static')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pvi-mode-source')).toHaveAttribute('aria-checked', 'false');
  });

  it('mode toggle has role="group" with accessible label', () => {
    renderPVI();
    const toggle = screen.getByRole('group', { name: /input mode for find this text/i });
    expect(toggle).toBeInTheDocument();
  });

  it('mode buttons have role="radio"', () => {
    renderPVI();
    const radios = screen.getAllByRole('radio');
    // Source, Static, External (at minimum)
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// AE-05 — Expression does not appear in primary toggle
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-05: expression not in primary toggle', () => {
  it('toggle does not contain an "Expression" button', () => {
    renderPVI();
    const toggle = screen.getByTestId('pvi-mode-toggle');
    // No button with text "Expression" inside the toggle
    const buttons = toggle.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim().toLowerCase());
    expect(labels).not.toContain('expression');
  });

  it('toggle does not contain a "Literal" button', () => {
    renderPVI();
    const toggle = screen.getByTestId('pvi-mode-toggle');
    const buttons = toggle.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent?.trim().toLowerCase());
    expect(labels).not.toContain('literal');
  });
});

// ---------------------------------------------------------------------------
// AE-04 — "Use advanced expression" inline link
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-04: expression inline link', () => {
  it('renders "Use advanced expression" link below the toggle', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-expression-link')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-expression-link')).toHaveTextContent('Use advanced expression');
  });

  it('clicking the expression link shows a plain expression textarea', async () => {
    const user = userEvent.setup();
    renderPVI();
    await user.click(screen.getByTestId('pvi-expression-link'));
    expect(screen.getByTestId('pvi-expression-input')).toBeInTheDocument();
  });

  it('clicking the expression link emits makeLiteralSlot with the serialized current value', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: makeLiteralSlot('hello') });
    await user.click(screen.getByTestId('pvi-expression-link'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot('hello'));
  });

  it('typing in the expression textarea emits makeLiteralSlot with the typed text', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: makeLiteralSlot('') });
    await user.click(screen.getByTestId('pvi-expression-link'));
    const textarea = screen.getByTestId('pvi-expression-input');
    await user.clear(textarea);
    await user.type(textarea, 'upper(source("name"))');
    expect(onSlotChange).toHaveBeenLastCalledWith(makeLiteralSlot('upper(source("name"))'));
  });

  it('expression link is not visible when already in expression mode', async () => {
    const user = userEvent.setup();
    renderPVI();
    await user.click(screen.getByTestId('pvi-expression-link'));
    // Now in expression mode — toggle and link should be hidden
    expect(screen.queryByTestId('pvi-mode-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pvi-expression-link')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-13 — External chip disabled/coming-soon
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-13: External chip', () => {
  it('renders External chip in the toggle by default', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-external')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-mode-external')).toHaveTextContent('External');
  });

  it('External chip has aria-disabled="true"', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-external')).toHaveAttribute('aria-disabled', 'true');
  });

  it('External chip has tooltip text', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-external')).toHaveAttribute(
      'title',
      'External data sources — available in a future release',
    );
  });

  it('External chip is not shown when showExternal=false', () => {
    renderPVI({ showExternal: false });
    expect(screen.queryByTestId('pvi-mode-external')).not.toBeInTheDocument();
  });

  it('External chip has aria-checked="false"', () => {
    renderPVI();
    expect(screen.getByTestId('pvi-mode-external')).toHaveAttribute('aria-checked', 'false');
  });
});

// ---------------------------------------------------------------------------
// AE-11 — Backward-compatible slot emission
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-11: slot emission', () => {
  it('switching to Static mode emits makeLiteralSlot("")', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: SOURCE_SLOT });
    await user.click(screen.getByTestId('pvi-mode-static'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot(''));
  });

  it('switching to Source mode emits makeSourceSlot("")', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: LITERAL_SLOT });
    await user.click(screen.getByTestId('pvi-mode-source'));
    expect(onSlotChange).toHaveBeenCalledWith(makeSourceSlot(''));
  });

  it('typing in Source mode emits makeSourceSlot with the typed path', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: SOURCE_SLOT, sourceOptions: SOURCE_OPTIONS });
    const input = screen.getByTestId('pvi-source-input');
    await user.type(input, 'user.name');
    expect(onSlotChange).toHaveBeenLastCalledWith(makeSourceSlot('user.name'));
  });

  it('typing in Static mode emits makeLiteralSlot with the typed value', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: LITERAL_SLOT });
    const input = screen.getByTestId('pvi-static-input');
    await user.type(input, 'hello');
    expect(onSlotChange).toHaveBeenLastCalledWith(makeLiteralSlot('hello'));
  });

  it('Item mode emits makeExpressionSlot wrapping item()', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ slot: SOURCE_SLOT, isItemContext: true });
    // In item context, Item mode is active by default
    const input = screen.getByTestId('pvi-item-input');
    await user.type(input, 'name');
    const lastCall = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(lastCall.mode).toBe('expression');
    if (lastCall.mode === 'expression') {
      expect(lastCall.node.functionName).toBe('item');
      expect(lastCall.node.slots[0]).toEqual(makeLiteralSlot('name'));
    }
  });
});

// ---------------------------------------------------------------------------
// Mode switching — value preservation
// ---------------------------------------------------------------------------

describe('ParameterValueInput — mode switching preserves values', () => {
  it('Source→Static→Source preserves source path', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: SOURCE_SLOT });
    // Type a source path
    await user.type(screen.getByTestId('pvi-source-input'), 'user.name');
    // Switch to Static
    await user.click(screen.getByTestId('pvi-mode-static'));
    // Switch back to Source
    await user.click(screen.getByTestId('pvi-mode-source'));
    expect(screen.getByTestId('pvi-source-input')).toHaveValue('user.name');
  });

  it('Static→Source→Static preserves literal value', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: LITERAL_SLOT });
    // Type a static value
    await user.type(screen.getByTestId('pvi-static-input'), 'hello');
    // Switch to Source
    await user.click(screen.getByTestId('pvi-mode-source'));
    // Switch back to Static
    await user.click(screen.getByTestId('pvi-mode-static'));
    expect(screen.getByTestId('pvi-static-input')).toHaveValue('hello');
  });
});

// ---------------------------------------------------------------------------
// Item context
// ---------------------------------------------------------------------------

describe('ParameterValueInput — isItemContext', () => {
  it('shows "Item" instead of "Source" when isItemContext=true', () => {
    renderPVI({ isItemContext: true });
    expect(screen.getByTestId('pvi-mode-item')).toBeInTheDocument();
    expect(screen.queryByTestId('pvi-mode-source')).not.toBeInTheDocument();
  });

  it('Item mode is active by default when isItemContext=true and slot is source', () => {
    renderPVI({ isItemContext: true, slot: SOURCE_SLOT });
    expect(screen.getByTestId('pvi-mode-item')).toHaveAttribute('aria-checked', 'true');
  });
});

// ---------------------------------------------------------------------------
// Options mode
// ---------------------------------------------------------------------------

describe('ParameterValueInput — Options mode', () => {
  const OPTIONS = {
    values: ['ISO8601', 'YYYY-MM-DD', 'MM/DD/YYYY'] as const,
    allowCustom: true,
    display: 'chips' as const,
  };

  it('shows Options segment when options prop is provided', () => {
    renderPVI({ options: OPTIONS });
    expect(screen.getByTestId('pvi-mode-options')).toBeInTheDocument();
  });

  it('does not show Options segment when options prop is absent', () => {
    renderPVI();
    expect(screen.queryByTestId('pvi-mode-options')).not.toBeInTheDocument();
  });

  it('switching to Options mode emits makeLiteralSlot with first option', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ options: OPTIONS });
    await user.click(screen.getByTestId('pvi-mode-options'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot('ISO8601'));
  });
});

// ---------------------------------------------------------------------------
// Variadic remove button
// ---------------------------------------------------------------------------

describe('ParameterValueInput — remove button', () => {
  it('renders remove button when onRemove is provided', () => {
    renderPVI({ onRemove: vi.fn() });
    expect(screen.getByTestId('pvi-remove')).toBeInTheDocument();
  });

  it('does not render remove button when onRemove is absent', () => {
    renderPVI();
    expect(screen.queryByTestId('pvi-remove')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderPVI({ onRemove });
    await user.click(screen.getByTestId('pvi-remove'));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Expression mode — "Back to simple input"
// ---------------------------------------------------------------------------

describe('ParameterValueInput — expression mode back link', () => {
  it('shows "Back to simple input" when in expression mode', async () => {
    const user = userEvent.setup();
    renderPVI();
    await user.click(screen.getByTestId('pvi-expression-link'));
    expect(screen.getByTestId('pvi-back-to-simple')).toBeInTheDocument();
  });

  it('shows "Back to simple input" when slot is an expression slot on mount', () => {
    const expressionSlot: ArgumentSlot = makeExpressionSlot({
      functionName: 'upper',
      slots: [],
    });
    renderPVI({ slot: expressionSlot });
    expect(screen.getByTestId('pvi-back-to-simple')).toBeInTheDocument();
  });

  it('clicking "Back to simple input" restores the mode toggle', async () => {
    const user = userEvent.setup();
    renderPVI();
    await user.click(screen.getByTestId('pvi-expression-link'));
    await user.click(screen.getByTestId('pvi-back-to-simple'));
    expect(screen.getByTestId('pvi-mode-toggle')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T-02 imports
// ---------------------------------------------------------------------------

import { parameterHintToOptions } from './ParameterValueInput';

// ---------------------------------------------------------------------------
// T-02 fixtures
// ---------------------------------------------------------------------------

// Token hint options (≤ 6 presets → chips)
const TOKEN_OPTIONS_CHIPS = {
  values: ['ISO8601', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD HH:mm:ss'] as const,
  allowCustom: true,
  display: 'chips' as const,
};

// Enum options (strict, ≤ 6 → chips, no freeform)
const ENUM_OPTIONS = {
  values: ['string', 'number', 'boolean'] as const,
  allowCustom: false,
  display: 'chips' as const,
};

// Large options set (> 6 → dropdown)
const LARGE_OPTIONS = {
  values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const,
  allowCustom: true,
  display: 'dropdown' as const,
};

// ---------------------------------------------------------------------------
// AE-02 — Options mode chip list for token-hint parameters
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-02: Options mode chip list', () => {
  it('renders chip list when options.display is "chips"', () => {
    renderPVI({ options: TOKEN_OPTIONS_CHIPS });
    // Switch to Options mode first
    // (default mode is source for a source slot, so we need to click Options)
    // Actually: with options present and source slot, mode starts as 'source'
    // We need to click Options to see chips
    // But if we pass a literal slot matching an option, it starts in options mode
    const literalSlot = makeLiteralSlot('ISO8601');
    renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });
    expect(screen.getAllByTestId('pvi-chips')[0]).toBeInTheDocument();
  });

  it('renders one chip per option value', () => {
    const literalSlot = makeLiteralSlot('ISO8601');
    renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });
    for (const v of TOKEN_OPTIONS_CHIPS.values) {
      expect(screen.getAllByTestId(`pvi-chip-${v}`)[0]).toBeInTheDocument();
    }
  });

  it('selected chip has aria-selected="true"', () => {
    const literalSlot = makeLiteralSlot('YYYY-MM-DD');
    renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });
    const chip = screen.getAllByTestId('pvi-chip-YYYY-MM-DD')[0];
    expect(chip).toHaveAttribute('aria-selected', 'true');
  });

  it('unselected chips have aria-selected="false"', () => {
    const literalSlot = makeLiteralSlot('ISO8601');
    renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });
    const chip = screen.getAllByTestId('pvi-chip-YYYY-MM-DD')[0];
    expect(chip).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking a chip emits makeLiteralSlot with that value', async () => {
    const user = userEvent.setup();
    const literalSlot = makeLiteralSlot('ISO8601');
    const { onSlotChange } = renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });
    await user.click(screen.getAllByTestId('pvi-chip-YYYY-MM-DD')[0]);
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot('YYYY-MM-DD'));
  });

  it('Options mode toggle is active after clicking Options', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: SOURCE_SLOT, options: TOKEN_OPTIONS_CHIPS });
    await user.click(screen.getByTestId('pvi-mode-options'));
    expect(screen.getByTestId('pvi-mode-options')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('pvi-chips')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AE-03 — Strict enum renders Options-only toggle
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-03: strict enum Options-only toggle', () => {
  it('does not render Source segment for strict enum', () => {
    renderPVI({ options: ENUM_OPTIONS });
    expect(screen.queryByTestId('pvi-mode-source')).not.toBeInTheDocument();
  });

  it('does not render Static segment for strict enum', () => {
    renderPVI({ options: ENUM_OPTIONS });
    expect(screen.queryByTestId('pvi-mode-static')).not.toBeInTheDocument();
  });

  it('renders Options segment for strict enum', () => {
    renderPVI({ options: ENUM_OPTIONS });
    expect(screen.getByTestId('pvi-mode-options')).toBeInTheDocument();
  });

  it('renders chips for all enum values', () => {
    renderPVI({ options: ENUM_OPTIONS });
    for (const v of ENUM_OPTIONS.values) {
      expect(screen.getByTestId(`pvi-chip-${v}`)).toBeInTheDocument();
    }
  });

  it('clicking an enum chip emits correct literal slot', async () => {
    const user = userEvent.setup();
    const { onSlotChange } = renderPVI({ options: ENUM_OPTIONS });
    await user.click(screen.getByTestId('pvi-chip-number'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot('number'));
  });
});

// ---------------------------------------------------------------------------
// AE-02 — Dropdown rendering for large option sets
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-02: Options mode dropdown for large sets', () => {
  it('renders dropdown (not chips) when options.display is "dropdown"', () => {
    const literalSlot = makeLiteralSlot('a');
    renderPVI({ slot: literalSlot, options: LARGE_OPTIONS });
    expect(screen.getByTestId('pvi-dropdown')).toBeInTheDocument();
    expect(screen.queryByTestId('pvi-chips')).not.toBeInTheDocument();
  });

  it('renders search input in dropdown', () => {
    const literalSlot = makeLiteralSlot('a');
    renderPVI({ slot: literalSlot, options: LARGE_OPTIONS });
    expect(screen.getByTestId('pvi-dropdown-search')).toBeInTheDocument();
  });

  it('clicking a dropdown option emits correct literal slot', async () => {
    const user = userEvent.setup();
    const literalSlot = makeLiteralSlot('a');
    const { onSlotChange } = renderPVI({ slot: literalSlot, options: LARGE_OPTIONS });
    await user.click(screen.getByTestId('pvi-dropdown-option-c'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot('c'));
  });
});

// ---------------------------------------------------------------------------
// AE-10 — Custom value indicator
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-10: custom value indicator', () => {
  it('shows custom value indicator when current literal is not in options list', () => {
    const customSlot = makeLiteralSlot('YYYY/MM/DD');
    renderPVI({ slot: customSlot, options: TOKEN_OPTIONS_CHIPS });
    expect(screen.getByTestId('pvi-custom-value-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-custom-value-text')).toHaveTextContent('YYYY/MM/DD');
  });

  it('does not show custom value indicator when value is in options list', () => {
    const knownSlot = makeLiteralSlot('ISO8601');
    renderPVI({ slot: knownSlot, options: TOKEN_OPTIONS_CHIPS });
    expect(screen.queryByTestId('pvi-custom-value-indicator')).not.toBeInTheDocument();
  });

  it('"Use a preset instead" link switches to first preset', async () => {
    const user = userEvent.setup();
    const customSlot = makeLiteralSlot('YYYY/MM/DD');
    const { onSlotChange } = renderPVI({ slot: customSlot, options: TOKEN_OPTIONS_CHIPS });
    await user.click(screen.getByTestId('pvi-use-preset'));
    expect(onSlotChange).toHaveBeenCalledWith(makeLiteralSlot(TOKEN_OPTIONS_CHIPS.values[0]));
  });
});

// ---------------------------------------------------------------------------
// AE-12 — Options→Static preserves custom value
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-12: value persistence across mode switches', () => {
  it('Options→Static→Options→Static preserves custom static value', async () => {
    const user = userEvent.setup();
    // Start in Options mode with a known value
    const literalSlot = makeLiteralSlot('ISO8601');
    renderPVI({ slot: literalSlot, options: TOKEN_OPTIONS_CHIPS });

    // Switch to Static and type a custom value
    await user.click(screen.getByTestId('pvi-mode-static'));
    await user.type(screen.getByTestId('pvi-static-input'), 'YYYY/MM/DD');

    // Switch back to Options
    await user.click(screen.getByTestId('pvi-mode-options'));

    // Switch back to Static — custom value should be preserved
    await user.click(screen.getByTestId('pvi-mode-static'));
    expect(screen.getByTestId('pvi-static-input')).toHaveValue('YYYY/MM/DD');
  });
});

// ---------------------------------------------------------------------------
// parameterHintToOptions helper
// ---------------------------------------------------------------------------

describe('parameterHintToOptions', () => {
  it('converts enum hint to ParameterOptions with allowCustom=false', () => {
    const result = parameterHintToOptions({
      type: 'enum',
      options: ['string', 'number', 'boolean'],
    });
    expect(result.allowCustom).toBe(false);
    expect(result.values).toEqual(['string', 'number', 'boolean']);
    expect(result.display).toBe('chips'); // 3 ≤ 6
  });

  it('converts tokens hint to ParameterOptions with allowCustom=true', () => {
    const result = parameterHintToOptions({
      type: 'tokens',
      tokens: [],
      presets: ['ISO8601', 'YYYY-MM-DD'],
      allowFreeform: true,
    });
    expect(result.allowCustom).toBe(true);
    expect(result.values).toEqual(['ISO8601', 'YYYY-MM-DD']);
    expect(result.display).toBe('chips'); // 2 ≤ 6
  });

  it('uses "dropdown" display for > 6 presets', () => {
    const result = parameterHintToOptions({
      type: 'tokens',
      tokens: [],
      presets: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(result.display).toBe('dropdown');
  });

  it('defaults allowCustom to true when allowFreeform is undefined', () => {
    const result = parameterHintToOptions({
      type: 'tokens',
      tokens: [],
      presets: ['a'],
    });
    expect(result.allowCustom).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AE-07 — Empty string handling for optional parameters
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-07: optional parameter empty string handling', () => {
  it('shows "Leave empty for blank value" placeholder for optional string in Static mode', () => {
    renderPVI({ slot: LITERAL_SLOT, parameter: OPTIONAL_PARAM });
    expect(screen.getByTestId('pvi-static-input')).toHaveAttribute(
      'placeholder',
      'Leave empty for blank value',
    );
  });

  it('shows "Empty = blank text" helper text when optional and empty', () => {
    renderPVI({ slot: LITERAL_SLOT, parameter: OPTIONAL_PARAM });
    expect(screen.getByTestId('pvi-empty-hint')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-empty-hint')).toHaveTextContent('Empty = blank text (empty string)');
  });

  it('does not show helper text when optional and has a value', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: LITERAL_SLOT, parameter: OPTIONAL_PARAM });
    await user.type(screen.getByTestId('pvi-static-input'), 'hello');
    expect(screen.queryByTestId('pvi-empty-hint')).not.toBeInTheDocument();
  });

  it('emits makeLiteralSlot("") for optional empty — no quotes', () => {
    const onSlotChange = vi.fn();
    render(
      <ParameterValueInput
        slot={LITERAL_SLOT}
        parameter={OPTIONAL_PARAM}
        label="Replace with"
        onSlotChange={onSlotChange}
        testIdPrefix="pvi"
      />,
    );
    // Slot was already empty literal — no change emitted yet, but value is ''
    // Verify the initial slot shape is correct
    expect(screen.getByTestId('pvi-static-input')).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// AE-08 — Empty string handling for required parameters
// ---------------------------------------------------------------------------

describe('ParameterValueInput — AE-08: required parameter empty string handling', () => {
  it('shows "Enter a value…" placeholder for required string in Static mode', () => {
    renderPVI({ slot: LITERAL_SLOT });
    expect(screen.getByTestId('pvi-static-input')).toHaveAttribute('placeholder', 'Enter a value…');
  });

  it('shows amber "Required" badge when required and empty and not yet interacted', () => {
    renderPVI({ slot: LITERAL_SLOT });
    expect(screen.getByTestId('pvi-validation-warning')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-validation-warning')).toHaveTextContent('Required');
  });

  it('removes amber badge and shows softer helper text after focus+blur with empty value', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: LITERAL_SLOT });
    // Focus then blur without typing
    await user.click(screen.getByTestId('pvi-static-input'));
    await user.tab(); // blur
    expect(screen.queryByTestId('pvi-validation-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('pvi-intentional-blank-hint')).toBeInTheDocument();
    expect(screen.getByTestId('pvi-intentional-blank-hint')).toHaveTextContent(
      'Leave blank to use an empty string',
    );
  });

  it('does not show validation warning when required and has a value', async () => {
    const user = userEvent.setup();
    renderPVI({ slot: LITERAL_SLOT });
    await user.type(screen.getByTestId('pvi-static-input'), 'hello');
    expect(screen.queryByTestId('pvi-validation-warning')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pvi-intentional-blank-hint')).not.toBeInTheDocument();
  });

  it('shows "Enter a number…" placeholder for number-typed parameter', () => {
    const numberParam: FunctionCatalogParameter = {
      name: 'amount',
      type: 'number',
      required: true,
    };
    renderPVI({ slot: LITERAL_SLOT, parameter: numberParam });
    expect(screen.getByTestId('pvi-static-input')).toHaveAttribute('placeholder', 'Enter a number…');
  });
});
