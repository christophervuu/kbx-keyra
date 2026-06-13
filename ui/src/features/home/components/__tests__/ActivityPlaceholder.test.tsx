// ActivityPlaceholder.test.tsx — Component tests (FS-049 T-07)

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityPlaceholder } from '../ActivityPlaceholder';

describe('ActivityPlaceholder', () => {
  it('renders data-testid="activity-placeholder" on root element', () => {
    render(<ActivityPlaceholder />);
    expect(screen.getByTestId('activity-placeholder')).toBeInTheDocument();
  });

  it('renders "Recent activity" heading', () => {
    render(<ActivityPlaceholder />);
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
  });

  it('renders empty placeholder text', () => {
    render(<ActivityPlaceholder />);
    expect(
      screen.getByText(/recent activity is not yet available/i),
    ).toBeInTheDocument();
  });

  it('renders item rows when activity items are provided', () => {
    render(
      <ActivityPlaceholder
        items={[
          {
            type: 'project',
            id: 'proj-1',
            name: 'Alpha Project',
            timestamp: new Date().toISOString(),
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: /alpha project/i })).toBeInTheDocument();
  });
});
