import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api/adapter-provider';
import type { ExplainRuleInput, ExplainRuleResult } from '@/lib/types';

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
const OFFLINE_USER_MESSAGE = 'Explain is not available in offline mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplainRuleState {
  status: 'idle' | 'loading' | 'success' | 'error';
  result: ExplainRuleResult | null;
  error: string | null;
}

export interface UseExplainRuleReturn {
  state: ExplainRuleState;
  explain: (input: ExplainRuleInput) => void;
  dismiss: () => void;
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

const IDLE_STATE: ExplainRuleState = { status: 'idle', result: null, error: null };

/**
 * Manages the async lifecycle for `adapter.explainRule()`.
 *
 * - Exposes `explain(input)` to trigger a request
 * - Exposes `dismiss()` to reset back to idle (and abort any in-flight request)
 * - Aborts in-flight requests on re-invocation and on unmount
 * - Maps adapter errors to user-friendly messages
 *
 * Must be rendered inside an `<AdapterProvider>`.
 */
export function useExplainRule(): UseExplainRuleReturn {
  const adapter = useAdapter();

  const [state, setState] = useState<ExplainRuleState>(IDLE_STATE);

  // Stable ref to the current adapter so the callback doesn't need to re-create
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

  const explain = useCallback((input: ExplainRuleInput): void => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ status: 'loading', result: null, error: null });

    void (async () => {
      try {
        const result = await adapterRef.current.explainRule(input);

        // Guard: if this request was aborted (e.g. dismiss() or re-explain()),
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

  return { state, explain, dismiss };
}
