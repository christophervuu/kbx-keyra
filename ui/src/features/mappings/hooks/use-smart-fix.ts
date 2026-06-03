import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api/adapter-provider';
import type { SmartFixInput, SmartFixResult } from '@/lib/types';

const OFFLINE_MODE_FRAGMENT = 'offline mode';
const RATE_LIMIT_FRAGMENT = 'temporarily busy';
const RATE_LIMIT_FRAGMENT_ALT = 'rate limit';
const NETWORK_ERROR_FRAGMENT = 'Could not reach';
const UNEXPECTED_RESPONSE_FRAGMENT = 'unexpected response';
const FEATURE_NOT_ENABLED_FRAGMENT = 'not enabled in this mode';
const FEATURE_NOT_ENABLED_CODE = 'FEATURE_NOT_ENABLED';
const CONFLICT_CODE = 'CONFLICT';
const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';
const OFFLINE_USER_MESSAGE = 'Smart Fix is not available in offline mode';

type SmartFixStatus =
  | 'idle'
  | 'loading'
  | 'success-valid'
  | 'success-invalid'
  | 'stale-mismatch'
  | 'error';

export interface SmartFixState {
  /**
   * Lifecycle status.
   * - success-valid: validation-valid suggestion (eligible for one-click apply)
   * - success-invalid: suggestion returned but fails validation; edit-to-valid required
   * - stale-mismatch: snapshot conflict (ruleVersion/ruleHash mismatch), rerun required
   */
  status: SmartFixStatus;
  result: SmartFixResult | null;
  error: string | null;
}

export interface UseSmartFixReturn {
  state: SmartFixState;
  /** Trigger Smart Fix generation for a rule diagnostic context. */
  run: (input: SmartFixInput) => void;
  /** Retry the last Smart Fix request payload, if one exists. */
  retry: () => void;
  /** Re-run Smart Fix using a latest rule snapshot payload after stale-mismatch. */
  rerunOnLatest: (input: SmartFixInput) => void;
  /** Dismiss current Smart Fix state/result and return to idle. */
  dismiss: () => void;
  /** Reset hook state and clear remembered last request payload. */
  reset: () => void;
}

const IDLE_STATE: SmartFixState = {
  status: 'idle',
  result: null,
  error: null,
};

/** Normalize unknown thrown values to a string message. */
function asErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) {
    return undefined;
  }

  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorStatusCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('statusCode' in err)) {
    return undefined;
  }

  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

/**
 * Stale mismatch classifier for Smart Fix apply-guard conflicts.
 * Treat canonical CONFLICT/409 responses as stale to drive re-run UX.
 */
function isStaleMismatchError(err: unknown): boolean {
  const message = asErrorMessage(err).toLowerCase();
  const code = getErrorCode(err);
  const statusCode = getErrorStatusCode(err);

  if (code === CONFLICT_CODE || statusCode === 409) {
    return true;
  }

  return (
    message.includes('stale')
    || message.includes('rule hash mismatch')
    || message.includes('re-run fix on latest rule')
  );
}

/** Map adapter/runtime errors to user-facing Smart Fix messages. */
function mapErrorToMessage(err: unknown): string {
  const message = asErrorMessage(err);
  const code = getErrorCode(err);

  if (code === CONFLICT_CODE) {
    return message;
  }

  if (code === FEATURE_NOT_ENABLED_CODE || message.includes(FEATURE_NOT_ENABLED_FRAGMENT)) {
    return message;
  }

  if (message.includes(OFFLINE_MODE_FRAGMENT)) {
    return OFFLINE_USER_MESSAGE;
  }

  if (message.includes(RATE_LIMIT_FRAGMENT) || message.includes(RATE_LIMIT_FRAGMENT_ALT)) {
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

/**
 * Clone Smart Fix input so retry paths cannot accidentally mutate caller-owned objects.
 */
function cloneSmartFixInput(input: SmartFixInput): SmartFixInput {
  return {
    ...input,
    diagnostics: input.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

export function useSmartFix(): UseSmartFixReturn {
  const adapter = useAdapter();

  const [state, setState] = useState<SmartFixState>(IDLE_STATE);

  // Tracks whether hook is still mounted to avoid state updates after unmount.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const lastInputRef = useRef<SmartFixInput | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runInternal = useCallback((input: SmartFixInput): void => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastInputRef.current = cloneSmartFixInput(input);

    setState({ status: 'loading', result: null, error: null });

    void (async () => {
      try {
        const result = await adapterRef.current.smartFix(input);
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        const isValid = result.validation.valid === true && result.readyToApply === true;
        setState({
          status: isValid ? 'success-valid' : 'success-invalid',
          result,
          error: null,
        });
      } catch (err) {
        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (isStaleMismatchError(err)) {
          setState({
            status: 'stale-mismatch',
            result: null,
            error: asErrorMessage(err),
          });
          return;
        }

        setState({
          status: 'error',
          result: null,
          error: mapErrorToMessage(err),
        });
      }
    })();
  }, []);

  // Public command: invoke Smart Fix with provided diagnostic/rule context.
  const run = useCallback((input: SmartFixInput): void => {
    runInternal(input);
  }, [runInternal]);

  // Public command: replay the latest request payload for retry UX.
  const retry = useCallback((): void => {
    if (!lastInputRef.current) {
      return;
    }

    runInternal(lastInputRef.current);
  }, [runInternal]);

  // Public command: execute Smart Fix against a refreshed latest snapshot payload.
  const rerunOnLatest = useCallback((input: SmartFixInput): void => {
    runInternal(input);
  }, [runInternal]);

  // Public command: clear current result/error while keeping last input for retry.
  const dismiss = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(IDLE_STATE);
  }, []);

  // Public command: full reset; clears current state and last-input retry memory.
  const reset = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    lastInputRef.current = null;
    setState(IDLE_STATE);
  }, []);

  return {
    state,
    run,
    retry,
    rerunOnLatest,
    dismiss,
    reset,
  };
}
