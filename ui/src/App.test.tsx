import { render, screen } from '@testing-library/react';

import App from './App';

describe('App smoke test', () => {
  it('renders the home dashboard within the app shell', () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    expect(screen.getByTestId('page-home-dashboard')).toBeInTheDocument();
    expect(screen.getByText('KeyRa')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});
