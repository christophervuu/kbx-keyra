import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { createElement } from 'react';

import { usePreviewExecution } from './use-preview-execution';
import { PreviewProvider } from '../context/preview-context';

import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Mock engine
// ---------------------------------------------------------------------------

vi.mock('@/lib/engine', () => ({
  executeMapping: vi.fn(),
}));

import { executeMapping } from '@/lib/engine';
const mockExecuteMapping = vi.mocked(executeMapping);

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const createMockConfig = (): MappingConfig => ({
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 1,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'source-1', type: 'local' },
  targetSchemaRef: { schemaId: 'target-1', type: 'local' },
  config: { unmappedTargets: 'omit', constants: {}, externalSources: [], nullSubtrees: [] },
  rules: [{ target: 'name', type: 'string', expression: 'source("firstName")' }],
});

const createSchemaDetail = (id: string): SchemaDetail => ({
  metadata: {
    schemaId: id,
    name: id,
    format: 'json-schema',
    fieldCount: 1,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: { type: 'object', properties: { firstName: { type: 'string' } } },
});

const createMockResult = () => ({
  output: { name: 'Alice' },
  diagnostics: [],
  trace: undefined,
  stats: { durationMs: 5, ruleCount: 1 },
});

/** Wrapper providing PreviewProvider for all hook renders */
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(PreviewProvider, null, children);

const defaultParams = () => ({
  config: createMockConfig(),
  sourceSchemaDetail: createSchemaDetail('source-1'),
  targetSchemaDetail: createSchemaDetail('target-1'),
  sourceDataRaw: '{"firstName":"Alice"}',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePreviewExecution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExecuteMapping.mockReturnValue(createMockResult() as ReturnType<typeof executeMapping>);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts in idle state', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(result.current.autoRun).toBe(false);
    expect(result.current.traceEnabled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Guard: missing inputs
  // -------------------------------------------------------------------------

  it('does not execute when config is null', () => {
    const { result } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), config: null }),
      { wrapper },
    );

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('does not execute when sourceSchemaDetail is null', () => {
    const { result } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), sourceSchemaDetail: null }),
      { wrapper },
    );

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('does not execute when targetSchemaDetail is null', () => {
    const { result } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), targetSchemaDetail: null }),
      { wrapper },
    );

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('does not execute when sourceDataRaw is null', () => {
    const { result } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), sourceDataRaw: null }),
      { wrapper },
    );

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('does not execute when sourceDataRaw is invalid JSON', () => {
    const { result } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), sourceDataRaw: '{bad json' }),
      { wrapper },
    );

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  // -------------------------------------------------------------------------
  // Successful execution
  // -------------------------------------------------------------------------

  it('returns status: success with result after run() with valid inputs', () => {
    const mockResult = createMockResult();
    mockExecuteMapping.mockReturnValue(mockResult as ReturnType<typeof executeMapping>);

    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.run(); });

    expect(result.current.state).toEqual({ status: 'success', result: mockResult });
    expect(mockExecuteMapping).toHaveBeenCalledTimes(1);
  });

  it('calls executeMapping with correct arguments', () => {
    const params = defaultParams();
    const { result } = renderHook(() => usePreviewExecution(params), { wrapper });

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).toHaveBeenCalledWith(
      params.config,
      { firstName: 'Alice' },
      params.sourceSchemaDetail!.content,
      params.targetSchemaDetail!.content,
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Engine error
  // -------------------------------------------------------------------------

  it('returns status: error when engine throws', () => {
    mockExecuteMapping.mockImplementation(() => {
      throw new Error('engine exploded');
    });

    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.run(); });

    expect(result.current.state).toEqual({ status: 'error', error: 'engine exploded' });
  });

  it('returns status: error with fallback message when engine throws non-Error', () => {
    mockExecuteMapping.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });

    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.run(); });

    expect(result.current.state.status).toBe('error');
  });

  // -------------------------------------------------------------------------
  // Trace flag
  // -------------------------------------------------------------------------

  it('passes { trace: true } to executeMapping when traceEnabled is true', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.setTraceEnabled(true); });
    act(() => { result.current.run(); });

    expect(mockExecuteMapping).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { trace: true },
    );
  });

  it('passes undefined options when traceEnabled is false', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.run(); });

    expect(mockExecuteMapping).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
    );
  });

  // -------------------------------------------------------------------------
  // Auto-run
  // -------------------------------------------------------------------------

  it('does not auto-execute before debounce when autoRun is enabled', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.setAutoRun(true); });

    // Before debounce fires
    expect(mockExecuteMapping).not.toHaveBeenCalled();
  });

  it('auto-executes after debounce when autoRun is enabled', async () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.setAutoRun(true); });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockExecuteMapping).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'success', result: createMockResult() });
  });

  it('debounces multiple rapid auto-run triggers into one execution', async () => {
    let sourceDataRaw = '{"firstName":"Alice"}';

    const { result, rerender } = renderHook(
      () => usePreviewExecution({ ...defaultParams(), sourceDataRaw }),
      { wrapper },
    );

    act(() => { result.current.setAutoRun(true); });

    // Advance partially (timer not yet fired)
    await act(async () => { vi.advanceTimersByTime(200); });

    // Change sourceDataRaw — should reset debounce
    sourceDataRaw = '{"firstName":"Bob"}';
    rerender();

    await act(async () => { vi.advanceTimersByTime(200); });

    // Still not fired (second 200ms < 500ms debounce)
    expect(mockExecuteMapping).not.toHaveBeenCalled();

    // Advance to trigger
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(mockExecuteMapping).toHaveBeenCalledTimes(1);
  });

  it('does not auto-run when autoRun is false even when inputs change', async () => {
    renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mockExecuteMapping).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Timeout guard
  // -------------------------------------------------------------------------

  it('returns status: timeout when execution takes longer than 2000ms', () => {
    mockExecuteMapping.mockImplementation(() => {
      // Simulate a slow synchronous execution by advancing the real clock
      // We fake the Date.now() to return a value > 2000ms elapsed
      vi.setSystemTime(Date.now() + 2001);
      return createMockResult() as ReturnType<typeof executeMapping>;
    });

    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    act(() => { result.current.run(); });

    expect(result.current.state).toEqual({ status: 'timeout' });
  });

  // -------------------------------------------------------------------------
  // setAutoRun / setTraceEnabled toggles
  // -------------------------------------------------------------------------

  it('setAutoRun updates autoRun state', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    expect(result.current.autoRun).toBe(false);
    act(() => { result.current.setAutoRun(true); });
    expect(result.current.autoRun).toBe(true);
  });

  it('setTraceEnabled updates traceEnabled state', () => {
    const { result } = renderHook(() => usePreviewExecution(defaultParams()), { wrapper });

    expect(result.current.traceEnabled).toBe(false);
    act(() => { result.current.setTraceEnabled(true); });
    expect(result.current.traceEnabled).toBe(true);
  });
});
