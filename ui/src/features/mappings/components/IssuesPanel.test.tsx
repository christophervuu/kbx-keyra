import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IssuesPanel } from './IssuesPanel';

describe('IssuesPanel', () => {
  it('renders empty state when no issues are present', () => {
    render(
      <IssuesPanel
        issues={[]}
        onClose={vi.fn()}
        onOpenRow={vi.fn()}
      />,
    );

    expect(screen.getByTestId('issues-panel')).toBeInTheDocument();
    expect(screen.getByTestId('issues-empty')).toHaveTextContent('No blocking or warning issues found.');
  });

  it('renders issues and routes open-row action', () => {
    const onOpenRow = vi.fn();
    const onClose = vi.fn();
    render(
      <IssuesPanel
        issues={[
          {
            id: 'issue-1',
            targetPath: 'Order.Id',
            severity: 'error',
            message: 'Order.Id is required',
          },
        ]}
        onClose={onClose}
        onOpenRow={onOpenRow}
      />,
    );

    fireEvent.click(screen.getByTestId('issue-row-issue-1'));
    expect(onOpenRow).toHaveBeenCalledWith('Order.Id');
  });
});
