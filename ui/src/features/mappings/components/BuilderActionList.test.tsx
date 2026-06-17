import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuilderActionList } from './BuilderActionList';
import type { ResolvedSmartBuilderAction } from '../lib/smart-builder-action-resolver';

function makeAction(overrides: Partial<ResolvedSmartBuilderAction>): ResolvedSmartBuilderAction {
  return {
    action: {
      id: 'text.concat',
      label: 'Combine text',
      category: 'text',
      appliesTo: 'tray',
      dslFunctions: ['concat'],
      ...overrides.action,
    },
    availability: {
      enabled: true,
      ...overrides.availability,
    },
  };
}

describe('BuilderActionList', () => {
  it('renders enabled actions first section and unavailable section with reason text', () => {
    const actions: ResolvedSmartBuilderAction[] = [
      makeAction({ action: { id: 'condition.if', label: 'Conditional output', category: 'condition', appliesTo: 'tray', dslFunctions: ['if'] } }),
      makeAction({
        action: { id: 'number.add', label: 'Add numbers', category: 'number', appliesTo: 'tray', dslFunctions: ['add'] },
        availability: { enabled: false, reason: 'Unavailable: Convert to number first.' },
      }),
    ];

    render(<BuilderActionList actions={actions} />);

    expect(screen.getByTestId('smart-actions-enabled')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('smart-actions-search'), { target: { value: 'add numbers' } });
    expect(screen.getByTestId('smart-actions-unavailable-section')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-action-disabled-number.add').querySelector('button')!);
    expect(screen.getByTestId('smart-action-disabled-number.add')).toHaveTextContent('Convert to number first');
  });

  it('renders empty enabled-state guidance when no action is currently enabled', () => {
    render(
      <BuilderActionList
        actions={[
          makeAction({
            action: { id: 'number.add', label: 'Add numbers', category: 'number', appliesTo: 'tray', dslFunctions: ['add'] },
            availability: { enabled: false, reason: 'Unavailable: numeric input required.' },
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('smart-actions-empty')).toBeInTheDocument();
  });

  it('invokes onApplyAction when enabled action is clicked', () => {
    const onApplyAction = vi.fn();
    render(
      <BuilderActionList
        actions={[makeAction({ action: { id: 'text.concat', label: 'Combine text', category: 'text', appliesTo: 'tray', dslFunctions: ['concat'] } })]}
        onApplyAction={onApplyAction}
      />, 
    );

    fireEvent.click(screen.getByTestId('smart-action-apply-text.concat'));
    expect(onApplyAction).toHaveBeenCalledWith('text.concat');
  });

  it('hides disabled actions by default and reveals them via search', () => {
    const actions: ResolvedSmartBuilderAction[] = [
      makeAction({ action: { id: 'text.concat', label: 'Combine text', category: 'text', appliesTo: 'tray', dslFunctions: ['concat'] } }),
      makeAction({
        action: { id: 'number.add', label: 'Add numbers', category: 'number', appliesTo: 'tray', dslFunctions: ['add'] },
        availability: { enabled: false, reason: 'Unavailable: Convert to number first.' },
      }),
    ];

    render(<BuilderActionList actions={actions} />);
    expect(screen.queryByTestId('smart-action-disabled-number.add')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('smart-actions-search'), { target: { value: 'add numbers' } });
    expect(screen.getByTestId('smart-action-disabled-number.add')).toBeInTheDocument();
  });

  it('marks active action as pressed', () => {
    render(
      <BuilderActionList
        actions={[makeAction({ action: { id: 'text.concat', label: 'Combine text', category: 'text', appliesTo: 'tray', dslFunctions: ['concat'] } })]}
        activeActionId="text.concat"
      />,
    );

    expect(screen.getByTestId('smart-action-apply-text.concat')).toHaveAttribute('aria-pressed', 'true');
  });
});
