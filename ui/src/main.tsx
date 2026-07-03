import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';

import { AdapterProvider, createAdapter, createQueryClient } from '@/lib/api';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

const adapter = createAdapter();
const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <App />
      </AdapterProvider>
    </QueryClientProvider>
  </StrictMode>,
);
