/**
 * EntryPointSelector tests — FS-038 T-05
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntryPointSelector } from './EntryPointSelector';
import type { EntryPointSelectorProps } from './EntryPointSelector';

const DEFAULT_PROPS: EntryPointSelectorProps = {
  value: 'source',
  hasLogicSteps: false,
  onEntryTypeChange: vi.fn(),
};

function renderSelector(overrides: Partial<EntryPointSelectorProps> = {}) {
  return render(<EntryPointSelector {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('EntryPointSelector — rendering', () => {
  it('renders the selector container', () => {
    renderSelector();
    expect(screen.getByTestId('entry-point-selector')).toBeInTheDocument();
  });

  it('renders Source option', () => {
    renderSelector();
    expect(screen.getByTestId('entry-option-source')).toBeInTheDocument();
    expect(screen.getByTestId('entry-option-source')).toHaveTextContent('Source');
  });

  it('renders Static option', () => {
    renderSelector();
    expect(screen.getByTestId('entry-option-static')).toBeInTheDocument();
    expect(screen.getByTestId('entry-option-static')).toHaveTextContent('Static');
  });

  it('AE-19: renders External option as disabled', () => {
    renderSelector();
    expect(screen.getByTestId('entry-option-external')).toBeInTheDocument();
    expect(screen.getByTestId('entry-option-external')).toBeDisabled();
  });

  it('AE-19: External option has correct tooltip', () => {
    renderSelector();
    expect(screen.getByTestId('entry-option-external')).toHaveAttribute(
      'title',
      'External data sources — available in a future release',
    );
  });

  it('Source is marked as pressed when value is source', () => {
    renderSelector({ value: 'source' });
    expect(screen.getByTestId('entry-option-source')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('entry-option-static')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Static is marked as pressed when value is static', () => {
    renderSelector({ value: 'static' });
    expect(screen.getByTestId('entry-option-static')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('entry-option-source')).toHaveAttribute('aria-pressed', 'false');
  });
});

// ---------------------------------------------------------------------------
// Entry type switching — no logic steps
// ---------------------------------------------------------------------------

describe('EntryPointSelector — switching without logic steps', () => {
  it('fires onEntryTypeChange when Static is clicked (no logic steps)', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: false, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-static'));
    expect(onEntryTypeChange).toHaveBeenCalledWith('static');
    expect(onEntryTypeChange).toHaveBeenCalledTimes(1);
  });

  it('fires onEntryTypeChange when Source is clicked from Static (no logic steps)', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'static', hasLogicSteps: false, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-source'));
    expect(onEntryTypeChange).toHaveBeenCalledWith('source');
  });

  it('does NOT fire onEntryTypeChange when already-selected option is clicked', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: false, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-source'));
    expect(onEntryTypeChange).not.toHaveBeenCalled();
  });

  it('does NOT fire onEntryTypeChange when External is clicked (disabled)', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: false, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-external'));
    expect(onEntryTypeChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AE-13: Entry type switching with logic steps — confirmation dialog
// ---------------------------------------------------------------------------

describe('EntryPointSelector — AE-13: confirmation when logic steps exist', () => {
  it('shows confirmation dialog when switching with logic steps', async () => {
    const user = userEvent.setup();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange: vi.fn() });
    await user.click(screen.getByTestId('entry-option-static'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('does NOT fire onEntryTypeChange immediately when logic steps exist', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-static'));
    expect(onEntryTypeChange).not.toHaveBeenCalled();
  });

  it('fires onEntryTypeChange after confirming the dialog', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-static'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onEntryTypeChange).toHaveBeenCalledWith('static');
  });

  it('does NOT fire onEntryTypeChange after cancelling the dialog', async () => {
    const user = userEvent.setup();
    const onEntryTypeChange = vi.fn();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange });
    await user.click(screen.getByTestId('entry-option-static'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onEntryTypeChange).not.toHaveBeenCalled();
  });

  it('closes the dialog after cancelling', async () => {
    const user = userEvent.setup();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange: vi.fn() });
    await user.click(screen.getByTestId('entry-option-static'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('closes the dialog after confirming', async () => {
    const user = userEvent.setup();
    renderSelector({ value: 'source', hasLogicSteps: true, onEntryTypeChange: vi.fn() });
    await user.click(screen.getByTestId('entry-option-static'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility
// ---------------------------------------------------------------------------

describe('EntryPointSelector — keyboard accessibility', () => {
  it('Source option is keyboard focusable', () => {
    renderSelector();
    const btn = screen.getByTestId('entry-option-source');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('Static option is keyboard focusable', () => {
    renderSelector();
    const btn = screen.getByTestId('entry-option-static');
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});
