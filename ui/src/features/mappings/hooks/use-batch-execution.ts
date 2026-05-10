import { useCallback, useEffect, useRef, useState } from 'react';

import { executeMapping } from '@/lib/engine';
import type { MappingConfig, SchemaDetail, TestCase, TestRunResult } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export interface BatchProgress {
  current: number;
  total: number;
}

export interface UseBatchExecutionOptions {
  config: MappingConfig | null;
  sourceSchema: SchemaDetail | null;
  targetSchema: SchemaDetail | null;
  onCaseComplete?: (testCaseId: string, result: TestRunResult) => void;
}

export interface UseBatchExecutionResult {
  isRunning: boolean;
  progress: BatchProgress;
  runAll: (testCases: readonly TestCase[]) => Promise<Readonly<Record<string, TestRunResult>>>;
  rerunFailed: (
    testCases: readonly TestCase[],
    results: Readonly<Record<string, TestRunResult>>,
  ) => Promise<Readonly<Record<string, TestRunResult>>>;
  cancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildResult(
  testCaseId: string,
  status: 'pass' | 'fail' | 'error',
  errorCount: number,
  warningCount: number,
  durationMs: number,
  outputSnapshot?: unknown,
): TestRunResult {
  return {
    testCaseId,
    status,
    errorCount,
    warningCount,
    executedAt: new Date().toISOString(),
    durationMs,
    ...(outputSnapshot !== undefined && { outputSnapshot }),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates sequential batch execution of test cases.
 *
 * Pass/fail determination: zero error-severity diagnostics = pass; any errors,
 * execution exceptions, or invalid JSON sourceData = fail.
 *
 * Cancellation: calling `cancel()` sets a flag that is checked before each
 * case execution. The current case always completes before stopping.
 *
 * The hook does not own result persistence — it fires `onCaseComplete` after
 * each case and the caller is responsible for persisting via `useTestRunResults`.
 */
export function useBatchExecution({
  config,
  sourceSchema,
  targetSchema,
  onCaseComplete,
}: UseBatchExecutionOptions): UseBatchExecutionResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0 });

  const cancelledRef = useRef(false);
  const onCaseCompleteRef = useRef(onCaseComplete);

  // Keep callback ref current without re-triggering effects
  useEffect(() => {
    onCaseCompleteRef.current = onCaseComplete;
  }, [onCaseComplete]);

  // Cancel on unmount
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const executeCases = useCallback(
    async (cases: readonly TestCase[]): Promise<Readonly<Record<string, TestRunResult>>> => {
      if (cases.length === 0) return {};

      cancelledRef.current = false;
      setIsRunning(true);
      setProgress({ current: 0, total: cases.length });
      const batchResults: Record<string, TestRunResult> = {};

      for (let i = 0; i < cases.length; i++) {
        if (cancelledRef.current) break;

        const tc = cases[i];
        const start = Date.now();

        let result: TestRunResult;

        // Parse sourceData
        let parsedData: unknown;
        let parseError = false;
        try {
          parsedData = JSON.parse(tc.sourceData);
        } catch {
          parseError = true;
        }

        if (parseError || config === null) {
          const durationMs = Date.now() - start;
          result = buildResult(tc.id, 'error', 1, 0, durationMs);
        } else {
          try {
            const execResult = executeMapping(
              config,
              parsedData,
              sourceSchema?.content ?? null,
              targetSchema?.content ?? null,
            );

            const durationMs = Date.now() - start;
            const errorCount = execResult.diagnostics.filter(
              (d) => d.severity === 'error',
            ).length;
            const warningCount = execResult.diagnostics.filter(
              (d) => d.severity === 'warning',
            ).length;
            const status: 'pass' | 'fail' = errorCount === 0 ? 'pass' : 'fail';

            result = buildResult(
              tc.id,
              status,
              errorCount,
              warningCount,
              durationMs,
              execResult.output,
            );
          } catch {
            const durationMs = Date.now() - start;
            result = buildResult(tc.id, 'error', 1, 0, durationMs);
          }
        }

        batchResults[tc.id] = result;
        onCaseCompleteRef.current?.(tc.id, result);

        // Update progress after each case
        setProgress({ current: i + 1, total: cases.length });

        // Yield to the event loop between cases so React can batch state updates
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      }

      setIsRunning(false);
      return batchResults;
    },
    [config, sourceSchema, targetSchema],
  );

  const runAll = useCallback(
    async (testCases: readonly TestCase[]): Promise<Readonly<Record<string, TestRunResult>>> => {
      return executeCases(testCases);
    },
    [executeCases],
  );

  const rerunFailed = useCallback(
    async (
      testCases: readonly TestCase[],
      results: Readonly<Record<string, TestRunResult>>,
    ): Promise<Readonly<Record<string, TestRunResult>>> => {
      const failed = testCases.filter(
        (tc) => results[tc.id]?.status === 'fail',
      );
      return executeCases(failed);
    },
    [executeCases],
  );

  return { isRunning, progress, runAll, rerunFailed, cancel };
}
