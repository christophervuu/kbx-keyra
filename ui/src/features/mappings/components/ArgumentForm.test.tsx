import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ArgumentForm } from './ArgumentForm';
import { ArgumentSlotInput } from './ArgumentSlotInput';
import type { ArgumentSlot, InlineTransform } from '../lib/expression-builder-state';
import {
  makeExpressionSlot,
  makeSourceSlot,
  makeLiteralSlot,
  makeSourceSlotWithTransform,
} from '../lib/expression-builder-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(
  functionName: string,
  slots: ArgumentSlot[],
  onSlotsChange = vi.fn(),
) {
  render(
    <ArgumentForm
      functionName={functionName}
      slots={slots}
      onSlotsChange={onSlotsChange}
    />,
  );
  return { onSlotsChange };
}

// ---------------------------------------------------------------------------
// ArgumentForm — basic rendering
// ---------------------------------------------------------------------------

describe('ArgumentForm — rendering', () => {
  it('renders the function name header', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-function-name')).toHaveTextContent('upper');
  });

  it('renders unknown function message for unrecognized function', () => {
    renderForm('notAFunction', []);
    expect(screen.getByTestId('argument-form-unknown-function')).toBeInTheDocument();
    expect(screen.getByTestId('argument-form-unknown-function')).toHaveTextContent('notAFunction');
  });

  it('renders the argument-form container with function name testid', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-upper')).toBeInTheDocument();
  });

  it('can hide the function header when embedded in another function card', () => {
    render(
      <ArgumentForm
        functionName="upper"
        slots={[makeSourceSlot('')]}
        onSlotsChange={vi.fn()}
        hideFunctionHeader
      />,
    );

    expect(screen.queryByTestId('argument-form-function-name')).not.toBeInTheDocument();
  });
});

