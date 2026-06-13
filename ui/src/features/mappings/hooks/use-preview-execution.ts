import { useCallback, useEffect, useRef, useState } from 'react';

import { usePreviewSetters } from '../context/preview-context';

import { executeMapping } from '@/lib/engine';
import type { ExecutionResult } from '@/lib/engine';
import type { MappingConfig, PreviewExecutionState, SchemaDetail } from '@/lib/types/domain';

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
  /** Optional raw JSON object string containing enrichment payloads by alias. */
  externalSourcesRaw?: string | null;
  /** Required enrichment aliases that must exist in externalSources payload. */
  requiredEnrichmentAliases?: readonly string[];
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

interface ExecuteOptions {
  readonly fromAutoRun?: boolean;
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
  externalSourcesRaw = null,
  requiredEnrichmentAliases = [],
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
    externalSourcesRaw,
    requiredEnrichmentAliases,
    traceEnabled,
    setSourceData,
    setIsExecuting,
    setLastResult,
  });
  useEffect(() => {
    latestParams.current = {
      config,
      sourceSchemaDetail,
      targetSchemaDetail,
      sourceDataRaw,
      externalSourcesRaw,
      requiredEnrichmentAliases,
      traceEnabled,
      setSourceData,
      setIsExecuting,
      setLastResult,
    };
  }, [
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    externalSourcesRaw,
    requiredEnrichmentAliases,
    traceEnabled,
    setSourceData,
    setIsExecuting,
    setLastResult,
  ]);

  const executeNow = useCallback((options?: ExecuteOptions) => {
    const fromAutoRun = options?.fromAutoRun === true;
    const {
      config: cfg,
      sourceSchemaDetail: srcSchema,
      targetSchemaDetail: tgtSchema,
      sourceDataRaw: rawData,
      externalSourcesRaw: rawExternalSources,
      requiredEnrichmentAliases: requiredAliases,
      traceEnabled: trace,
      setIsExecuting: setExec,
      setLastResult: setResult,
    } = latestParams.current;

    // Guard: all inputs must be present
    if (cfg === null || srcSchema === null || tgtSchema === null) {
      if (!fromAutoRun) {
        setState({
          status: 'error',
          error: 'Preview is not ready yet. Wait for mapping and schemas to finish loading, then run again.',
        });
        setResult(null);
      }
      return;
    }

    if (rawData === null) {
      if (!fromAutoRun) {
        setState({
          status: 'error',
          error: 'Source JSON is empty or invalid. Paste valid JSON, then run again.',
        });
        setResult(null);
      }
      return;
    }

    // Guard: source data must be valid JSON
    const parsed = tryParseJson(rawData);
    if (!parsed.ok) {
      if (!fromAutoRun) {
        setState({
          status: 'error',
          error: `Invalid JSON: ${parsed.error}`,
        });
        setResult(null);
      }
      return;
    }

    const parsedExternals = rawExternalSources === null
      ? { ok: true as const, data: {} as Record<string, unknown> }
      : tryParseJson(rawExternalSources);

    if (!parsedExternals.ok || typeof parsedExternals.data !== 'object' || parsedExternals.data === null || Array.isArray(parsedExternals.data)) {
      if (!fromAutoRun) {
        setState({
          status: 'error',
          error: parsedExternals.ok
            ? 'Enrichment samples must be a JSON object keyed by alias.'
            : `Invalid enrichment JSON: ${parsedExternals.error}`,
        });
        setResult(null);
      }
      return;
    }

    const externalSources = parsedExternals.data as Record<string, unknown>;
    const missingRequiredAliases = requiredAliases.filter((alias) => !(alias in externalSources));
    if (missingRequiredAliases.length > 0) {
      if (!fromAutoRun) {
        setState({
          status: 'error',
          error: `Missing required enrichment sample${missingRequiredAliases.length === 1 ? '' : 's'}: ${missingRequiredAliases.join(', ')}`,
        });
        setResult(null);
      }
      return;
    }

    setState({ status: 'executing' });
    setExec(true);

    const start = Date.now();

    try {
      const result: ExecutionResult = executeMapping(cfg, parsed.data, srcSchema.content, tgtSchema.content, {
        ...(trace ? { trace: true } : {}),
        externalSources,
      });

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
      executeNow({ fromAutoRun: true });
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
  }, [autoRun, config?.rules, sourceDataRaw, externalSourcesRaw]);

  // -------------------------------------------------------------------------
  // Manual run
  // -------------------------------------------------------------------------

  const run = useCallback(() => {
    executeNow();
  }, [executeNow]);

  return { state, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled };
}
