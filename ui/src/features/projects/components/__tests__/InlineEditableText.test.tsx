import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineEditableText } from '../InlineEditableText';

describe('InlineEditableText', () => {
  it('renders the value in display mode', () => {
    render(<InlineEditableText value="My Title" onSave={vi.fn()} as="h1" />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('shows placeholder when value is empty', () => {
    render(
      <InlineEditableText value="" onSave={vi.fn()} placeholder="Click to edit…" as="p" />,
    );
    expect(screen.getByText('Click to edit…')).toBeInTheDocument();
  });

  it('enters edit mode on click', async () => {
    const user = userEvent.setup();
    render(<InlineEditableText value="Hello" onSave={vi.fn()} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Hello');
  });

  it('enters edit mode on Enter keypress', async () => {
    const user = userEvent.setup();
    render(<InlineEditableText value="Hello" onSave={vi.fn()} />);
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSave with new value on Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlineEditableText value="Old" onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'New{Enter}');
    expect(onSave).toHaveBeenCalledWith('New');
  });

  it('calls onSave on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <div>
        <InlineEditableText value="Old" onSave={onSave} />
        <button>Outside</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: /edit old/i }));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Updated');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onSave).toHaveBeenCalledWith('Updated');
  });

  it('does not call onSave when value is unchanged on blur', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <div>
        <InlineEditableText value="Same" onSave={onSave} />
        <button>Outside</button>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: /edit same/i }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancels on Escape and reverts to original value', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditableText value="Original" onSave={onSave} />);
    await user.click(screen.getByRole('button'));
    await user.clear(screen.getByRole('textbox'));
    await user.type(screen.getByRole('textbox'), 'Discarded');
    await user.keyboard('{Escape}');
    expect(screen.getByText('Original')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders textarea when multiline=true', async () => {
    const user = userEvent.setup();
    render(<InlineEditableText value="Text" onSave={vi.fn()} multiline />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
  });
});
