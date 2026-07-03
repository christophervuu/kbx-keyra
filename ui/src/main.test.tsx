import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdapterProvider, createAdapter, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';

function AppStub() {
  return <div data-testid="app-stub">app</div>;
}

describe('main bootstrap providers', () => {
  it('renders app under QueryClientProvider + AdapterProvider with local adapter', () => {
    const adapter = createAdapter(undefined);
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>
          <AppStub />
        </AdapterProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('app-stub')).toBeInTheDocument();
  });

  it('renders app under QueryClientProvider + AdapterProvider with http adapter', () => {
    const adapter: ApiAdapter = createAdapter('http://localhost:4000');
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>
          <AppStub />
        </AdapterProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('app-stub')).toBeInTheDocument();
  });
});
