// useViewMode — localStorage-persisted view mode hook (FS-014 T-07)

import { useCallback, useState } from 'react';

import type { ViewMode } from '../types';

const STORAGE_KEY = 'keyra:dashboard:viewMode';

function readStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'grid' || stored === 'table') return stored;
  } catch {
    // localStorage unavailable (SSR / private browsing)
  }
  return 'grid';
}

export interface UseViewModeResult {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function useViewMode(): UseViewModeResult {
  const [viewMode, setViewModeState] = useState<ViewMode>(readStoredViewMode);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore write errors
    }
  }, []);

  return { viewMode, setViewMode };
}
