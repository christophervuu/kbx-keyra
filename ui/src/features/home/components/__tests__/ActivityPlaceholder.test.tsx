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

  it('renders "Recent Activity" heading', () => {
    render(<ActivityPlaceholder />);
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
  });

  it('renders placeholder text', () => {
    render(<ActivityPlaceholder />);
    expect(
      screen.getByText(/activity feed will appear here when event tracking is available/i),
    ).toBeInTheDocument();
  });
});
