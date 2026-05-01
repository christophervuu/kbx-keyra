import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { AdapterProvider, LocalStorageAdapter, useAdapter } from '@/lib/api';

describe('AdapterProvider and useAdapter', () => {
  it('returns adapter instance when inside provider', () => {
    const adapter = new LocalStorageAdapter();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
    );

    const { result } = renderHook(() => useAdapter(), { wrapper });
    expect(result.current).toBe(adapter);
  });

  it('throws when useAdapter is called outside provider', () => {
    const { result } = renderHook(() => {
      try {
        useAdapter();
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    });

    expect(result.current).toBe('useAdapter must be used within an AdapterProvider');
  });
});
