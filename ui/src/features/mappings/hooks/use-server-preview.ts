import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api/adapter-provider';
import type { Environment, ServerPreviewResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_PREVIEW_TIMEOUT_MS = 10_000;
const OFFLINE_MODE_ERROR_FRAGMENT = 'Not available in offline mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseServerPreviewParams {
  /** ID of the mapping to preview */
  mappingId: string;
  /** Target environment for the server-side execution */
  environment: Environment;
}

export interface UseServerPreviewReturn {
  /**
   * Trigger a server-side preview execution.
   * Resolves when the call completes (success, timeout, or error).
   */
  execute: (sourceData: Record<string, unknown>) => Promise<void>;
  /** Last successful result, or `null` if not yet run / errored */
  result: ServerPreviewResult | null;
  /** `true` while a call is in-flight */
  isExecuting: boolean;
  /** User-facing error message, or `null` when no error */
  error: string | null;
  /**
   * Whether server preview is available.
   * Starts `true`; set to `false` (sticky) on the first "Not available in
   * offline mode" error (Phase 0 detection).
   */
  isAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Wraps `adapter.previewOnServer()` with:
 * - Phase 0 availability detection (passive — caught on first call)
 * - 10-second timeout protection via `Promise.race`
 * - Typed result storage
 * - Stable `execute` callback (memoized, accesses params via ref)
 *
 * Must be rendered inside an `<AdapterProvider>`.
 */
export function useServerPreview({
  mappingId,
  environment,
}: UseServerPreviewParams): UseServerPreviewReturn {
  const adapter = useAdapter();

  const [result, setResult] = useState<ServerPreviewResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);

  // Keep latest params accessible inside the stable callback without
  // re-creating it on every render. Updated via effect to satisfy react-hooks/refs.
  const paramsRef = useRef({ adapter, mappingId, environment });
  useEffect(() => {
    paramsRef.current = { adapter, mappingId, environment };
  });

  const execute = useCallback(async (sourceData: Record<string, unknown>): Promise<void> => {
    const { adapter: adp, mappingId: id, environment: env } = paramsRef.current;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('__timeout__')),
        SERVER_PREVIEW_TIMEOUT_MS,
      ),
    );

    try {
      const serverResult = await Promise.race([
        adp.previewOnServer(id, { environment: env, sourceData }),
        timeoutPromise,
      ]);

      setResult(serverResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message === '__timeout__') {
        setError('Server preview timed out after 10 seconds');
      } else if (message.includes(OFFLINE_MODE_ERROR_FRAGMENT)) {
        setIsAvailable(false);
        setError('Server preview is not available in offline mode');
      } else {
        setError(message || 'Server preview failed');
      }
    } finally {
      setIsExecuting(false);
    }
  }, []); // stable — all deps accessed via paramsRef

  return { execute, result, isExecuting, error, isAvailable };
}
