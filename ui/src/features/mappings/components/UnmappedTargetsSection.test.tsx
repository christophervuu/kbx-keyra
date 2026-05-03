import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnmappedTargetsSection } from './UnmappedTargetsSection';
import type { MappingConfigOptions } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSection(
  configOptions: MappingConfigOptions,
  onUpdateConfig = vi.fn(),
) {
  return render(
    <UnmappedTargetsSection
      configOptions={configOptions}
      onUpdateConfig={onUpdateConfig}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UnmappedTargetsSection', () => {
  it('renders 3 radio options (null, omit, error)', () => {
    renderSection({});
    expect(screen.getByTestId('unmapped-targets-option-null')).toBeInTheDocument();
    expect(screen.getByTestId('unmapped-targets-option-omit')).toBeInTheDocument();
    expect(screen.getByTestId('unmapped-targets-option-error')).toBeInTheDocument();
  });

  it('defaults to "null" selected when unmappedTargets is undefined', () => {
    renderSection({});
    const nullRadio = screen.getByRole('radio', { name: /null/i });
    expect(nullRadio).toBeChecked();
  });

  it('reflects "omit" as selected when configOptions.unmappedTargets is "omit"', () => {
    renderSection({ unmappedTargets: 'omit' });
    expect(screen.getByRole('radio', { name: /omit/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /null/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /error/i })).not.toBeChecked();
  });

  it('reflects "error" as selected when configOptions.unmappedTargets is "error"', () => {
    renderSection({ unmappedTargets: 'error' });
    expect(screen.getByRole('radio', { name: /error/i })).toBeChecked();
  });

  it('reflects "null" as selected when configOptions.unmappedTargets is "null"', () => {
    renderSection({ unmappedTargets: 'null' });
    expect(screen.getByRole('radio', { name: /null/i })).toBeChecked();
  });

  it('calls onUpdateConfig with { unmappedTargets: "omit" } when omit is clicked', async () => {
    const onUpdateConfig = vi.fn();
    renderSection({}, onUpdateConfig);
    await userEvent.click(screen.getByRole('radio', { name: /omit/i }));
    expect(onUpdateConfig).toHaveBeenCalledWith({ unmappedTargets: 'omit' });
  });

  it('calls onUpdateConfig with { unmappedTargets: "error" } when error is clicked', async () => {
    const onUpdateConfig = vi.fn();
    renderSection({}, onUpdateConfig);
    await userEvent.click(screen.getByRole('radio', { name: /error/i }));
    expect(onUpdateConfig).toHaveBeenCalledWith({ unmappedTargets: 'error' });
  });

  it('calls onUpdateConfig with { unmappedTargets: "null" } when null is clicked', async () => {
    const onUpdateConfig = vi.fn();
    renderSection({ unmappedTargets: 'omit' }, onUpdateConfig);
    await userEvent.click(screen.getByRole('radio', { name: /null/i }));
    expect(onUpdateConfig).toHaveBeenCalledWith({ unmappedTargets: 'null' });
  });

  it('renders a fieldset with a screen-reader legend for accessibility', () => {
    renderSection({});
    expect(screen.getByTestId('unmapped-targets-fieldset')).toBeInTheDocument();
    // legend is sr-only but still in the DOM
    expect(screen.getByText('Unmapped targets strategy')).toBeInTheDocument();
  });

  it('each radio input has an accessible description', () => {
    renderSection({});
    // aria-describedby links each input to its description span
    const nullRadio = screen.getByRole('radio', { name: /null/i });
    expect(nullRadio).toHaveAttribute('aria-describedby', 'unmapped-targets-null-desc');
    expect(screen.getByText('Set unmapped fields to null in output')).toBeInTheDocument();
  });

  it('all radio inputs share the same name attribute', () => {
    renderSection({});
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    radios.forEach((radio) => {
      expect(radio).toHaveAttribute('name', 'unmapped-targets');
    });
  });
});
