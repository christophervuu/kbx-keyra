import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';


import { ComparisonModeSelector } from './ComparisonModeSelector';
import type { ModeAvailabilityEntry } from './ComparisonModeSelector';

import type { ComparisonMode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ALL_AVAILABLE: Record<ComparisonMode, ModeAvailabilityEntry> = {
  'current-vs-saved': { available: true },
  'current-vs-dev': { available: true },
  'current-vs-qa': { available: true },
  'dev-vs-qa': { available: true },
  'qa-vs-prod': { available: true },
};

const PHASE_0_AVAILABILITY: Record<ComparisonMode, ModeAvailabilityEntry> = {
  'current-vs-saved': { available: true },
  'current-vs-dev': { available: false, reason: 'requires backend connection' },
  'current-vs-qa': { available: false, reason: 'requires backend connection' },
  'dev-vs-qa': { available: false, reason: 'requires backend connection' },
  'qa-vs-prod': { available: false, reason: 'requires backend connection' },
};

const MIXED_AVAILABILITY: Record<ComparisonMode, ModeAvailabilityEntry> = {
  'current-vs-saved': { available: true },
  'current-vs-dev': { available: true },
  'current-vs-qa': { available: false, reason: 'QA has no active deployment' },
  'dev-vs-qa': { available: false, reason: 'QA has no active deployment' },
  'qa-vs-prod': { available: false, reason: 'QA has no active deployment' },
};

function renderSelector(
  props: Partial<Parameters<typeof ComparisonModeSelector>[0]> = {},
) {
  const defaults = {
    selectedMode: 'current-vs-saved' as ComparisonMode,
    onModeChange: vi.fn(),
    modeAvailability: ALL_AVAILABLE,
  };
  return render(<ComparisonModeSelector {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComparisonModeSelector', () => {
  it('renders all 5 mode options', () => {
    renderSelector();

    expect(screen.getByTestId('comparison-mode-option-current-vs-saved')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-mode-option-current-vs-dev')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-mode-option-current-vs-qa')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-mode-option-dev-vs-qa')).toBeInTheDocument();
    expect(screen.getByTestId('comparison-mode-option-qa-vs-prod')).toBeInTheDocument();
  });

  it('renders the selector container with correct test-id', () => {
    renderSelector();
    expect(screen.getByTestId('comparison-mode-selector')).toBeInTheDocument();
  });

  it('marks the selected mode as aria-checked', () => {
    renderSelector({ selectedMode: 'current-vs-dev' });

    const devOption = screen.getByTestId('comparison-mode-option-current-vs-dev');
    expect(devOption).toHaveAttribute('aria-checked', 'true');

    const savedOption = screen.getByTestId('comparison-mode-option-current-vs-saved');
    expect(savedOption).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onModeChange when an available mode is clicked', () => {
    const onModeChange = vi.fn();
    renderSelector({ onModeChange });

    fireEvent.click(screen.getByTestId('comparison-mode-option-current-vs-dev'));
    expect(onModeChange).toHaveBeenCalledWith('current-vs-dev');
  });

  it('does not fire onModeChange when a disabled mode is clicked', () => {
    const onModeChange = vi.fn();
    renderSelector({ onModeChange, modeAvailability: PHASE_0_AVAILABILITY });

    fireEvent.click(screen.getByTestId('comparison-mode-option-current-vs-dev'));
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('disabled modes have disabled attribute', () => {
    renderSelector({ modeAvailability: PHASE_0_AVAILABILITY });

    expect(screen.getByTestId('comparison-mode-option-current-vs-dev')).toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-current-vs-qa')).toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-dev-vs-qa')).toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-qa-vs-prod')).toBeDisabled();
  });

  it('available modes are not disabled', () => {
    renderSelector({ modeAvailability: PHASE_0_AVAILABILITY });

    expect(screen.getByTestId('comparison-mode-option-current-vs-saved')).not.toBeDisabled();
  });

  it('Phase 0: disabled modes show reason in title tooltip', () => {
    renderSelector({ modeAvailability: PHASE_0_AVAILABILITY });

    const devOption = screen.getByTestId('comparison-mode-option-current-vs-dev');
    expect(devOption).toHaveAttribute('title', 'requires backend connection');
  });

  it('Phase 0: available mode has no title tooltip', () => {
    renderSelector({ modeAvailability: PHASE_0_AVAILABILITY });

    const savedOption = screen.getByTestId('comparison-mode-option-current-vs-saved');
    expect(savedOption).not.toHaveAttribute('title');
  });

  it('Phase 0: disabled modes include reason in screen-reader text', () => {
    renderSelector({ modeAvailability: PHASE_0_AVAILABILITY });

    const devOption = screen.getByTestId('comparison-mode-option-current-vs-dev');
    expect(devOption.textContent).toContain('requires backend connection');
  });

  it('mixed availability: some modes enabled, some disabled', () => {
    renderSelector({ modeAvailability: MIXED_AVAILABILITY });

    expect(screen.getByTestId('comparison-mode-option-current-vs-saved')).not.toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-current-vs-dev')).not.toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-current-vs-qa')).toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-dev-vs-qa')).toBeDisabled();
    expect(screen.getByTestId('comparison-mode-option-qa-vs-prod')).toBeDisabled();
  });

  it('mixed availability: disabled modes show correct reason', () => {
    renderSelector({ modeAvailability: MIXED_AVAILABILITY });

    const qaOption = screen.getByTestId('comparison-mode-option-current-vs-qa');
    expect(qaOption).toHaveAttribute('title', 'QA has no active deployment');
  });

  it('has radiogroup role for accessibility', () => {
    renderSelector();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('mode labels are human-readable', () => {
    renderSelector();

    expect(screen.getByTestId('comparison-mode-option-current-vs-saved').textContent).toContain('Current vs Saved');
    expect(screen.getByTestId('comparison-mode-option-current-vs-dev').textContent).toContain('Current vs DEV');
    expect(screen.getByTestId('comparison-mode-option-qa-vs-prod').textContent).toContain('QA vs PROD');
  });
});
