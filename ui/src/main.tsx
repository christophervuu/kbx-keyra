import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';

import { AdapterProvider, createAdapter } from '@/lib/api';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

const adapter = createAdapter();

createRoot(root).render(
  <StrictMode>
    <AdapterProvider adapter={adapter}>
      <App />
    </AdapterProvider>
  </StrictMode>,
);
