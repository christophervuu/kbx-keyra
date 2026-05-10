import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { MappingConfig, SchemaDetail, TestCase, TestRunResult } from '@/lib/types/domain';
import { useBatchExecution } from './use-batch-execution';

// ---------------------------------------------------------------------------
// Mock engine
// ---------------------------------------------------------------------------

vi.mock('@/lib/engine', () => ({
  executeMapping: vi.fn(),
}));

import { executeMapping } from '@/lib/engine';
const mockExecuteMapping = vi.mocked(executeMapping);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(): MappingConfig {
  return {
    id: 'cfg-1',
    projectId: 'proj-1',
    name: 'Test Mapping',
    version: '1.0.0',
    engineVersion: '1.0.0',
    rules: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeSchemaDetail(id: string): SchemaDetail {
  return {
    id,
    projectId: 'proj-1',
    name: 'Schema',
    format: 'json',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    content: { type: 'object' },
  };
}

function makeTestCase(id: string, sourceData = '{"x":1}'): TestCase {
  return {
    id,
    name: `Case ${id}`,
    sourceData,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function makeExecResult(errorCount = 0, warningCount = 0) {
  const diagnostics = [
    ...Array.from({ length: errorCount }, () => ({ severity: 'error' as const, message: 'err', code: 'E001' })),
    ...Array.from({ length: warningCount }, () => ({ severity: 'warning' as const, message: 'warn', code: 'W001' })),
  ];
  return {
    output: { result: 'ok' },
    diagnostics,
    stats: { durationMs: 10, ruleCount: 1 },
    trace: undefined,
  };
}

const defaultOptions = () => ({
  config: makeConfig(),
  sourceSchema: makeSchemaDetail('src'),
  targetSchema: makeSchemaDetail('tgt'),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBatchExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteMapping.mockReturnValue(makeExecResult() as ReturnType<typeof executeMapping>);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with isRunning=false and zero progress', () => {
    const { result } = renderHook(() => useBatchExecution(defaultOptions()));
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progress).toEqual({ current: 0, total: 0 });
  });

  // -------------------------------------------------------------------------
  // runAll
  // -------------------------------------------------------------------------

  it('runAll executes all test cases sequentially', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    const cases = [makeTestCase('tc-1'), makeTestCase('tc-2'), makeTestCase('tc-3')];

    let batchResults: Readonly<Record<string, TestRunResult>> = {};
    await act(async () => {
      batchResults = await result.current.runAll(cases);
    });

    expect(mockExecuteMapping).toHaveBeenCalledTimes(3);
    expect(onCaseComplete).toHaveBeenCalledTimes(3);
    expect(Object.keys(batchResults)).toHaveLength(3);
  });

  it('runAll is a no-op for empty test case list', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([]);
    });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(onCaseComplete).not.toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });

  it('runAll sets isRunning=false after completion', async () => {
    const { result } = renderHook(() => useBatchExecution(defaultOptions()));

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    expect(result.current.isRunning).toBe(false);
  });

  it('runAll updates progress.total to the number of cases', async () => {
    const { result } = renderHook(() => useBatchExecution(defaultOptions()));

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1'), makeTestCase('tc-2')]);
    });

    expect(result.current.progress.total).toBe(2);
    expect(result.current.progress.current).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Pass/fail determination
  // -------------------------------------------------------------------------

  it('marks a case as pass when there are zero error diagnostics', async () => {
    mockExecuteMapping.mockReturnValue(makeExecResult(0, 0) as ReturnType<typeof executeMapping>);
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.status).toBe('pass');
    expect(runResult.errorCount).toBe(0);
  });

  it('marks a case as fail when there are error diagnostics', async () => {
    mockExecuteMapping.mockReturnValue(makeExecResult(2, 1) as ReturnType<typeof executeMapping>);
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.status).toBe('fail');
    expect(runResult.errorCount).toBe(2);
    expect(runResult.warningCount).toBe(1);
  });

  it('marks a case as error when sourceData is invalid JSON', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1', 'not valid json {{')]);
    });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.status).toBe('error');
    expect(runResult.errorCount).toBe(1);
  });

  it('marks a case as error when executeMapping throws', async () => {
    mockExecuteMapping.mockImplementation(() => { throw new Error('Engine error'); });
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.status).toBe('error');
  });

  it('marks a case as error when config is null', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), config: null, onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.status).toBe('error');
  });

  // -------------------------------------------------------------------------
  // onCaseComplete callback
  // -------------------------------------------------------------------------

  it('fires onCaseComplete with the correct testCaseId for each case', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    const cases = [makeTestCase('tc-1'), makeTestCase('tc-2')];

    await act(async () => {
      await result.current.runAll(cases);
    });

    expect(onCaseComplete.mock.calls[0][0]).toBe('tc-1');
    expect(onCaseComplete.mock.calls[1][0]).toBe('tc-2');
  });

  it('result includes executedAt ISO timestamp and durationMs', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof runResult.durationMs).toBe('number');
    expect(runResult.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('result includes outputSnapshot from execution result', async () => {
    mockExecuteMapping.mockReturnValue({
      output: { transformed: true },
      diagnostics: [],
      stats: { durationMs: 5, ruleCount: 1 },
      trace: undefined,
    } as ReturnType<typeof executeMapping>);

    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    await act(async () => {
      await result.current.runAll([makeTestCase('tc-1')]);
    });

    const [, runResult] = onCaseComplete.mock.calls[0] as [string, TestRunResult];
    expect(runResult.outputSnapshot).toEqual({ transformed: true });
  });

  // -------------------------------------------------------------------------
  // rerunFailed
  // -------------------------------------------------------------------------

  it('rerunFailed only executes cases with fail status', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    const cases = [makeTestCase('tc-1'), makeTestCase('tc-2'), makeTestCase('tc-3')];
    const results: Record<string, TestRunResult> = {
      'tc-1': { testCaseId: 'tc-1', status: 'pass', errorCount: 0, warningCount: 0, executedAt: '', durationMs: 0 },
      'tc-2': { testCaseId: 'tc-2', status: 'fail', errorCount: 1, warningCount: 0, executedAt: '', durationMs: 0 },
      // tc-3 has no result — not run
    };

    await act(async () => {
      await result.current.rerunFailed(cases, results);
    });

    expect(mockExecuteMapping).toHaveBeenCalledTimes(1);
    expect(onCaseComplete.mock.calls[0][0]).toBe('tc-2');
  });

  it('rerunFailed is a no-op when no cases have fail status', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    const cases = [makeTestCase('tc-1')];
    const results: Record<string, TestRunResult> = {
      'tc-1': { testCaseId: 'tc-1', status: 'pass', errorCount: 0, warningCount: 0, executedAt: '', durationMs: 0 },
    };

    await act(async () => {
      await result.current.rerunFailed(cases, results);
    });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(onCaseComplete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  it('cancel() stops execution after the current case', async () => {
    const onCaseComplete = vi.fn();
    const { result } = renderHook(() =>
      useBatchExecution({ ...defaultOptions(), onCaseComplete }),
    );

    const cases = [makeTestCase('tc-1'), makeTestCase('tc-2'), makeTestCase('tc-3')];

    // Cancel after first case completes
    mockExecuteMapping.mockImplementation(() => {
      result.current.cancel();
      return makeExecResult() as ReturnType<typeof executeMapping>;
    });

    await act(async () => {
      await result.current.runAll(cases);
    });

    // Only tc-1 should have been processed (cancel fires during tc-1 execution,
    // loop checks flag before tc-2)
    expect(onCaseComplete).toHaveBeenCalledTimes(1);
    expect(result.current.isRunning).toBe(false);
  });
});
