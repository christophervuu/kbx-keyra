import type { ExecutionResult } from '@keyra/engine';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { PreviewContextValue } from '../../../lib/types/domain';

// ---------------------------------------------------------------------------
// Dispatch (setters) context type
// ---------------------------------------------------------------------------

export interface PreviewContextSetters {
  /** Set the current valid parsed source data (null if input is invalid) */
  setSourceData: (value: unknown | null) => void;
  /** Set whether an execution is in progress */
  setIsExecuting: (value: boolean) => void;
  /** Set the last execution result (null when cleared or not yet run) */
  setLastResult: (value: ExecutionResult | null) => void;
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

/**
 * Read-only context — consumed by any panel that needs to read preview state.
 */
export const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Setters context — consumed by the panel that drives preview state updates
 * (e.g. SourceDataInput / usePreviewExecution).
 */
export const PreviewSettersContext = createContext<PreviewContextSetters | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PreviewProviderProps {
  children: ReactNode;
  /** Optional externally controlled source data (e.g. selected sample payload) */
  sourceData?: unknown | null;
}

/**
 * Provides `PreviewContext` (read) and `PreviewSettersContext` (write) to the
 * Mapping Editor panel subtree.
 *
 * Initial state: idle — no source data, not executing, no last result.
 * T-04 will wire `usePreviewExecution` into the setters to drive state updates.
 */
export function PreviewProvider({ children, sourceData: controlledSourceData }: PreviewProviderProps) {
  const [internalSourceData, setInternalSourceData] = useState<unknown | null>(controlledSourceData ?? null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);

  const sourceData = controlledSourceData !== undefined ? controlledSourceData : internalSourceData;

  const value: PreviewContextValue = { sourceData, isExecuting, lastResult };

  const setters: PreviewContextSetters = {
    setSourceData: (value) => {
      if (controlledSourceData === undefined) {
        setInternalSourceData(value);
      }
    },
    setIsExecuting,
    setLastResult,
  };

  return (
    <PreviewContext.Provider value={value}>
      <PreviewSettersContext.Provider value={setters}>
        {children}
      </PreviewSettersContext.Provider>
    </PreviewContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * Returns the current preview state.
 * Throws a descriptive error if used outside `<PreviewProvider>`.
 */
export function usePreviewContext(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (ctx === null) {
    throw new Error(
      'usePreviewContext() must be used within a <PreviewProvider>. ' +
        'Ensure the component is rendered inside the Mapping Editor panel grid.',
    );
  }
  return ctx;
}

/**
 * Returns the preview state setter functions.
 * Throws a descriptive error if used outside `<PreviewProvider>`.
 */
export function usePreviewSetters(): PreviewContextSetters {
  const ctx = useContext(PreviewSettersContext);
  if (ctx === null) {
    throw new Error(
      'usePreviewSetters() must be used within a <PreviewProvider>. ' +
        'Ensure the component is rendered inside the Mapping Editor panel grid.',
    );
  }
  return ctx;
}
