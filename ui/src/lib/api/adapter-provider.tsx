import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { ApiAdapter } from './types';

interface AdapterProviderProps {
  adapter: ApiAdapter;
  children: ReactNode;
}

const AdapterContext = createContext<ApiAdapter | null>(null);

export function AdapterProvider({ adapter, children }: AdapterProviderProps) {
  return <AdapterContext.Provider value={adapter}>{children}</AdapterContext.Provider>;
}

export function useAdapter(): ApiAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) {
    throw new Error('useAdapter must be used within an AdapterProvider');
  }

  return adapter;
}
