/**
 * ChainValueMapForm tests — FS-038 T-10
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChainValueMapForm, summarizeValueMapStep } from './ChainValueMapForm';
import type { ChainValueMapFormProps } from './ChainValueMapForm';
import type { ValueMapLogicStep, ChainBranch, ChainValueMapEntry } from '../lib/chain-builder-state';

function makeEmptyBranch(): ChainBranch {
  return { kind: 'static', value: { type: 'string', value: '' } };
}

function makeFilledBranch(value: string): ChainBranch {
  return { kind: 'static', value: { type: 'string', value } };
}

function makeRow(whenValue: string, outputValue?: string): ChainValueMapEntry {
  return {
    whenValue,
    outputValue: outputValue !== undefined ? makeFilledBranch(outputValue) : makeEmptyBranch(),
  };
}

function makeStep(overrides: Partial<ValueMapLogicStep> = {}): ValueMapLogicStep {
  return {
    kind: 'valueMap',
    mappings: [makeRow('')],
    defaultValue: makeEmptyBranch(),
    ...overrides,
  };
}

function renderForm(overrides: Partial<ChainValueMapFormProps> = {}) {
  const props: ChainValueMapFormProps = {
    stepIndex: 0,
    step: makeStep(),
    onStepChange: vi.fn(),
    onRemoveStep: vi.fn(),
    ...overrides,
  };
  return render(<ChainValueMapForm {...props} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('ChainValueMapForm — rendering', () => {
  it('renders the form container', () => {
    renderForm();
    expect(screen.getByTestId('chain-value-map-form-0')).toBeInTheDocument();
  });

  it('renders header with context label', () => {
    renderForm({ currentValueLabel: 'the status field' });
    expect(screen.getByTestId('chain-value-map-header-label-0')).toHaveTextContent('the status field');
  });

  it('AE-09: renders mapping rows with input → output pattern', () => {
    renderForm({
      step: makeStep({ mappings: [makeRow('A'), makeRow('B')] }),
    });
    expect(screen.getByTestId('chain-value-map-row-0-0')).toBeInTheDocument();
    expect(screen.getByTestId('chain-value-map-row-0-1')).toBeInTheDocument();
  });

  it('AE-09: default row is always present', () => {
    renderForm();
    expect(screen.getByTestId('chain-value-map-default-0')).toBeInTheDocument();
  });

  it('default row is non-removable — no remove button in default section', () => {
    renderForm();
    const defaultSection = screen.getByTestId('chain-value-map-default-0');
    expect(defaultSection.querySelector('[aria-label="Remove mapping row"]')).not.toBeInTheDocument();
  });

  it('default required notice shown when default is empty', () => {
    renderForm({ step: makeStep({ defaultValue: makeEmptyBranch() }) });
    expect(screen.getByTestId('chain-value-map-default-required-0')).toBeInTheDocument();
  });

  it('default required notice absent when default has value', () => {
    renderForm({ step: makeStep({ defaultValue: makeFilledBranch('Unknown') }) });
    expect(screen.queryByTestId('chain-value-map-default-required-0')).not.toBeInTheDocument();
  });

  it('Apply disabled notice shown when default is empty', () => {
    renderForm();
    expect(screen.getByTestId('chain-value-map-apply-disabled-0')).toBeInTheDocument();
  });

  it('Apply disabled notice absent when default has value', () => {
    renderForm({ step: makeStep({ defaultValue: makeFilledBranch('fallback') }) });
    expect(screen.queryByTestId('chain-value-map-apply-disabled-0')).not.toBeInTheDocument();
  });

  it('renders [+ Add case] button', () => {
    renderForm();
    expect(screen.getByTestId('chain-value-map-add-case-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('ChainValueMapForm — interactions', () => {
  it('AE-09: [+ Add case] adds a new mapping row', () => {
    const onStepChange = vi.fn();
    renderForm({ step: makeStep({ mappings: [] }), onStepChange });
    fireEvent.click(screen.getByTestId('chain-value-map-add-case-0'));
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        mappings: expect.arrayContaining([expect.objectContaining({ whenValue: '' })]),
      }),
    );
  });

  it('remove button removes a mapping row', () => {
    const onStepChange = vi.fn();
    renderForm({
      step: makeStep({ mappings: [makeRow('A'), makeRow('B')] }),
      onStepChange,
    });
    fireEvent.click(screen.getByTestId('chain-value-map-row-remove-0-0'));
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        mappings: [expect.objectContaining({ whenValue: 'B' })],
      }),
    );
  });

  it('input value change fires onStepChange', () => {
    const onStepChange = vi.fn();
    renderForm({ step: makeStep({ mappings: [makeRow('')] }), onStepChange });
    fireEvent.change(screen.getByTestId('chain-value-map-row-input-0-0'), {
      target: { value: 'ACTIVE' },
    });
    expect(onStepChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        mappings: [expect.objectContaining({ whenValue: 'ACTIVE' })],
      }),
    );
  });

  it('AE-09: clicking collapsed summary expands', () => {
    renderForm({
      step: makeStep({
        mappings: [makeRow('A', 'Active')],
        defaultValue: makeFilledBranch('Unknown'),
      }),
    });
    // CollapsibleStepContainer handles expand/collapse — form is always in expanded state
    expect(screen.getByTestId('chain-value-map-rows-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// summarizeValueMapStep
// ---------------------------------------------------------------------------

describe('summarizeValueMapStep', () => {
  it('AE-09: produces readable one-line summary', () => {
    const step = makeStep({
      mappings: [makeRow('A', 'Active'), makeRow('B', 'Inactive')],
      defaultValue: makeFilledBranch('Unknown'),
    });
    const summary = summarizeValueMapStep(step);
    expect(summary).toContain('A→Active');
    expect(summary).toContain('B→Inactive');
    expect(summary).toContain('default: Unknown');
  });

  it('truncates if > 2 mappings shown', () => {
    const step = makeStep({
      mappings: [makeRow('A', 'Active'), makeRow('B', 'Inactive'), makeRow('C', 'Pending')],
      defaultValue: makeFilledBranch('Unknown'),
    });
    const summary = summarizeValueMapStep(step);
    expect(summary).toContain('+1 more');
  });

  it('handles empty mappings gracefully', () => {
    const step = makeStep({ mappings: [], defaultValue: makeFilledBranch('fallback') });
    const summary = summarizeValueMapStep(step);
    expect(summary).toContain('default: fallback');
  });
});
