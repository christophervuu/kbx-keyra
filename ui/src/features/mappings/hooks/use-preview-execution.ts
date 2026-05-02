import { useCallback, useEffect, useRef, useState } from 'react';

import { executeMapping } from '@/lib/engine';
import type { ExecutionResult } from '@/lib/engine';
import type { MappingConfig, PreviewExecutionState, SchemaDetail } from '@/lib/types/domain';
import { usePreviewSetters } from '../context/preview-context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_RUN_DEBOUNCE_MS = 500;
const EXECUTION_TIMEOUT_MS = 2000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ParseSuccess = { readonly ok: true; readonly data: unknown };
type ParseFailure = { readonly ok: false; readonly error: string };

function tryParseJson(raw: string): ParseSuccess | ParseFailure {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

// ---------------------------------------------------------------------------
// Hook params / return types
// ---------------------------------------------------------------------------

export interface UsePreviewExecutionParams {
  /** Current mapping config (in-memory, may include unsaved rule edits) */
  config: MappingConfig | null;
  /** Loaded source schema detail — provides raw schema content for the engine */
  sourceSchemaDetail: SchemaDetail | null;
  /** Loaded target schema detail — provides raw schema content for the engine */
  targetSchemaDetail: SchemaDetail | null;
  /**
   * Raw JSON string entered by the user.
   * Pass `null` when the input is invalid (failed client-side JSON parse) or
   * when no data has been entered yet.
   */
  sourceDataRaw: string | null;
}

export interface UsePreviewExecutionResult {
  /** Current execution lifecycle state */
  state: PreviewExecutionState;
  /** Manually trigger an execution run */
  run: () => void;
  /** Whether auto-run mode is enabled */
  autoRun: boolean;
  /** Enable or disable auto-run mode */
  setAutoRun: (enabled: boolean) => void;
  /** Whether to request trace output from the engine */
  traceEnabled: boolean;
  /** Enable or disable trace collection */
  setTraceEnabled: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates mapping execution lifecycle for the Preview panel.
 *
 * Features:
 * - Manual trigger via `run()`
 * - Auto-run with 500ms debounce when `config.rules` or `sourceDataRaw` changes
 * - 2-second duration guard: if execution takes > 2s, reports `timeout`
 * - Trace collection toggle (passes `{ trace: true }` to engine when enabled)
 * - Publishes valid `sourceData` and `lastResult` to `PreviewContext` via `usePreviewSetters()`
 *
 * Guards — execution is skipped when any of the following are null:
 * - `config`
 * - `sourceSchemaDetail`
 * - `targetSchemaDetail`
 * - `sourceDataRaw`
 *
 * Must be rendered inside a `<PreviewProvider>`.
 */
export function usePreviewExecution({
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  sourceDataRaw,
}: UsePreviewExecutionParams): UsePreviewExecutionResult {
  const [state, setState] = useState<PreviewExecutionState>({ status: 'idle' });
  const [autoRun, setAutoRun] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(false);

  const { setSourceData, setIsExecuting, setLastResult } = usePreviewSetters();

  // -------------------------------------------------------------------------
  // Sync valid sourceData into PreviewContext whenever sourceDataRaw changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (sourceDataRaw === null) {
      setSourceData(null);
      return;
    }
    const parsed = tryParseJson(sourceDataRaw);
    setSourceData(parsed.ok ? parsed.data : null);
  }, [sourceDataRaw, setSourceData]);

  // -------------------------------------------------------------------------
  // Core execution logic
  // -------------------------------------------------------------------------

  /**
   * Capture mutable references to the current params so the auto-run effect
   * can call executeNow without stale closure issues while keeping effect deps
   * minimal (only fire on data/rules changes, not on traceEnabled changes).
   */
  const latestParams = useRef({
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    traceEnabled,
    setSourceData,
    setIsExecuting,
    setLastResult,
  });
  latestParams.current = {
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    traceEnabled,
    setSourceData,
    setIsExecuting,
    setLastResult,
  };

  const executeNow = useCallback(() => {
    const {
      config: cfg,
      sourceSchemaDetail: srcSchema,
      targetSchemaDetail: tgtSchema,
      sourceDataRaw: rawData,
      traceEnabled: trace,
      setIsExecuting: setExec,
      setLastResult: setResult,
    } = latestParams.current;

    // Guard: all inputs must be present
    if (cfg === null || srcSchema === null || tgtSchema === null || rawData === null) {
      return;
    }

    // Guard: source data must be valid JSON
    const parsed = tryParseJson(rawData);
    if (!parsed.ok) {
      return;
    }

    setState({ status: 'executing' });
    setExec(true);

    const start = Date.now();

    try {
      const result: ExecutionResult = executeMapping(
        cfg,
        parsed.data,
        srcSchema.content,
        tgtSchema.content,
        trace ? { trace: true } : undefined,
      );

      const elapsed = Date.now() - start;

      if (elapsed > EXECUTION_TIMEOUT_MS) {
        setState({ status: 'timeout' });
        setResult(null);
      } else {
        setState({ status: 'success', result });
        setResult(result);
      }
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Execution failed — internal error',
      });
      setResult(null);
    } finally {
      setExec(false);
    }
  }, []); // stable ref pattern — deps accessed via latestParams.current

  // -------------------------------------------------------------------------
  // Auto-run: debounce execution on rule or data changes
  // -------------------------------------------------------------------------

  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    if (autoRunTimerRef.current !== null) {
      clearTimeout(autoRunTimerRef.current);
    }

    autoRunTimerRef.current = setTimeout(() => {
      autoRunTimerRef.current = null;
      executeNow();
    }, AUTO_RUN_DEBOUNCE_MS);

    return () => {
      if (autoRunTimerRef.current !== null) {
        clearTimeout(autoRunTimerRef.current);
        autoRunTimerRef.current = null;
      }
    };
    // Intentionally omitting executeNow from deps — it is stable and accessed
    // via the ref pattern. This effect should only fire when data inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, config?.rules, sourceDataRaw]);

  // -------------------------------------------------------------------------
  // Manual run
  // -------------------------------------------------------------------------

  const run = useCallback(() => {
    executeNow();
  }, [executeNow]);

  return { state, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled };
}
