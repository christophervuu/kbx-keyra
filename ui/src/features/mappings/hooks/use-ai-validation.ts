import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api/adapter-provider';
import type { ValidateMappingsInput, ValidationReport } from '@/lib/types';

const OFFLINE_MODE_FRAGMENT = 'offline mode';
const RATE_LIMIT_FRAGMENT = 'temporarily busy';
const RATE_LIMIT_FRAGMENT_ALT = 'rate limit';
const NETWORK_ERROR_FRAGMENT = 'Could not reach';
const UNEXPECTED_RESPONSE_FRAGMENT = 'unexpected response';
const FEATURE_NOT_ENABLED_FRAGMENT = 'not enabled in this mode';
const FEATURE_NOT_ENABLED_CODE = 'FEATURE_NOT_ENABLED';
const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';
const OFFLINE_USER_MESSAGE = 'AI Validation is not available in offline mode';

export interface AiValidationState {
  status: 'idle' | 'loading' | 'success' | 'error';
  report: ValidationReport | null;
  error: string | null;
}

export interface UseAiValidationReturn {
  state: AiValidationState;
  run: (input: ValidateMappingsInput) => void;
  retry: () => void;
  reset: () => void;
}

const IDLE_STATE: AiValidationState = {
  status: 'idle',
  report: null,
  error: null,
};

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

function cloneInput(input: ValidateMappingsInput): ValidateMappingsInput {
  return {
    mappingId: input.mappingId,
    sampleData: input.sampleData ? { ...input.sampleData } : undefined,
  };
}

export function useAiValidation(): UseAiValidationReturn {
  const adapter = useAdapter();
  const [state, setState] = useState<AiValidationState>(IDLE_STATE);

  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const lastInputRef = useRef<ValidateMappingsInput | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const run = useCallback((input: ValidateMappingsInput): void => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastInputRef.current = cloneInput(input);

    setState({ status: 'loading', report: null, error: null });

    void (async () => {
      try {
        const report = await adapterRef.current.validateMappings(input);

        if (controller.signal.aborted) {
          return;
        }

        setState({ status: 'success', report, error: null });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: 'error',
          report: null,
          error: mapErrorToMessage(err),
        });
      }
    })();
  }, []);

  const retry = useCallback((): void => {
    if (!lastInputRef.current) {
      return;
    }

    run(lastInputRef.current);
  }, [run]);

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
    reset,
  };
}
