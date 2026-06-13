import { useCallback, useEffect, useRef, useState } from 'react';

import { COMPARISON_MODES } from '../types';
import { useDeploymentContext } from './use-deployment-context';
import type { ModeAvailability } from './use-deployment-context';

import { useAdapter } from '@/lib/api/adapter-provider';
import { executeMapping } from '@/lib/engine';
import type {
  ComparisonMode,
  ComparisonSideMetadata,
  ComparisonSideResult,
  ComparisonState,
  Diagnostic,
  Environment,
  MappingConfig,
  SchemaDetail,
  ServerPreviewResult,
} from '@/lib/types';
import { computeDiff } from '@/lib/utils/json-diff';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLIENT_ENGINE_VERSION = 'client';
const SERVER_PREVIEW_TIMEOUT_MS = 10_000;
const OFFLINE_MODE_ERROR_FRAGMENT = 'Not available in offline mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseEnvironmentComparisonParams {
  mappingId: string;
  /** Working (in-memory) mapping config — may include unsaved changes */
  config: MappingConfig | null;
  sourceSchemaDetail: SchemaDetail | null;
  targetSchemaDetail: SchemaDetail | null;
  /** Raw JSON string from the source data input; null when empty or invalid */
  sourceDataRaw: string | null;
}

export interface UseEnvironmentComparisonReturn {
  /** Full comparison state including both sides and diff */
  state: ComparisonState | null;
  /** Currently selected comparison mode */
  mode: ComparisonMode;
  /** Change the active comparison mode (resets state to idle) */
  setMode: (mode: ComparisonMode) => void;
  /** Trigger a comparison run */
  runComparison: () => Promise<void>;
  /** Whether a comparison run can be started */
  canRun: boolean;
  /** Per-mode availability derived from deployment context */
  modeAvailability: (mode: ComparisonMode) => ModeAvailability;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tryParseJson(
  raw: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Source data must be a JSON object' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
}

function makeSideResult(
  label: string,
  status: ComparisonSideResult['status'],
  metadata: ComparisonSideMetadata,
  output?: Readonly<Record<string, unknown>> | null,
  diagnostics?: readonly Diagnostic[],
  error?: string,
): ComparisonSideResult {
  return {
    label,
    status,
    metadata,
    output: output ?? null,
    diagnostics: diagnostics ?? [],
    ...(error !== undefined ? { error } : {}),
  };
}

function makeExecutingSideResult(
  label: string,
  metadata: ComparisonSideMetadata,
): ComparisonSideResult {
  return makeSideResult(label, 'executing', metadata);
}

function placeholderMetadata(): ComparisonSideMetadata {
  return {
    executionContext: 'client',
    configVersion: 0,
    engineVersion: CLIENT_ENGINE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates two-sided comparison execution for the Compare tab.
 *
 * - Client sides: execute via `executeMapping()` (working config or fresh-loaded saved config)
 * - Server sides: call `adapter.previewOnServer()` directly with 10s timeout
 * - Both sides fire in parallel via `Promise.allSettled`
 * - Stale request cancellation via incrementing `runId` ref
 * - Diff computed via `computeDiff()` after both sides complete
 *
 * Must be rendered inside `<AdapterProvider>`.
 */
export function useEnvironmentComparison({
  mappingId,
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  sourceDataRaw,
}: UseEnvironmentComparisonParams): UseEnvironmentComparisonReturn {
  const adapter = useAdapter();

  const [mode, setModeState] = useState<ComparisonMode>('current-vs-saved');
  const [state, setState] = useState<ComparisonState | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Stale-request cancellation: each runComparison() increments this counter.
  const runIdRef = useRef(0);

  // Deployment context for mode availability
  const { isModeAvailable } = useDeploymentContext(mappingId);

  // Keep latest params accessible in the stable runComparison callback.
  // Updated via effect to satisfy react-hooks/refs.
  const paramsRef = useRef({
    adapter,
    mappingId,
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw,
    mode,
  });
  useEffect(() => {
    paramsRef.current = {
      adapter,
      mappingId,
      config,
      sourceSchemaDetail,
      targetSchemaDetail,
      sourceDataRaw,
      mode,
    };
  });

  const setMode = useCallback((newMode: ComparisonMode) => {
    setModeState(newMode);
    setState(null);
  }, []);

  const runComparison = useCallback(async (): Promise<void> => {
    const {
      adapter: adp,
      mappingId: id,
      config: cfg,
      sourceSchemaDetail: srcSchema,
      targetSchemaDetail: tgtSchema,
      sourceDataRaw: rawData,
      mode: currentMode,
    } = paramsRef.current;

    // Guard: source data required
    if (rawData === null) return;

    const parsed = tryParseJson(rawData);
    if (!parsed.ok) {
      const errMeta = placeholderMetadata();
      const modeConfig = COMPARISON_MODES[currentMode];
      setState({
        mode: currentMode,
        left: makeSideResult(modeConfig.left.label, 'error', errMeta, null, [], parsed.error),
        right: makeSideResult(modeConfig.right.label, 'error', errMeta, null, [], parsed.error),
        diffEntries: null,
        overallStatus: 'partial-error',
      });
      return;
    }

    const sourceData = parsed.data;

    // Increment run ID — captures this run's ID in closure
    runIdRef.current += 1;
    const myRunId = runIdRef.current;

    setIsExecuting(true);

    const modeConfig = COMPARISON_MODES[currentMode];
    const leftLabel = modeConfig.left.label;
    const rightLabel = modeConfig.right.label;

    // Set both sides to executing
    const execMeta = placeholderMetadata();
    setState({
      mode: currentMode,
      left: makeExecutingSideResult(leftLabel, execMeta),
      right: makeExecutingSideResult(rightLabel, execMeta),
      diffEntries: null,
      overallStatus: 'executing',
    });

    // -----------------------------------------------------------------------
    // Side execution helpers
    // -----------------------------------------------------------------------

    async function executeClientSide(
      label: string,
      sideConfig: MappingConfig,
      isWorking: boolean,
      savedAt?: string,
    ): Promise<ComparisonSideResult> {
      if (srcSchema === null || tgtSchema === null) {
        const meta: ComparisonSideMetadata = {
          executionContext: 'client',
          configVersion: sideConfig.version,
          engineVersion: sideConfig.engineVersion ?? CLIENT_ENGINE_VERSION,
        };
        return makeSideResult(label, 'error', meta, null, [], 'Schemas not loaded');
      }

      try {
        const result = executeMapping(
          sideConfig,
          sourceData,
          srcSchema.content,
          tgtSchema.content,
        );

        const output =
          result.output !== null &&
          typeof result.output === 'object' &&
          !Array.isArray(result.output)
            ? (result.output as Readonly<Record<string, unknown>>)
            : null;

        const diagnostics = result.diagnostics as readonly Diagnostic[];

        const meta: ComparisonSideMetadata = {
          executionContext: 'client',
          configVersion: sideConfig.version,
          engineVersion: sideConfig.engineVersion ?? CLIENT_ENGINE_VERSION,
          ...(isWorking ? { hasUnsavedChanges: true } : {}),
          ...(savedAt !== undefined ? { savedAt } : {}),
        };

        return makeSideResult(label, 'success', meta, output, diagnostics);
      } catch (err) {
        const meta: ComparisonSideMetadata = {
          executionContext: 'client',
          configVersion: sideConfig.version,
          engineVersion: sideConfig.engineVersion ?? CLIENT_ENGINE_VERSION,
        };
        const message = err instanceof Error ? err.message : 'Execution failed';
        return makeSideResult(label, 'error', meta, null, [], message);
      }
    }

    async function executeWorkingSide(label: string): Promise<ComparisonSideResult> {
      if (cfg === null) {
        return makeSideResult(
          label,
          'error',
          placeholderMetadata(),
          null,
          [],
          'Mapping config not loaded',
        );
      }
      return executeClientSide(label, cfg, true);
    }

    async function executeSavedSide(label: string): Promise<ComparisonSideResult> {
      try {
        const savedConfig = await adp.getMapping(id);
        return executeClientSide(label, savedConfig, false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load saved config';
        return makeSideResult(label, 'error', placeholderMetadata(), null, [], message);
      }
    }

    async function executeServerSide(
      label: string,
      environment: Environment,
    ): Promise<ComparisonSideResult> {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('__timeout__')), SERVER_PREVIEW_TIMEOUT_MS),
      );

      try {
        const serverResult: ServerPreviewResult = await Promise.race([
          adp.previewOnServer(id, { environment, sourceData }),
          timeoutPromise,
        ]);

        const meta: ComparisonSideMetadata = {
          executionContext: 'server',
          environment: serverResult.metadata.environment,
          configVersion: serverResult.metadata.sourceNumber,
          deployedAt: serverResult.metadata.deployedAt,
          sourceType: serverResult.metadata.sourceType,
          sourceNumber: serverResult.metadata.sourceNumber,
          artifactId: serverResult.metadata.artifactId,
          artifactHash: serverResult.metadata.artifactHash,
          engineVersion: serverResult.metadata.engineVersion,
        };

        return makeSideResult(
          label,
          'success',
          meta,
          serverResult.output,
          serverResult.diagnostics as readonly Diagnostic[],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const userMessage =
          message === '__timeout__'
            ? 'Server preview timed out after 10 seconds'
            : message.includes(OFFLINE_MODE_ERROR_FRAGMENT)
              ? 'Server preview is not available in offline mode'
              : message;

        const meta: ComparisonSideMetadata = {
          executionContext: 'server',
          environment,
          configVersion: 0,
          engineVersion: CLIENT_ENGINE_VERSION,
        };

        return makeSideResult(label, 'error', meta, null, [], userMessage);
      }
    }

    // -----------------------------------------------------------------------
    // Dispatch a side based on its config
    // -----------------------------------------------------------------------

    function dispatchSide(
      label: string,
      sideConfig: (typeof modeConfig)['left'],
    ): Promise<ComparisonSideResult> {
      if (sideConfig.context === 'server' && sideConfig.environment !== undefined) {
        return executeServerSide(label, sideConfig.environment);
      }

      // Client side — "Saved" label means load fresh from adapter
      if (label === 'Saved') {
        return executeSavedSide(label);
      }

      return executeWorkingSide(label);
    }

    // -----------------------------------------------------------------------
    // Execute both sides in parallel
    // -----------------------------------------------------------------------

    const [leftSettled, rightSettled] = await Promise.allSettled([
      dispatchSide(leftLabel, modeConfig.left),
      dispatchSide(rightLabel, modeConfig.right),
    ]);

    // Stale check — discard if a newer run has started
    if (runIdRef.current !== myRunId) {
      setIsExecuting(false);
      return;
    }

    const leftResult: ComparisonSideResult =
      leftSettled.status === 'fulfilled'
        ? leftSettled.value
        : makeSideResult(
            leftLabel,
            'error',
            placeholderMetadata(),
            null,
            [],
            String(leftSettled.reason),
          );

    const rightResult: ComparisonSideResult =
      rightSettled.status === 'fulfilled'
        ? rightSettled.value
        : makeSideResult(
            rightLabel,
            'error',
            placeholderMetadata(),
            null,
            [],
            String(rightSettled.reason),
          );

    // -----------------------------------------------------------------------
    // Compute diff
    // -----------------------------------------------------------------------

    const bothSucceeded =
      leftResult.status === 'success' && rightResult.status === 'success';

    const diffEntries = bothSucceeded
      ? computeDiff(leftResult.output, rightResult.output).entries
      : null;

    const overallStatus =
      leftResult.status === 'error' || rightResult.status === 'error'
        ? 'partial-error'
        : 'complete';

    setState({
      mode: currentMode,
      left: leftResult,
      right: rightResult,
      diffEntries,
      overallStatus,
    });

    setIsExecuting(false);
     
  }, []); // stable — all deps accessed via paramsRef

  // canRun: false when no source data, mode unavailable, or already executing
  const canRun =
    sourceDataRaw !== null && isModeAvailable(mode).available && !isExecuting;

  return {
    state,
    mode,
    setMode,
    runComparison,
    canRun,
    modeAvailability: isModeAvailable,
  };
}
