import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

interface PreviewContextOptions {
  readonly contextId: string | null;
  readonly targetOutputFormat: string;
  readonly enrichmentIdentity: string;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function normalizeEnrichmentIdentity(raw: string | null | undefined): string {
  if (raw == null) {
    return '{}';
  }

  const parsed = tryParseJson(raw);
  if (!parsed.ok) {
    return `invalid:${raw.trim()}`;
  }

  if (typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
    return `invalid-shape:${raw.trim()}`;
  }

  return stableStringify(parsed.data);
}

function computePreviewContextKey(options: PreviewContextOptions): string {
  const { contextId, targetOutputFormat, enrichmentIdentity } = options;
  return stableStringify({
    contextId,
    targetOutputFormat,
    enrichmentIdentity,
  });
}

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
  /**
   * Execution lifecycle mode.
   * - `always` (default): existing behavior for Test Lab and preview surfaces.
   * - `output-controlled`: no auto-run while Output is inactive; changes mark dirty.
   */
  executionMode?: ExecutionMode;
  /** Whether Output view is currently active (used when executionMode='output-controlled'). */
  isOutputActive?: boolean;
  /** Context identifier (sample or input-set id) for stale-retention isolation. */
  previewContextId?: string | null;
  /** Target output format identity (for context isolation; defaults to json). */
  targetOutputFormat?: string;
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

type ExecutionMode = 'always' | 'output-controlled';

function isPromiseLike<T>(value: unknown): value is Promise<T> {
  return typeof value === 'object'
    && value !== null
    && 'then' in value
    && typeof (value as { then?: unknown }).then === 'function';
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
  executionMode = 'always',
  isOutputActive = true,
  previewContextId = null,
  targetOutputFormat = 'json',
}: UsePreviewExecutionParams): UsePreviewExecutionResult {
  const [state, setState] = useState<PreviewExecutionState>({ status: 'idle' });
  const [stateContextKey, setStateContextKey] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [traceEnabled, setTraceEnabled] = useState(false);

  const { setSourceData, setIsExecuting, setLastResult } = usePreviewSetters();
  const latestRunIdRef = useRef(0);
  const outputDirtyRef = useRef(false);
  const retainedSuccessByContextRef = useRef<Record<string, ExecutionResult>>({});
  const lastContextErrorResultRef = useRef<Record<string, string>>({});
  const lastObservedInputsRef = useRef({
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    externalSourcesRaw,
    requiredEnrichmentAliases,
    traceEnabled,
    currentContextKey: '',
  });

  const currentContextKey = useMemo(() => computePreviewContextKey({
    contextId: previewContextId,
    targetOutputFormat,
    enrichmentIdentity: normalizeEnrichmentIdentity(externalSourcesRaw),
  }), [previewContextId, targetOutputFormat, externalSourcesRaw]);

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
    executionMode,
    isOutputActive,
    currentContextKey,
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
      executionMode,
      isOutputActive,
      currentContextKey,
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
    executionMode,
    isOutputActive,
    currentContextKey,
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
      executionMode: mode,
      isOutputActive: outputActive,
      currentContextKey: contextKey,
      traceEnabled: trace,
      setIsExecuting: setExec,
      setLastResult: setResult,
    } = latestParams.current;

    if (fromAutoRun && mode === 'output-controlled' && !outputActive) {
      return;
    }

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
    const runId = ++latestRunIdRef.current;

    const commitIfCurrent = (commit: () => void) => {
      if (runId !== latestRunIdRef.current) {
        return;
      }
      commit();
    };

    const finalizeIfCurrent = () => {
      if (runId !== latestRunIdRef.current) {
        return;
      }
      setExec(false);
    };

    const applyResult = (result: ExecutionResult) => {
      const elapsed = Date.now() - start;

      if (elapsed > EXECUTION_TIMEOUT_MS) {
        commitIfCurrent(() => {
          setStateContextKey(contextKey);
          const nextRetained = { ...retainedSuccessByContextRef.current };
          nextRetained[contextKey] = result;
          retainedSuccessByContextRef.current = nextRetained;

          const nextErrors = { ...lastContextErrorResultRef.current };
          delete nextErrors[contextKey];
          lastContextErrorResultRef.current = nextErrors;
          setState({ status: 'timeout' });
          setResult(null);
        });
        return;
      }

      commitIfCurrent(() => {
        setStateContextKey(contextKey);
        const nextRetained = { ...retainedSuccessByContextRef.current };
        nextRetained[contextKey] = result;
        retainedSuccessByContextRef.current = nextRetained;

        const nextErrors = { ...lastContextErrorResultRef.current };
        delete nextErrors[contextKey];
        lastContextErrorResultRef.current = nextErrors;
        setState({ status: 'success', result });
        setResult(result);
      });
    };

    const applyError = (err: unknown) => {
      commitIfCurrent(() => {
        const message = err instanceof Error ? err.message : 'Execution failed — internal error';
        const retained = retainedSuccessByContextRef.current[contextKey] ?? null;
        const nextErrors = { ...lastContextErrorResultRef.current };
        nextErrors[contextKey] = message;
        lastContextErrorResultRef.current = nextErrors;

        if (retained !== null) {
          setStateContextKey(contextKey);
          setState({
            status: 'success',
            result: {
              ...retained,
              diagnostics: [
                ...(retained.diagnostics ?? []),
                {
                  code: 'W_INLINE_OUTPUT_STALE',
                  severity: 'warning',
                  message: `Showing previous output for this context because the latest run failed: ${message}`,
                },
              ],
            },
          });
          setResult(retained);
          return;
        }

        setStateContextKey(contextKey);
        setState({
          status: 'error',
          error: message,
        });
        setResult(null);
      });
    };

    try {
      const outcome = executeMapping(cfg, parsed.data, srcSchema.content, tgtSchema.content, {
        ...(trace ? { trace: true } : {}),
        externalSources,
      });

      if (isPromiseLike<ExecutionResult>(outcome)) {
        void outcome
          .then((result) => {
            applyResult(result);
          })
          .catch((err: unknown) => {
            applyError(err);
          })
          .finally(() => {
            finalizeIfCurrent();
          });
      } else {
        applyResult(outcome as ExecutionResult);
        finalizeIfCurrent();
      }
    } catch (err) {
      applyError(err);
      finalizeIfCurrent();
    }
  }, []); // stable ref pattern — deps accessed via latestParams.current

  // -------------------------------------------------------------------------
  // Auto-run: debounce execution on rule or data changes
  // -------------------------------------------------------------------------

  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const previousObserved = lastObservedInputsRef.current;
    const currentObserved = {
      config,
      sourceSchemaDetail,
      targetSchemaDetail,
      sourceDataRaw,
      externalSourcesRaw,
      requiredEnrichmentAliases,
      traceEnabled,
      currentContextKey,
    };
    const outputInputsChanged =
      previousObserved.config !== currentObserved.config
      || previousObserved.sourceSchemaDetail !== currentObserved.sourceSchemaDetail
      || previousObserved.targetSchemaDetail !== currentObserved.targetSchemaDetail
      || previousObserved.sourceDataRaw !== currentObserved.sourceDataRaw
      || previousObserved.externalSourcesRaw !== currentObserved.externalSourcesRaw
      || previousObserved.requiredEnrichmentAliases !== currentObserved.requiredEnrichmentAliases
      || previousObserved.traceEnabled !== currentObserved.traceEnabled
      || previousObserved.currentContextKey !== currentObserved.currentContextKey;
    lastObservedInputsRef.current = currentObserved;

    if (!autoRun) {
      return;
    }

    if (executionMode === 'output-controlled') {
      if (!isOutputActive) {
        if (outputInputsChanged) {
          outputDirtyRef.current = true;
        }
        if (autoRunTimerRef.current !== null) {
          clearTimeout(autoRunTimerRef.current);
          autoRunTimerRef.current = null;
        }
        return;
      }

      if (outputDirtyRef.current) {
        outputDirtyRef.current = false;
        executeNow({ fromAutoRun: true });
        return;
      }
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
  }, [
    autoRun,
    executionMode,
    isOutputActive,
    executeNow,
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    externalSourcesRaw,
    requiredEnrichmentAliases,
    traceEnabled,
    currentContextKey,
  ]);

  // -------------------------------------------------------------------------
  // Manual run
  // -------------------------------------------------------------------------

  const run = useCallback(() => {
    executeNow();
  }, [executeNow]);

  const visibleState = useMemo<PreviewExecutionState>(() => {
    if (stateContextKey !== null && stateContextKey !== currentContextKey) {
      return { status: 'idle' };
    }
    return state;
  }, [currentContextKey, state, stateContextKey]);

  return { state: visibleState, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled };
}
