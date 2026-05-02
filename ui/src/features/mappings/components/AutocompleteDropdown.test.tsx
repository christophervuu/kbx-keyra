import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AutocompleteDropdown } from './AutocompleteDropdown';
import type { AutocompleteItem } from '@/lib/data/dsl-functions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FUNCTION_SUGGESTIONS: AutocompleteItem[] = [
  { label: 'concat', insertText: 'concat()', detail: 'String (1+ args)', kind: 'function' },
  { label: 'contains', insertText: 'contains()', detail: 'String (2 args)', kind: 'function' },
  { label: 'cast', insertText: 'cast()', detail: 'TypeConversion (2 args)', kind: 'function' },
];

const FIELD_SUGGESTIONS: AutocompleteItem[] = [
  { label: 'order.name', insertText: 'order.name', detail: 'string', kind: 'field' },
  { label: 'order.total', insertText: 'order.total', detail: 'number', kind: 'field' },
];

function renderDropdown(
  props: Partial<React.ComponentProps<typeof AutocompleteDropdown>> = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  const onClose = props.onClose ?? vi.fn();
  return render(
    <AutocompleteDropdown
      suggestions={props.suggestions ?? FUNCTION_SUGGESTIONS}
      selectedIndex={props.selectedIndex ?? 0}
      onSelect={onSelect}
      onClose={onClose}
      position={props.position ?? { top: 100, left: 200 }}
      className={props.className}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutocompleteDropdown', () => {
  it('renders nothing when suggestions is empty', () => {
    const { container } = renderDropdown({ suggestions: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders a listbox with all suggestions', () => {
    renderDropdown();
    const listbox = screen.getByRole('listbox', { name: 'Autocomplete suggestions' });
    expect(listbox).toBeInTheDocument();
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('renders suggestion labels correctly', () => {
    renderDropdown();
    expect(screen.getByText('concat')).toBeInTheDocument();
    expect(screen.getByText('contains')).toBeInTheDocument();
    expect(screen.getByText('cast')).toBeInTheDocument();
  });

  it('highlights the selected item with aria-selected=true', () => {
    renderDropdown({ selectedIndex: 1 });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('first item is highlighted by default (selectedIndex=0)', () => {
    renderDropdown({ selectedIndex: 0 });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect with item and index when an option is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderDropdown({ onSelect });
    const options = screen.getAllByRole('option');
    await user.click(options[1]);
    expect(onSelect).toHaveBeenCalledWith(FUNCTION_SUGGESTIONS[1], 1);
  });

  it('shows detail text for each suggestion', () => {
    renderDropdown();
    expect(screen.getByText('String (1+ args)')).toBeInTheDocument();
  });

  it('renders field suggestions with □ icon', () => {
    renderDropdown({ suggestions: FIELD_SUGGESTIONS });
    // The □ icon should be present (aria-hidden spans)
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('□');
  });

  it('renders function suggestions with ƒ icon', () => {
    renderDropdown({ suggestions: FUNCTION_SUGGESTIONS });
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('ƒ');
  });

  it('renders constant suggestions with C icon', () => {
    const constantSuggestions: AutocompleteItem[] = [
      { label: 'TAX_RATE', insertText: 'TAX_RATE', detail: 'constant', kind: 'constant' },
    ];
    renderDropdown({ suggestions: constantSuggestions });
    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).toContain('C');
  });

  it('is positioned using fixed styles at the provided coordinates', () => {
    const { container } = renderDropdown({ position: { top: 42, left: 99 } });
    // The portal renders into document.body; find the listbox
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveStyle({ top: '42px', left: '99px' });
  });

  it('applies custom className to the dropdown container', () => {
    renderDropdown({ className: 'my-test-class' });
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveClass('my-test-class');
  });
});
