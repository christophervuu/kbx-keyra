import { useCallback, useEffect, useReducer, useRef } from 'react';

import type { AsyncState } from '@/lib/state';
import { toAppError } from '@/lib/state';

export interface AsyncActions<T> {
  execute: (operation: AsyncOperation<T>) => void;
  refresh: (operation: AsyncOperation<T>) => void;
  retry: () => void;
  reset: () => void;
  markStale: () => void;
}

export type AsyncOperation<T> = Promise<T> | (() => Promise<T>);

type AsyncReducerAction<T> =
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: unknown }
  | { type: 'reset' }
  | { type: 'mark-stale' }
  | { type: 'refreshing' };

function asyncReducer<T>(state: AsyncState<T>, action: AsyncReducerAction<T>): AsyncState<T> {
  switch (action.type) {
    case 'loading': {
      return { status: 'loading' };
    }
    case 'success': {
      return { status: 'success', data: action.data, updatedAt: new Date() };
    }
    case 'error': {
      const appError = toAppError(action.error);
      return {
        status: 'error',
        error: appError,
        retryable: appError.retryable ?? true,
      };
    }
    case 'reset': {
      return { status: 'idle' };
    }
    case 'mark-stale': {
      if (state.status !== 'success') {
        return state;
      }

      return { status: 'stale', data: state.data, refreshing: false };
    }
    case 'refreshing': {
      if (state.status === 'stale') {
        return { ...state, refreshing: true };
      }

      if (state.status === 'success') {
        return { status: 'stale', data: state.data, refreshing: true };
      }

      return { status: 'loading' };
    }
    default: {
      return state;
    }
  }
}

export function useAsyncState<T>(): [AsyncState<T>, AsyncActions<T>] {
  const [state, dispatch] = useReducer(asyncReducer<T>, { status: 'idle' });
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const stateRef = useRef<AsyncState<T>>(state);
  const lastOperationRef = useRef<(() => Promise<T>) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    },
    [],
  );

  const applySuccess = useCallback((requestId: number, data: T) => {
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    dispatch({ type: 'success', data });
  }, []);

  const applyError = useCallback((requestId: number, error: unknown) => {
    if (!isMountedRef.current || requestId !== requestIdRef.current) {
      return;
    }

    dispatch({ type: 'error', error });
  }, []);

  const execute = useCallback(
    (operation: AsyncOperation<T>) => {
      const promise = resolveOperation(operation, lastOperationRef);
      const requestId = ++requestIdRef.current;
      dispatch({ type: 'loading' });

      void promise.then(
        (data) => applySuccess(requestId, data),
        (error) => applyError(requestId, error),
      );
    },
    [applyError, applySuccess],
  );

  const refresh = useCallback(
    (operation: AsyncOperation<T>) => {
      const promise = resolveOperation(operation, lastOperationRef);
      const requestId = ++requestIdRef.current;
      dispatch({ type: 'refreshing' });

      void promise.then(
        (data) => applySuccess(requestId, data),
        (error) => applyError(requestId, error),
      );
    },
    [applyError, applySuccess],
  );

  const retry = useCallback(() => {
    const currentState = stateRef.current;
    const lastOperation = lastOperationRef.current;

    if (currentState.status !== 'error' || !currentState.retryable || !lastOperation) {
      return;
    }

    execute(lastOperation);
  }, [execute]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    dispatch({ type: 'reset' });
  }, []);

  const markStale = useCallback(() => {
    dispatch({ type: 'mark-stale' });
  }, []);

  return [state, { execute, refresh, retry, reset, markStale }];
}

function resolveOperation<T>(
  operation: AsyncOperation<T>,
  lastOperationRef: { current: (() => Promise<T>) | null },
): Promise<T> {
  if (typeof operation === 'function') {
    lastOperationRef.current = operation;
    return operation();
  }

  lastOperationRef.current = null;
  return operation;
}