describe('ArgumentForm — filter/find condition editor', () => {
  it('renders condition editor for filter second parameter without slot mode toggle', () => {
    renderForm('filter', [makeSourceSlot('lineItemApprovals'), makeSourceSlot('')]);

    expect(screen.getByTestId('argument-slot-input-1-condition-editor')).toBeInTheDocument();
    expect(screen.getByTestId('condition-row-1')).toBeInTheDocument();
    // ParameterValueInput mode toggle is not rendered for condition editor slot
    expect(screen.queryByTestId('argument-slot-input-1-mode-toggle')).not.toBeInTheDocument();
  });

  it('normalizes condition field selection to item-relative path for root array sources', async () => {
    const user = userEvent.setup();
    const onSlotsChange = vi.fn();

    render(
      <ArgumentForm
        functionName="filter"
        slots={[makeSourceSlot('Shipment.Trackings'), makeSourceSlot('')]}
        onSlotsChange={onSlotsChange}
        sourceOptions={[
          { path: 'Shipment.Trackings.TrackingType', type: 'string' },
          { path: 'Shipment.Trackings.TrackingNumber', type: 'string' },
        ]}
      />,
    );

    await user.click(screen.getByTestId('condition-left-1-field-input'));
    await user.click(screen.getByTestId('condition-left-1-suggestion-TrackingType'));

    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[1]).toEqual(
      makeExpressionSlot({
        functionName: 'item',
        slots: [makeLiteralSlot('TrackingType')],
      }),
    );
  });

  it('normalizes manually-entered absolute condition field path to item-relative path', async () => {
    const onSlotsChange = vi.fn();

    render(
      <ArgumentForm
        functionName="find"
        slots={[makeSourceSlot('Shipment.Trackings'), makeSourceSlot('')]}
        onSlotsChange={onSlotsChange}
      />,
    );

    const fieldInput = screen.getByTestId('condition-left-1-field-input');
    fireEvent.change(fieldInput, { target: { value: 'Shipment.Trackings.TrackingType' } });

    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[1]).toEqual(
      makeExpressionSlot({
        functionName: 'item',
        slots: [makeLiteralSlot('TrackingType')],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — formatDate (AE-02): 3 slots
// ---------------------------------------------------------------------------

describe('ArgumentForm — formatDate (AE-02)', () => {
  it('with parameterOffset=1, hides value slot and renders only additional params', () => {
    render(
      <ArgumentForm
        functionName="formatDate"
        slots={[]}
        parameterOffset={1}
        onSlotsChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Date field')).not.toBeInTheDocument();
    // ParameterValueInput uses data-testid=`${testIdPrefix}-label`
    expect(screen.getByTestId('argument-slot-input-0-label')).toHaveTextContent('Current date standard');
    expect(screen.getByTestId('argument-slot-input-1-label')).toHaveTextContent('Output date format');
  });

  it('with parameterOffset=1, round renders optional decimals slot', () => {
    render(
      <ArgumentForm
        functionName="round"
        slots={[]}
        parameterOffset={1}
        onSlotsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('argument-slot-input-0-label')).toHaveTextContent('Decimal places');
  });

  it('defaults value slot to source mode and format slots to options mode when slots are missing', () => {
    renderForm('formatDate', []);
    // Slot 0 (value): source mode active
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'true');
    // Slots 1 & 2 (inputFormat, outputFormat): have PARAMETER_HINTS → Options mode active
    expect(screen.getByTestId('argument-slot-input-1-mode-options')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-2-mode-options')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders 3 slots for formatDate', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot('order.createdAt'),
      makeLiteralSlot('ISO8601'),
      makeLiteralSlot('YYYY-MM-DD'),
    ];
    renderForm('formatDate', slots);
    const slotsContainer = screen.getByTestId('argument-form-slots');
    expect(within(slotsContainer).getAllByTestId(/-label$/)).toHaveLength(3);
  });

  it('renders parameter name labels for formatDate', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot(''),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    expect(screen.getByTestId('argument-slot-input-0-label')).toHaveTextContent('Date field');
    expect(screen.getByTestId('argument-slot-input-1-label')).toHaveTextContent('Current date standard');
    expect(screen.getByTestId('argument-slot-input-2-label')).toHaveTextContent('Output date format');
  });

  it('renders type badges for formatDate params', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot(''),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    expect(screen.getByTestId('argument-slot-input-0-type-badge')).toHaveTextContent('string');
    expect(screen.getByTestId('argument-slot-input-1-type-badge')).toHaveTextContent('string');
    expect(screen.getByTestId('argument-slot-input-2-type-badge')).toHaveTextContent('string');
  });

  it('renders Options mode for inputFormat (PARAMETER_HINTS)', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot('ISO8601'),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    // Slot 1 (inputFormat) should be in options mode with chips
    expect(screen.getByTestId('argument-slot-input-1-mode-options')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-1-mode-options')).toHaveAttribute('aria-checked', 'true');
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — cast (AE-03): strict enum Options-only
// ---------------------------------------------------------------------------

describe('ArgumentForm — cast (AE-03)', () => {
  it('renders 2 slots for cast', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    expect(within(screen.getByTestId('argument-form-slots')).getAllByTestId(/-label$/)).toHaveLength(2);
  });

  it('slot 1 is targetType with string type badge', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    expect(screen.getByTestId('argument-slot-input-1-label')).toHaveTextContent('Convert to type');
    expect(screen.getByTestId('argument-slot-input-1-type-badge')).toHaveTextContent('string');
  });

  it('AE-03: targetType slot shows Options-only toggle (strict enum)', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    // Strict enum: no Source, no Static — only Options
    expect(screen.queryByTestId('argument-slot-input-1-mode-source')).not.toBeInTheDocument();
    expect(screen.queryByTestId('argument-slot-input-1-mode-static')).not.toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-1-mode-options')).toBeInTheDocument();
  });

  it('AE-03: targetType chip list shows string/number/boolean', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('string')];
    renderForm('cast', slots);
    expect(screen.getByTestId('argument-slot-input-1-chip-string')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-1-chip-number')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-1-chip-boolean')).toBeInTheDocument();
  });

  it('AE-03: clicking a chip emits correct literal slot', async () => {
    const user = userEvent.setup();
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('string')];
    const { onSlotsChange } = renderForm('cast', slots);
    await user.click(screen.getByTestId('argument-slot-input-1-chip-number'));
    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[1]).toEqual(makeLiteralSlot('number'));
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — concat (AE-03): variadic [+ Add value]
// ---------------------------------------------------------------------------

describe('ArgumentForm — concat (variadic)', () => {
  it('renders [+ Add value] button for concat (variadic)', () => {
    renderForm('concat', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-add-value')).toBeInTheDocument();
  });

  it('does not render [+ Add value] for non-variadic functions', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.queryByTestId('argument-form-add-value')).not.toBeInTheDocument();
  });

  it('clicking [+ Add value] calls onSlotsChange with an extra slot', async () => {
    const user = userEvent.setup();
    const initialSlots: ArgumentSlot[] = [makeSourceSlot('firstName'), makeLiteralSlot(' ')];
    const { onSlotsChange } = renderForm('concat', initialSlots);
    await user.click(screen.getByTestId('argument-form-add-value'));
    expect(onSlotsChange).toHaveBeenCalledOnce();
    const emitted = onSlotsChange.mock.calls[0][0] as ArgumentSlot[];
    expect(emitted).toHaveLength(3);
  });

  it('can build concat(source("firstName"), " ", source("lastName")) state', async () => {
    const user = userEvent.setup();
    const onSlotsChange = vi.fn();
    const initialSlots: ArgumentSlot[] = [
      makeSourceSlot('firstName'),
      makeLiteralSlot(' '),
    ];
    render(
      <ArgumentForm
        functionName="concat"
        slots={initialSlots}
        onSlotsChange={onSlotsChange}
      />,
    );
    await user.click(screen.getByTestId('argument-form-add-value'));
    const emitted = onSlotsChange.mock.calls[0][0] as ArgumentSlot[];
    expect(emitted).toHaveLength(3);
    expect(emitted[0]).toEqual(makeSourceSlot('firstName'));
    expect(emitted[1]).toEqual(makeLiteralSlot(' '));
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — slot change propagation
// ---------------------------------------------------------------------------

describe('ArgumentForm — slot change propagation', () => {
  it('changing a slot value calls onSlotsChange with updated slots', async () => {
    const user = userEvent.setup();
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    const { onSlotsChange } = renderForm('formatDate', slots);
    // Type in the source input of slot 0
    const slot0 = screen.getByTestId('argument-slot-input-0');
    const sourceInput = within(slot0).getByTestId('argument-slot-input-0-source-input');
    await user.type(sourceInput, 'order.date');
    expect(onSlotsChange).toHaveBeenCalled();
    const lastCall = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(lastCall[0]).toEqual(expect.objectContaining({ mode: 'source', path: 'order.date' }));
  });

  it('persists edits for formatDate default-visible options slots when initial slots are missing', async () => {
    const user = userEvent.setup();

    const updates: ArgumentSlot[][] = [];

    function ControlledHarness() {
      const [currentSlots, setCurrentSlots] = useState<ArgumentSlot[]>([makeSourceSlot('createdOn')]);
      return (
        <ArgumentForm
          functionName="formatDate"
          slots={currentSlots}
          onSlotsChange={(next) => {
            updates.push(next);
            setCurrentSlots(next);
          }}
        />
      );
    }

    render(<ControlledHarness />);

    // Slots 1 and 2 are in Options mode (PARAMETER_HINTS). Click chips to select values.
    await user.click(screen.getByTestId('argument-slot-input-1-chip-ISO8601'));
    await user.click(screen.getByTestId('argument-slot-input-2-chip-YYYY-MM-DD'));

    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate).toHaveLength(3);
    expect(lastUpdate[0]).toEqual(expect.objectContaining({ mode: 'source', path: 'createdOn' }));
    expect(lastUpdate[1]).toEqual(expect.objectContaining({ mode: 'literal', value: 'ISO8601' }));
    expect(lastUpdate[2]).toEqual(expect.objectContaining({ mode: 'literal', value: 'YYYY-MM-DD' }));
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — required validation indicator
// ---------------------------------------------------------------------------

describe('ArgumentForm — validation', () => {
  it('shows validation warning on required empty source slot', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot('')]; // empty source path
    renderForm('upper', slots);
    expect(screen.getByTestId('argument-slot-input-0-validation-warning')).toBeInTheDocument();
  });

  it('does not show validation warning when slot has a value', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot('order.name')];
    renderForm('upper', slots);
    expect(screen.queryByTestId('argument-slot-input-0-validation-warning')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — ParameterValueInput integration (AE-01, AE-11)
// ---------------------------------------------------------------------------

describe('ArgumentForm — ParameterValueInput integration', () => {
  it('renders Source and Static mode buttons for replace() parameters', () => {
    renderForm('replace', [makeSourceSlot(''), makeLiteralSlot(''), makeLiteralSlot('')]);
    // Slot 0: value (source mode default)
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-mode-static')).toBeInTheDocument();
    // No "expression" or "literal" labels in toggle
    expect(screen.queryByRole('radio', { name: /^expression$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^literal$/i })).not.toBeInTheDocument();
  });

  it('renders "Use advanced expression" link for each parameter', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-slot-input-0-expression-link')).toBeInTheDocument();
  });

  it('switching to Static mode emits makeLiteralSlot', async () => {
    const user = userEvent.setup();
    const { onSlotsChange } = renderForm('upper', [makeSourceSlot('')]);
    await user.click(screen.getByTestId('argument-slot-input-0-mode-static'));
    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[0]).toEqual(makeLiteralSlot(''));
  });

  it('typing in source mode emits makeSourceSlot with path', async () => {
    const user = userEvent.setup();
    const { onSlotsChange } = renderForm('upper', [makeSourceSlot('')]);
    await user.type(screen.getByTestId('argument-slot-input-0-source-input'), 'user.name');
    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[0]).toEqual(makeSourceSlot('user.name'));
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — mode toggle (direct component tests — deprecated but retained)
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — mode toggle', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('renders source mode by default for source slot', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-0-mode-literal')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders literal mode by default for literal slot', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-literal')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'false');
  });

  it('switching to literal mode calls onSlotChange with literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-mode-literal'));
    expect(onSlotChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'literal' }));
  });

  it('switching to source mode calls onSlotChange with source slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-mode-source'));
    expect(onSlotChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'source' }));
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — source mode
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — source mode', () => {
  const param = { name: 'value', type: 'string', required: true };
  const sourceOptions = [
    { path: 'order.createdAt', type: 'string' },
    { path: 'order.updatedAt', type: 'string' },
    { path: 'order.amount', type: 'number' },
  ];

  it('renders source path input', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('order.name')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId('argument-slot-input-0-source-input');
    expect(input).toHaveValue('order.name');
  });

  it('typing in source input calls onSlotChange with updated source slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.type(screen.getByTestId('argument-slot-input-0-source-input'), 'order.id');
    const lastCall = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(lastCall.mode).toBe('source');
    if (lastCall.mode === 'source') {
      expect(lastCall.path).toBe('order.id');
    }
  });

  it('renders [+ Transform] button in source mode', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-add-transform')).toBeInTheDocument();
  });

  it('shows source suggestions when source options are provided and input is focused', async () => {
    const user = userEvent.setup();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        sourceOptions={sourceOptions}
        onSlotChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-source-input'));
    expect(screen.getByTestId('argument-slot-input-0-source-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-source-option-order.createdAt')).toBeInTheDocument();
  });

  it('selecting a source suggestion emits source slot with selected path', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        sourceOptions={sourceOptions}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-source-input'));
    await user.click(screen.getByTestId('argument-slot-input-0-source-option-order.updatedAt'));

    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'source', path: 'order.updatedAt' }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — AE-07: nested transform
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — AE-07: nested transform', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('clicking [+ Transform] opens the function picker', async () => {
    const user = userEvent.setup();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('firstName')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a transform function calls onSlotChange with InlineTransform on the slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('firstName')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'source',
        path: 'firstName',
        transform: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ functionName: 'upper' }),
          ]),
        }),
      }),
    );
  });

  it('selecting nested filter initializes comparison condition scaffold', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('mappings')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.type(screen.getByTestId('transform-function-search'), 'filter');
    await user.click(screen.getByTestId('transform-fn-filter'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.transform).toEqual({
        steps: [{
          functionName: 'filter',
          args: [
            makeExpressionSlot({
              functionName: 'eq',
              slots: [
                makeExpressionSlot({
                  functionName: 'item',
                  slots: [makeLiteralSlot('')],
                }),
                makeLiteralSlot(''),
              ],
            }),
          ],
        }],
      });
    }
  });

  it('shows transform display when slot has an inline transform', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-transform-display')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-transform-display')).toHaveTextContent('upper');
  });

  it('does not show [+ Transform] button when transform is already active', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('argument-slot-input-0-add-transform')).not.toBeInTheDocument();
  });

  it('clicking remove-transform calls onSlotChange with source slot (no transform)', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-remove-transform'));
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'source', path: 'firstName' }),
    );
    const emitted = onSlotChange.mock.calls[0][0] as ArgumentSlot;
    if (emitted.mode === 'source') {
      expect(emitted.transform).toBeUndefined();
    }
  });

  it('selecting nested cast initializes targetType arg to string', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('sourceSchema.version')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.type(screen.getByTestId('transform-function-search'), 'cast');
    await user.click(screen.getByTestId('transform-fn-cast'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.path).toBe('sourceSchema.version');
      expect(emitted.transform).toEqual({
        steps: [{ functionName: 'cast', args: [makeLiteralSlot('string')] }],
      });
    }
  });

  it('nested cast targetType dropdown updates transform arg', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    const castTransform: InlineTransform = {
      steps: [{ functionName: 'cast', args: [makeLiteralSlot('string')] }],
    };

    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('sourceSchema.version', castTransform)}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId('argument-slot-input-0-transform-arg-0-dropdown'),
      'number',
    );

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.transform).toEqual({
        steps: [{ functionName: 'cast', args: [makeLiteralSlot('number')] }],
      });
    }
  });

  it('expression mode allows selecting filter for count(array) slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('mappings')}
        parameter={{ name: 'array', type: 'array', required: true }}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-mode-expression'));
    await user.type(screen.getByTestId('transform-function-search'), 'filter');
    await user.click(screen.getByTestId('transform-fn-filter'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('expression');
    if (emitted.mode === 'expression') {
      expect(emitted.node.functionName).toBe('filter');
      expect(emitted.node.slots).toHaveLength(2);
      expect(emitted.node.slots[0]).toEqual(makeSourceSlot(''));
      expect(emitted.node.slots[1]).toEqual(
        makeExpressionSlot({
          functionName: 'eq',
          slots: [
            makeExpressionSlot({
              functionName: 'item',
              slots: [makeLiteralSlot('')],
            }),
            makeLiteralSlot(''),
          ],
        }),
      );
    }
  });

  it('expression picker includes source-access functions (item)', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();

    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeExpressionSlot({ functionName: 'eq', slots: [makeSourceSlot(''), makeLiteralSlot('')] })}
        parameter={{ name: 'a', type: 'any', required: true }}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-expr-change-function'));
    await user.type(screen.getByTestId('transform-function-search'), 'item');
    await user.click(screen.getByTestId('transform-fn-item'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('expression');
    if (emitted.mode === 'expression') {
      expect(emitted.node.functionName).toBe('item');
      expect(emitted.node.slots).toEqual([makeLiteralSlot('')]);
    }
  });

  it('inline filter transform condition can be configured as eq(item("enabled"), true)', async () => {
    const user = userEvent.setup();

    const initialSlot = makeSourceSlotWithTransform('mappings', {
      functionName: 'filter',
      args: [
        makeExpressionSlot({
          functionName: 'eq',
          slots: [
            makeExpressionSlot({
              functionName: 'item',
              slots: [makeLiteralSlot('')],
            }),
            makeLiteralSlot(''),
          ],
        }),
      ],
    });

    let latestSlot: ArgumentSlot = initialSlot;

    function ControlledHarness() {
      const [currentSlot, setCurrentSlot] = useState<ArgumentSlot>(initialSlot);
      return (
        <ArgumentSlotInput
          slotIndex={0}
          slot={currentSlot}
          parameter={{ name: 'array', type: 'array', required: true }}
          onSlotChange={(next) => {
            latestSlot = next;
            setCurrentSlot(next);
          }}
        />
      );
    }

    render(<ControlledHarness />);

    await user.clear(screen.getByTestId('condition-left-0-field-input'));
    await user.type(screen.getByTestId('condition-left-0-field-input'), 'enabled');
    await user.clear(screen.getByTestId('condition-right-0-value-input'));
    await user.type(screen.getByTestId('condition-right-0-value-input'), 'true');

    expect(latestSlot).toEqual(
      makeSourceSlotWithTransform('mappings', {
        steps: [{
          functionName: 'filter',
          args: [
            makeExpressionSlot({
              functionName: 'eq',
              slots: [
                makeExpressionSlot({
                  functionName: 'item',
                  slots: [makeLiteralSlot('enabled')],
                }),
                makeLiteralSlot('true'),
              ],
            }),
          ],
        }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — literal mode
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — literal mode', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('renders text input in literal mode', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-literal-input')).toHaveValue('hello');
  });

  it('typing in literal input calls onSlotChange with updated literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.type(screen.getByTestId('argument-slot-input-0-literal-input'), 'world');
    const lastCall = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(lastCall.mode).toBe('literal');
    if (lastCall.mode === 'literal') {
      expect(lastCall.value).toBe('world');
    }
  });

  it('renders dropdown when hint options are provided', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['a', 'b', 'c'] }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-dropdown')).toBeInTheDocument();
    expect(screen.queryByTestId('argument-slot-input-0-literal-input')).not.toBeInTheDocument();
  });

  it('dropdown options match provided hints', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['string', 'number', 'boolean'] }}
        onSlotChange={vi.fn()}
      />,
    );
    const dropdown = screen.getByTestId('argument-slot-input-0-dropdown');
    expect(within(dropdown).getByRole('option', { name: 'string' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'number' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'boolean' })).toBeInTheDocument();
  });

  it('selecting a dropdown option calls onSlotChange with literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['string', 'number', 'boolean'] }}
        onSlotChange={onSlotChange}
      />,
    );
    await user.selectOptions(screen.getByTestId('argument-slot-input-0-dropdown'), 'number');
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'literal', value: 'number' }),
    );
  });

  it('renders text input alongside dropdown when allowFreeform is true', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['ISO8601', 'YYYY-MM-DD'], allowFreeform: true }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-literal-input')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — accessibility
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — accessibility', () => {
  const param = { name: 'inputFormat', type: 'string', required: true };

  it('parameter name label is rendered', () => {
    render(
      <ArgumentSlotInput
        slotIndex={2}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-2-param-name')).toHaveTextContent('inputFormat');
  });

  it('type badge is rendered', () => {
    render(
      <ArgumentSlotInput
        slotIndex={2}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-2-type-badge')).toHaveTextContent('string');
  });

  it('required indicator is rendered for required params', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={{ name: 'value', type: 'string', required: true }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-required')).toBeInTheDocument();
  });

  it('optional indicator is rendered for optional params', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={{ name: 'decimals', type: 'number', required: false }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-optional')).toBeInTheDocument();
  });

  it('mode toggle has aria-label', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-toggle')).toHaveAttribute(
      'aria-label',
      'Input mode for inputFormat',
    );
  });

  it('source input has aria-label', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-source-input')).toHaveAttribute(
      'aria-label',
      'inputFormat source field path',
    );
  });

  it('remove button has aria-label when provided', () => {
    render(
      <ArgumentSlotInput
        slotIndex={3}
        slot={makeSourceSlot('')}
        parameter={{ name: 'rest', type: 'string', required: false, variadic: true }}
        onSlotChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-3-remove')).toHaveAttribute(
      'aria-label',
      'Remove argument rest',
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(
  functionName: string,
  slots: ArgumentSlot[],
  onSlotsChange = vi.fn(),
) {
  render(
    <ArgumentForm
      functionName={functionName}
      slots={slots}
      onSlotsChange={onSlotsChange}
    />,
  );
  return { onSlotsChange };
}

// ---------------------------------------------------------------------------
// ArgumentForm — basic rendering
// ---------------------------------------------------------------------------

describe('ArgumentForm — rendering', () => {
  it('renders the function name header', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-function-name')).toHaveTextContent('upper');
  });

  it('renders unknown function message for unrecognized function', () => {
    renderForm('notAFunction', []);
    expect(screen.getByTestId('argument-form-unknown-function')).toBeInTheDocument();
    expect(screen.getByTestId('argument-form-unknown-function')).toHaveTextContent('notAFunction');
  });

  it('renders the argument-form container with function name testid', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-upper')).toBeInTheDocument();
  });

  it('can hide the function header when embedded in another function card', () => {
    render(
      <ArgumentForm
        functionName="upper"
        slots={[makeSourceSlot('')]} 
        onSlotsChange={vi.fn()}
        hideFunctionHeader
      />,
    );

    expect(screen.queryByTestId('argument-form-function-name')).not.toBeInTheDocument();
  });
});

describe('ArgumentForm — filter/find condition editor', () => {
  it('renders condition editor for filter second parameter without slot mode toggle', () => {
    renderForm('filter', [makeSourceSlot('lineItemApprovals'), makeSourceSlot('')]);

    expect(screen.getByTestId('argument-slot-input-1-condition-editor')).toBeInTheDocument();
    expect(screen.getByTestId('condition-row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('argument-slot-input-1-mode-toggle')).not.toBeInTheDocument();
  });

  it('normalizes condition field selection to item-relative path for root array sources', async () => {
    const user = userEvent.setup();
    const onSlotsChange = vi.fn();

    render(
      <ArgumentForm
        functionName="filter"
        slots={[makeSourceSlot('Shipment.Trackings'), makeSourceSlot('')]}
        onSlotsChange={onSlotsChange}
        sourceOptions={[
          { path: 'Shipment.Trackings.TrackingType', type: 'string' },
          { path: 'Shipment.Trackings.TrackingNumber', type: 'string' },
        ]}
      />,
    );

    await user.click(screen.getByTestId('condition-left-1-field-input'));
    await user.click(screen.getByTestId('condition-left-1-suggestion-TrackingType'));

    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[1]).toEqual(
      makeExpressionSlot({
        functionName: 'item',
        slots: [makeLiteralSlot('TrackingType')],
      }),
    );
  });

  it('normalizes manually-entered absolute condition field path to item-relative path', async () => {
    const onSlotsChange = vi.fn();

    render(
      <ArgumentForm
        functionName="find"
        slots={[makeSourceSlot('Shipment.Trackings'), makeSourceSlot('')]}
        onSlotsChange={onSlotsChange}
      />,
    );

    const fieldInput = screen.getByTestId('condition-left-1-field-input');
    fireEvent.change(fieldInput, { target: { value: 'Shipment.Trackings.TrackingType' } });

    const emitted = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(emitted[1]).toEqual(
      makeExpressionSlot({
        functionName: 'item',
        slots: [makeLiteralSlot('TrackingType')],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — formatDate (AE-02): 3 slots
// ---------------------------------------------------------------------------

describe('ArgumentForm — formatDate (AE-02)', () => {
  it('with parameterOffset=1, hides value slot and renders only additional params', () => {
    render(
      <ArgumentForm
        functionName="formatDate"
        slots={[]}
        parameterOffset={1}
        onSlotsChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Date field')).not.toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-param-name')).toHaveTextContent('Current date standard');
    expect(screen.getByTestId('argument-slot-input-1-param-name')).toHaveTextContent('Output date format');
  });

  it('with parameterOffset=1, round renders optional decimals slot', () => {
    render(
      <ArgumentForm
        functionName="round"
        slots={[]}
        parameterOffset={1}
        onSlotsChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('argument-slot-input-0-param-name')).toHaveTextContent('Decimal places');
  });

  it('defaults value slot to source mode and format slots to literal mode when slots are missing', () => {
    renderForm('formatDate', []);
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-1-mode-literal')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-2-mode-literal')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders 3 slots for formatDate', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot('order.createdAt'),
      makeLiteralSlot('ISO8601'),
      makeLiteralSlot('YYYY-MM-DD'),
    ];
    renderForm('formatDate', slots);
    const slotsContainer = screen.getByTestId('argument-form-slots');
    expect(within(slotsContainer).getAllByTestId(/-param-name$/)).toHaveLength(3);
  });

  it('renders parameter name labels for formatDate', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot(''),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    expect(screen.getByTestId('argument-slot-input-0-param-name')).toHaveTextContent('Date field');
    expect(screen.getByTestId('argument-slot-input-1-param-name')).toHaveTextContent('Current date standard');
    expect(screen.getByTestId('argument-slot-input-2-param-name')).toHaveTextContent('Output date format');
  });

  it('renders type badges for formatDate params', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot(''),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    expect(screen.getByTestId('argument-slot-input-0-type-badge')).toHaveTextContent('string');
    expect(screen.getByTestId('argument-slot-input-1-type-badge')).toHaveTextContent('string');
    expect(screen.getByTestId('argument-slot-input-2-type-badge')).toHaveTextContent('string');
  });

  it('renders dropdown for inputFormat (PARAMETER_HINTS)', () => {
    const slots: ArgumentSlot[] = [
      makeSourceSlot(''),
      makeLiteralSlot(''),
      makeLiteralSlot(''),
    ];
    renderForm('formatDate', slots);
    // Slot 1 (inputFormat) should be in literal mode with a dropdown
    const slot1 = screen.getByTestId('argument-slot-input-1');
    // Switch to literal mode first
    const literalBtn = within(slot1).getByTestId('argument-slot-input-1-mode-literal');
    expect(literalBtn).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — cast (AE-05): targetType dropdown
// ---------------------------------------------------------------------------

describe('ArgumentForm — cast (AE-05)', () => {
  it('renders 2 slots for cast', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    expect(within(screen.getByTestId('argument-form-slots')).getAllByTestId(/-param-name$/)).toHaveLength(2);
  });

  it('slot 1 is targetType with string type badge', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    expect(screen.getByTestId('argument-slot-input-1-param-name')).toHaveTextContent('Convert to type');
    expect(screen.getByTestId('argument-slot-input-1-type-badge')).toHaveTextContent('string');
  });

  it('AE-05: targetType slot shows dropdown with string/number/boolean options when in literal mode', async () => {
    const user = userEvent.setup();
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    // Switch slot 1 to literal mode
    const slot1 = screen.getByTestId('argument-slot-input-1');
    await user.click(within(slot1).getByTestId('argument-slot-input-1-mode-literal'));
    // Dropdown should be present
    const dropdown = within(slot1).getByTestId('argument-slot-input-1-dropdown');
    expect(dropdown).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'string' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'number' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'boolean' })).toBeInTheDocument();
  });

  it('AE-05: no freeform text input shown for targetType in literal mode', async () => {
    const user = userEvent.setup();
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    renderForm('cast', slots);
    const slot1 = screen.getByTestId('argument-slot-input-1');
    await user.click(within(slot1).getByTestId('argument-slot-input-1-mode-literal'));
    expect(within(slot1).queryByTestId('argument-slot-input-1-literal-input')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — concat (AE-03): variadic [+ Add value]
// ---------------------------------------------------------------------------

describe('ArgumentForm — concat (AE-03)', () => {
  it('renders [+ Add value] button for concat (variadic)', () => {
    renderForm('concat', [makeSourceSlot('')]);
    expect(screen.getByTestId('argument-form-add-value')).toBeInTheDocument();
  });

  it('does not render [+ Add value] for non-variadic functions', () => {
    renderForm('upper', [makeSourceSlot('')]);
    expect(screen.queryByTestId('argument-form-add-value')).not.toBeInTheDocument();
  });

  it('clicking [+ Add value] calls onSlotsChange with an extra slot', async () => {
    const user = userEvent.setup();
    const initialSlots: ArgumentSlot[] = [makeSourceSlot('firstName'), makeLiteralSlot(' ')];
    const { onSlotsChange } = renderForm('concat', initialSlots);
    await user.click(screen.getByTestId('argument-form-add-value'));
    expect(onSlotsChange).toHaveBeenCalledOnce();
    const emitted = onSlotsChange.mock.calls[0][0] as ArgumentSlot[];
    expect(emitted).toHaveLength(3);
  });

  it('AE-03: can build concat(source("firstName"), " ", source("lastName")) state', async () => {
    const user = userEvent.setup();
    const onSlotsChange = vi.fn();
    const initialSlots: ArgumentSlot[] = [
      makeSourceSlot('firstName'),
      makeLiteralSlot(' '),
    ];
    render(
      <ArgumentForm
        functionName="concat"
        slots={initialSlots}
        onSlotsChange={onSlotsChange}
      />,
    );
    // Add a third slot
    await user.click(screen.getByTestId('argument-form-add-value'));
    const emitted = onSlotsChange.mock.calls[0][0] as ArgumentSlot[];
    expect(emitted).toHaveLength(3);
    // First two slots are preserved
    expect(emitted[0]).toEqual(makeSourceSlot('firstName'));
    expect(emitted[1]).toEqual(makeLiteralSlot(' '));
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — slot change propagation
// ---------------------------------------------------------------------------

describe('ArgumentForm — slot change propagation', () => {
  it('changing a slot value calls onSlotsChange with updated slots', async () => {
    const user = userEvent.setup();
    const slots: ArgumentSlot[] = [makeSourceSlot(''), makeLiteralSlot('')];
    const { onSlotsChange } = renderForm('formatDate', slots);
    // Type in the source input of slot 0
    const slot0 = screen.getByTestId('argument-slot-input-0');
    const sourceInput = within(slot0).getByTestId('argument-slot-input-0-source-input');
    await user.type(sourceInput, 'order.date');
    // onSlotsChange should have been called
    expect(onSlotsChange).toHaveBeenCalled();
    const lastCall = onSlotsChange.mock.calls[onSlotsChange.mock.calls.length - 1][0] as ArgumentSlot[];
    expect(lastCall[0]).toEqual(expect.objectContaining({ mode: 'source', path: 'order.date' }));
  });

  it('persists edits for formatDate default-visible literal slots when initial slots are missing', async () => {
    const user = userEvent.setup();

    const updates: ArgumentSlot[][] = [];

    function ControlledHarness() {
      const [currentSlots, setCurrentSlots] = useState<ArgumentSlot[]>([makeSourceSlot('createdOn')]);
      return (
        <ArgumentForm
          functionName="formatDate"
          slots={currentSlots}
          onSlotsChange={(next) => {
            updates.push(next);
            setCurrentSlots(next);
          }}
        />
      );
    }

    render(<ControlledHarness />);

    const inputFormatSlot = screen.getByTestId('argument-slot-input-1');
    const outputFormatSlot = screen.getByTestId('argument-slot-input-2');

    await user.selectOptions(
      within(inputFormatSlot).getByTestId('argument-slot-input-1-dropdown'),
      'ISO8601',
    );
    await user.selectOptions(
      within(outputFormatSlot).getByTestId('argument-slot-input-2-dropdown'),
      'YYYY-MM-DD',
    );

    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate).toHaveLength(3);
    expect(lastUpdate[0]).toEqual(expect.objectContaining({ mode: 'source', path: 'createdOn' }));
    expect(lastUpdate[1]).toEqual(expect.objectContaining({ mode: 'literal', value: 'ISO8601' }));
    expect(lastUpdate[2]).toEqual(expect.objectContaining({ mode: 'literal', value: 'YYYY-MM-DD' }));
  });
});

// ---------------------------------------------------------------------------
// ArgumentForm — required validation indicator
// ---------------------------------------------------------------------------

describe('ArgumentForm — validation', () => {
  it('shows validation warning on required empty slot', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot('')]; // empty source path
    renderForm('upper', slots);
    expect(screen.getByTestId('argument-slot-input-0-validation-warning')).toBeInTheDocument();
  });

  it('does not show validation warning when slot has a value', () => {
    const slots: ArgumentSlot[] = [makeSourceSlot('order.name')];
    renderForm('upper', slots);
    expect(screen.queryByTestId('argument-slot-input-0-validation-warning')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — mode toggle
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — mode toggle', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('renders source mode by default for source slot', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-0-mode-literal')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders literal mode by default for literal slot', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-literal')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('argument-slot-input-0-mode-source')).toHaveAttribute('aria-checked', 'false');
  });

  it('switching to literal mode calls onSlotChange with literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-mode-literal'));
    expect(onSlotChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'literal' }));
  });

  it('switching to source mode calls onSlotChange with source slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-mode-source'));
    expect(onSlotChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'source' }));
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — source mode
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — source mode', () => {
  const param = { name: 'value', type: 'string', required: true };
  const sourceOptions = [
    { path: 'order.createdAt', type: 'string' },
    { path: 'order.updatedAt', type: 'string' },
    { path: 'order.amount', type: 'number' },
  ];

  it('renders source path input', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('order.name')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId('argument-slot-input-0-source-input');
    expect(input).toHaveValue('order.name');
  });

  it('typing in source input calls onSlotChange with updated source slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.type(screen.getByTestId('argument-slot-input-0-source-input'), 'order.id');
    const lastCall = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(lastCall.mode).toBe('source');
    if (lastCall.mode === 'source') {
      expect(lastCall.path).toBe('order.id');
    }
  });

  it('renders [+ Transform] button in source mode', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-add-transform')).toBeInTheDocument();
  });

  it('shows source suggestions when source options are provided and input is focused', async () => {
    const user = userEvent.setup();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        sourceOptions={sourceOptions}
        onSlotChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-source-input'));
    expect(screen.getByTestId('argument-slot-input-0-source-suggestions')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-source-option-order.createdAt')).toBeInTheDocument();
  });

  it('selecting a source suggestion emits source slot with selected path', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        sourceOptions={sourceOptions}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-source-input'));
    await user.click(screen.getByTestId('argument-slot-input-0-source-option-order.updatedAt'));

    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'source', path: 'order.updatedAt' }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — AE-07: nested transform
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — AE-07: nested transform', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('clicking [+ Transform] opens the function picker', async () => {
    const user = userEvent.setup();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('firstName')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a transform function calls onSlotChange with InlineTransform on the slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('firstName')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'source',
        path: 'firstName',
        transform: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ functionName: 'upper' }),
          ]),
        }),
      }),
    );
  });

  it('selecting nested filter initializes comparison condition scaffold', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('mappings')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.type(screen.getByTestId('transform-function-search'), 'filter');
    await user.click(screen.getByTestId('transform-fn-filter'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.transform).toEqual({
        steps: [{
          functionName: 'filter',
          args: [
            makeExpressionSlot({
              functionName: 'eq',
              slots: [
                makeExpressionSlot({
                  functionName: 'item',
                  slots: [makeLiteralSlot('')],
                }),
                makeLiteralSlot(''),
              ],
            }),
          ],
        }],
      });
    }
  });

  it('shows transform display when slot has an inline transform', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-transform-display')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-transform-display')).toHaveTextContent('upper');
  });

  it('does not show [+ Transform] button when transform is already active', () => {
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('argument-slot-input-0-add-transform')).not.toBeInTheDocument();
  });

  it('clicking remove-transform calls onSlotChange with source slot (no transform)', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    const transform: InlineTransform = { steps: [{ functionName: 'upper', args: [] }] };
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('firstName', transform)}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.click(screen.getByTestId('argument-slot-input-0-remove-transform'));
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'source', path: 'firstName' }),
    );
    const emitted = onSlotChange.mock.calls[0][0] as ArgumentSlot;
    if (emitted.mode === 'source') {
      expect(emitted.transform).toBeUndefined();
    }
  });

  it('selecting nested cast initializes targetType arg to string', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('sourceSchema.version')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-add-transform'));
    await user.type(screen.getByTestId('transform-function-search'), 'cast');
    await user.click(screen.getByTestId('transform-fn-cast'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.path).toBe('sourceSchema.version');
      expect(emitted.transform).toEqual({
        steps: [{ functionName: 'cast', args: [makeLiteralSlot('string')] }],
      });
    }
  });

  it('nested cast targetType dropdown updates transform arg', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    const castTransform: InlineTransform = {
      steps: [{ functionName: 'cast', args: [makeLiteralSlot('string')] }],
    };

    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlotWithTransform('sourceSchema.version', castTransform)}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );

    await user.selectOptions(
      screen.getByTestId('argument-slot-input-0-transform-arg-0-dropdown'),
      'number',
    );

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('source');
    if (emitted.mode === 'source') {
      expect(emitted.transform).toEqual({
        steps: [{ functionName: 'cast', args: [makeLiteralSlot('number')] }],
      });
    }
  });

  it('expression mode allows selecting filter for count(array) slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('mappings')}
        parameter={{ name: 'array', type: 'array', required: true }}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-mode-expression'));
    await user.type(screen.getByTestId('transform-function-search'), 'filter');
    await user.click(screen.getByTestId('transform-fn-filter'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('expression');
    if (emitted.mode === 'expression') {
      expect(emitted.node.functionName).toBe('filter');
      expect(emitted.node.slots).toHaveLength(2);
      expect(emitted.node.slots[0]).toEqual(makeSourceSlot(''));
      expect(emitted.node.slots[1]).toEqual(
        makeExpressionSlot({
          functionName: 'eq',
          slots: [
            makeExpressionSlot({
              functionName: 'item',
              slots: [makeLiteralSlot('')],
            }),
            makeLiteralSlot(''),
          ],
        }),
      );
    }
  });

  it('expression picker includes source-access functions (item)', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();

    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeExpressionSlot({ functionName: 'eq', slots: [makeSourceSlot(''), makeLiteralSlot('')] })}
        parameter={{ name: 'a', type: 'any', required: true }}
        onSlotChange={onSlotChange}
      />,
    );

    await user.click(screen.getByTestId('argument-slot-input-0-expr-change-function'));
    await user.type(screen.getByTestId('transform-function-search'), 'item');
    await user.click(screen.getByTestId('transform-fn-item'));

    const emitted = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(emitted.mode).toBe('expression');
    if (emitted.mode === 'expression') {
      expect(emitted.node.functionName).toBe('item');
      expect(emitted.node.slots).toEqual([makeLiteralSlot('')]);
    }
  });

  it('inline filter transform condition can be configured as eq(item("enabled"), true)', async () => {
    const user = userEvent.setup();

    const initialSlot = makeSourceSlotWithTransform('mappings', {
      functionName: 'filter',
      args: [
        makeExpressionSlot({
          functionName: 'eq',
          slots: [
            makeExpressionSlot({
              functionName: 'item',
              slots: [makeLiteralSlot('')],
            }),
            makeLiteralSlot(''),
          ],
        }),
      ],
    });

    let latestSlot: ArgumentSlot = initialSlot;

    function ControlledHarness() {
      const [currentSlot, setCurrentSlot] = useState<ArgumentSlot>(initialSlot);
      return (
        <ArgumentSlotInput
          slotIndex={0}
          slot={currentSlot}
          parameter={{ name: 'array', type: 'array', required: true }}
          onSlotChange={(next) => {
            latestSlot = next;
            setCurrentSlot(next);
          }}
        />
      );
    }

    render(<ControlledHarness />);

    await user.clear(screen.getByTestId('condition-left-0-field-input'));
    await user.type(screen.getByTestId('condition-left-0-field-input'), 'enabled');
    await user.clear(screen.getByTestId('condition-right-0-value-input'));
    await user.type(screen.getByTestId('condition-right-0-value-input'), 'true');

    expect(latestSlot).toEqual(
      makeSourceSlotWithTransform('mappings', {
        steps: [{
          functionName: 'filter',
          args: [
            makeExpressionSlot({
              functionName: 'eq',
              slots: [
                makeExpressionSlot({
                  functionName: 'item',
                  slots: [makeLiteralSlot('enabled')],
                }),
                makeLiteralSlot('true'),
              ],
            }),
          ],
        }],
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — literal mode
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — literal mode', () => {
  const param = { name: 'value', type: 'string', required: true };

  it('renders text input in literal mode', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('hello')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-literal-input')).toHaveValue('hello');
  });

  it('typing in literal input calls onSlotChange with updated literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={onSlotChange}
      />,
    );
    await user.type(screen.getByTestId('argument-slot-input-0-literal-input'), 'world');
    const lastCall = onSlotChange.mock.calls[onSlotChange.mock.calls.length - 1][0] as ArgumentSlot;
    expect(lastCall.mode).toBe('literal');
    if (lastCall.mode === 'literal') {
      expect(lastCall.value).toBe('world');
    }
  });

  it('renders dropdown when hint options are provided', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['a', 'b', 'c'] }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-dropdown')).toBeInTheDocument();
    expect(screen.queryByTestId('argument-slot-input-0-literal-input')).not.toBeInTheDocument();
  });

  it('dropdown options match provided hints', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['string', 'number', 'boolean'] }}
        onSlotChange={vi.fn()}
      />,
    );
    const dropdown = screen.getByTestId('argument-slot-input-0-dropdown');
    expect(within(dropdown).getByRole('option', { name: 'string' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'number' })).toBeInTheDocument();
    expect(within(dropdown).getByRole('option', { name: 'boolean' })).toBeInTheDocument();
  });

  it('selecting a dropdown option calls onSlotChange with literal slot', async () => {
    const user = userEvent.setup();
    const onSlotChange = vi.fn();
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['string', 'number', 'boolean'] }}
        onSlotChange={onSlotChange}
      />,
    );
    await user.selectOptions(screen.getByTestId('argument-slot-input-0-dropdown'), 'number');
    expect(onSlotChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'literal', value: 'number' }),
    );
  });

  it('renders text input alongside dropdown when allowFreeform is true', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={param}
        hint={{ options: ['ISO8601', 'YYYY-MM-DD'], allowFreeform: true }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('argument-slot-input-0-literal-input')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ArgumentSlotInput — accessibility
// ---------------------------------------------------------------------------

describe('ArgumentSlotInput — accessibility', () => {
  const param = { name: 'inputFormat', type: 'string', required: true };

  it('parameter name label is rendered', () => {
    render(
      <ArgumentSlotInput
        slotIndex={2}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-2-param-name')).toHaveTextContent('inputFormat');
  });

  it('type badge is rendered', () => {
    render(
      <ArgumentSlotInput
        slotIndex={2}
        slot={makeLiteralSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-2-type-badge')).toHaveTextContent('string');
  });

  it('required indicator is rendered for required params', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={{ name: 'value', type: 'string', required: true }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-required')).toBeInTheDocument();
  });

  it('optional indicator is rendered for optional params', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeLiteralSlot('')}
        parameter={{ name: 'decimals', type: 'number', required: false }}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-optional')).toBeInTheDocument();
  });

  it('mode toggle has aria-label', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-mode-toggle')).toHaveAttribute(
      'aria-label',
      'Input mode for inputFormat',
    );
  });

  it('source input has aria-label', () => {
    render(
      <ArgumentSlotInput
        slotIndex={0}
        slot={makeSourceSlot('')}
        parameter={param}
        onSlotChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-0-source-input')).toHaveAttribute(
      'aria-label',
      'inputFormat source field path',
    );
  });

  it('remove button has aria-label when provided', () => {
    render(
      <ArgumentSlotInput
        slotIndex={3}
        slot={makeSourceSlot('')}
        parameter={{ name: 'rest', type: 'string', required: false, variadic: true }}
        onSlotChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('argument-slot-input-3-remove')).toHaveAttribute(
      'aria-label',
      'Remove argument rest',
    );
  });
});
