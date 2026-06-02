import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api/adapter-provider';
import type { SuggestExpressionInput, SuggestExpressionResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OFFLINE_MODE_FRAGMENT = 'offline mode';
const RATE_LIMIT_FRAGMENT = 'temporarily busy';
const RATE_LIMIT_FRAGMENT_ALT = 'rate limit';
const NETWORK_ERROR_FRAGMENT = 'Could not reach';
const UNEXPECTED_RESPONSE_FRAGMENT = 'unexpected response';
const FEATURE_NOT_ENABLED_FRAGMENT = 'not enabled in this mode';
const FEATURE_NOT_ENABLED_CODE = 'FEATURE_NOT_ENABLED';
const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';
const OFFLINE_USER_MESSAGE = 'Suggest Expression is not available in offline mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SuggestExpressionState {
  status: 'idle' | 'inputting' | 'loading' | 'success' | 'error';
  result: SuggestExpressionResult | null;
  error: string | null;
}

export interface UseSuggestExpressionReturn {
  state: SuggestExpressionState;
  /** Open the input area (transition idle → inputting) */
  openInput: () => void;
  /** Submit instruction to generate a suggestion */
  generate: (input: SuggestExpressionInput) => void;
  /** Dismiss the panel (close input or result) — aborts in-flight */
  dismiss: () => void;
  /** Reset state when target changes — aborts in-flight */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapErrorToMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === FEATURE_NOT_ENABLED_CODE || message.includes(FEATURE_NOT_ENABLED_FRAGMENT)) {
    return message;
  }

  if (message.includes(OFFLINE_MODE_FRAGMENT)) {
    return OFFLINE_USER_MESSAGE;
  }

  if (
    message.includes(RATE_LIMIT_FRAGMENT) ||
    message.includes(RATE_LIMIT_FRAGMENT_ALT)
  ) {
    return message;
  }

  if (message.includes(NETWORK_ERROR_FRAGMENT)) {
    return message;
  }

  if (message.includes(UNEXPECTED_RESPONSE_FRAGMENT)) {
    return message;
  }

  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const IDLE_STATE: SuggestExpressionState = { status: 'idle', result: null, error: null };

/**
 * Manages the async lifecycle for `adapter.suggestExpression()`.
 *
 * State machine:
 *   idle → openInput() → inputting
 *   inputting → generate(input) → loading
 *   loading → success | error
 *   success | error → dismiss() → idle
 *   any → reset() → idle  (aborts in-flight)
 *   any → openInput() → inputting  (aborts in-flight, clears result)
 *
 * The hook does NOT own the instruction text — that is the component's responsibility.
 *
 * Must be rendered inside an `<AdapterProvider>`.
 */
export function useSuggestExpression(): UseSuggestExpressionReturn {
  const adapter = useAdapter();

  const [state, setState] = useState<SuggestExpressionState>(IDLE_STATE);

  // Stable ref to the current adapter so callbacks don't need to re-create
  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  });

  // Ref to the current AbortController so we can cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const openInput = useCallback((): void => {
    // Abort any in-flight request (e.g. user re-opens while loading)
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState({ status: 'inputting', result: null, error: null });
  }, []);

  const generate = useCallback((input: SuggestExpressionInput): void => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ status: 'loading', result: null, error: null });

    void (async () => {
      try {
        const result = await adapterRef.current.suggestExpression(input);

        // Guard: if this request was aborted (e.g. dismiss() or reset()),
        // do not update state
        if (controller.signal.aborted) return;

        setState({ status: 'success', result, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;

        setState({ status: 'error', result: null, error: mapErrorToMessage(err) });
      }
    })();
  }, []);

  const dismiss = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(IDLE_STATE);
  }, []);

  const reset = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(IDLE_STATE);
  }, []);

  return { state, openInput, generate, dismiss, reset };
}
