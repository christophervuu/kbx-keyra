import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { AppError } from '@/lib/state/app-error';
import { toAppError } from '@/lib/state/app-error';
import type { SchemaDetail } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IngestionPollingStatus = 'polling' | 'ready' | 'error' | 'timeout' | 'idle';

export interface UseIngestionPollingResult {
  status: IngestionPollingStatus;
  schema: SchemaDetail | null;
  error: AppError | null;
  /** Start polling for the given schemaId. No-op if already polling. */
  startPolling: (schemaId: string) => void;
  /** Reset back to idle (e.g. to allow re-upload). */
  reset: () => void;
}

export interface UseIngestionPollingOptions {
  /** Interval between polls in ms. Default: 2000 */
  intervalMs?: number;
  /** Total timeout in ms before giving up. Default: 300_000 (5 min) */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Polls `adapter.getSchema(schemaId)` at a fixed interval until the schema
 * status transitions from `"ingesting"` to `"ready"` or `"error"`, or until
 * the configured timeout elapses.
 *
 * Cleans up the interval on unmount or when `reset()` is called.
 */
export function useIngestionPolling(
  options: UseIngestionPollingOptions = {},
): UseIngestionPollingResult {
  const { intervalMs = 2_000, timeoutMs = 300_000 } = options;

  const adapter = useAdapter();

  const [status, setStatus] = useState<IngestionPollingStatus>('idle');
  const [schema, setSchema] = useState<SchemaDetail | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // Refs so interval callback always sees latest values without re-registering
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schemaIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stopTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopTimers();
    schemaIdRef.current = null;
    if (isMountedRef.current) {
      setStatus('idle');
      setSchema(null);
      setError(null);
    }
  }, [stopTimers]);

  const startPolling = useCallback(
    (schemaId: string) => {
      // No-op if already polling this id
      if (schemaIdRef.current === schemaId && intervalRef.current !== null) return;

      stopTimers();
      schemaIdRef.current = schemaId;

      if (isMountedRef.current) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: startPolling is called imperatively, not inside an effect body
        setStatus('polling');
        setSchema(null);
        setError(null);
      }

      // Kick off the poll immediately, then repeat on interval
      const poll = async () => {
        if (!isMountedRef.current || schemaIdRef.current !== schemaId) return;

        try {
          const detail = await adapter.getSchema(schemaId);
          if (!isMountedRef.current || schemaIdRef.current !== schemaId) return;

          const ingestStatus = detail.metadata.status;

          if (ingestStatus === 'ready') {
            stopTimers();
            setStatus('ready');
            setSchema(detail);
          } else if (ingestStatus === 'error') {
            stopTimers();
            setStatus('error');
            setSchema(detail);
          }
          // 'ingesting' → keep polling
        } catch (err) {
          // Individual poll failures are non-fatal — HTTP client retry handles
          // transient errors. Only surface if we're still polling.
          if (!isMountedRef.current || schemaIdRef.current !== schemaId) return;
          const appErr = toAppError(err);
          // Stop on hard errors (not retryable network blips)
          if (!appErr.retryable) {
            stopTimers();
            setStatus('error');
            setError(appErr);
          }
        }
      };

      void poll();
      intervalRef.current = setInterval(() => void poll(), intervalMs);

      // Global timeout
      timeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current || schemaIdRef.current !== schemaId) return;
        stopTimers();
        setStatus('timeout');
      }, timeoutMs);
    },
    [adapter, intervalMs, timeoutMs, stopTimers],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, [stopTimers]);

  return { status, schema, error, startPolling, reset };
}
