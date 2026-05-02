import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineEditableTags } from '../InlineEditableTags';

describe('InlineEditableTags', () => {
  it('renders existing tags as pills', () => {
    render(<InlineEditableTags tags={['alpha', 'beta']} onSave={vi.fn()} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('shows placeholder button when no tags', () => {
    render(<InlineEditableTags tags={[]} onSave={vi.fn()} placeholder="Add tag…" />);
    expect(screen.getByRole('button', { name: 'Edit tags' })).toBeInTheDocument();
    expect(screen.getByText('Add tag…')).toBeInTheDocument();
  });

  it('enters edit mode on button click', async () => {
    const user = userEvent.setup();
    render(<InlineEditableTags tags={['alpha']} onSave={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    expect(screen.getByRole('textbox', { name: 'Tag input' })).toBeInTheDocument();
  });

  it('adds a tag by pressing Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlineEditableTags tags={[]} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    await user.type(screen.getByRole('textbox', { name: 'Tag input' }), 'newtag{Enter}');
    // Blur to commit
    await user.tab();
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['newtag']));
  });

  it('removes a tag with its remove button', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlineEditableTags tags={['alpha', 'beta']} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    await user.click(screen.getByRole('button', { name: 'Remove tag alpha' }));
    // Blur to commit
    await user.tab();
    expect(onSave).toHaveBeenCalledWith(['beta']);
  });

  it('removes the last tag on Backspace when input is empty', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlineEditableTags tags={['alpha', 'beta']} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    await user.keyboard('{Backspace}');
    await user.tab();
    expect(onSave).toHaveBeenCalledWith(['alpha']);
  });

  it('cancels on Escape without calling onSave', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineEditableTags tags={['alpha']} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Edit tags' }));
    await user.keyboard('{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('alpha')).toBeInTheDocument();
  });
});
