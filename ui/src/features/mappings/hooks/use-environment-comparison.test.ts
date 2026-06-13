import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEnvironmentComparison } from './use-environment-comparison';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import { executeMapping } from '@/lib/engine';
import type { MappingConfig, SchemaDetail, ServerPreviewResult } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mock engine
// ---------------------------------------------------------------------------

vi.mock('@/lib/engine', () => ({
  executeMapping: vi.fn(),
}));

const mockExecuteMapping = vi.mocked(executeMapping);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-1';

const MOCK_CONFIG: MappingConfig = {
  id: MAPPING_ID,
  projectId: 'proj-1',
  name: 'Test Mapping',
  version: 5,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'src-1', type: 'local' },
  targetSchemaRef: { schemaId: 'tgt-1', type: 'local' },
  config: {},
  rules: [],
};

const SAVED_CONFIG: MappingConfig = {
  ...MOCK_CONFIG,
  version: 3,
  name: 'Test Mapping (saved)',
};

const MOCK_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'src-1',
    name: 'Source',
    format: 'json-schema',
    origin: 'local',
    scope: 'project',
    projectId: 'proj-1',
    syncStatus: 'synced',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: { type: 'object' },
};

const MOCK_TARGET_SCHEMA: SchemaDetail = {
  ...MOCK_SOURCE_SCHEMA,
  metadata: { ...MOCK_SOURCE_SCHEMA.metadata, schemaId: 'tgt-1', name: 'Target' },
};

const SOURCE_DATA_RAW = JSON.stringify({ name: 'Alice' });
const MOCK_OUTPUT = { result: 'ok' };

const MOCK_SERVER_RESULT: ServerPreviewResult = {
  output: { serverResult: 'yes' },
  diagnostics: [],
  metadata: {
    environment: 'DEV',
    artifactId: 'artifact-dev-2',
    artifactHash: 'hash-dev-2',
    deployedAt: '2026-01-01T00:00:00Z',
    sourceType: 'version',
    sourceNumber: 2,
    engineVersion: '1.0.0',
  },
};

const MOCK_DEPLOYMENT_CONTEXT = {
  mappingId: MAPPING_ID,
  mappingName: 'Test Mapping',
  projectId: 'proj-1',
  projectName: 'Test Project',
  environments: [
    { environment: 'DEV', status: 'deployed', deployedVersion: 2, deployedAt: '2026-01-01T00:00:00Z' },
    { environment: 'PREPROD', status: 'deployed', deployedVersion: 1, deployedAt: '2026-01-01T00:00:00Z' },
    { environment: 'PROD', status: 'not-deployed' },
  ],
};

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function makeAdapter(overrides: Partial<ApiAdapter> = {}): Partial<ApiAdapter> {
  return {
    getDeploymentContext: vi.fn().mockResolvedValue(MOCK_DEPLOYMENT_CONTEXT),
    getMapping: vi.fn().mockResolvedValue(SAVED_CONFIG),
    previewOnServer: vi.fn().mockResolvedValue(MOCK_SERVER_RESULT),
    ...overrides,
  };
}

function makeWrapper(adapter: Partial<ApiAdapter>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      AdapterProvider,
      { adapter: adapter as ApiAdapter },
      children,
    );
  };
}

function makeParams(overrides = {}) {
  return {
    mappingId: MAPPING_ID,
    config: MOCK_CONFIG,
    sourceSchemaDetail: MOCK_SOURCE_SCHEMA,
    targetSchemaDetail: MOCK_TARGET_SCHEMA,
    sourceDataRaw: SOURCE_DATA_RAW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnvironmentComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteMapping.mockReturnValue({
      output: MOCK_OUTPUT,
      diagnostics: [],
    });
  });

  it('starts with idle state and current-vs-saved mode', () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    expect(result.current.state).toBeNull();
    expect(result.current.mode).toBe('current-vs-saved');
  });

  it('canRun is false when sourceDataRaw is null', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams({ sourceDataRaw: null })),
      { wrapper: makeWrapper(adapter) },
    );

    // Wait for deployment context to load
    await waitFor(() => expect(result.current.canRun).toBe(false));
    expect(result.current.canRun).toBe(false);
  });

  it('canRun is true for current-vs-saved when source data present', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    // current-vs-saved is always available; wait for deployment context
    await waitFor(() => expect(result.current.canRun).toBe(true));
  });

  it('current-vs-saved: both sides execute client-side, saved config loaded fresh', async () => {
    const getMappingFn = vi.fn().mockResolvedValue(SAVED_CONFIG);
    const adapter = makeAdapter({ getMapping: getMappingFn });

    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    expect(getMappingFn).toHaveBeenCalledWith(MAPPING_ID);
    expect(mockExecuteMapping).toHaveBeenCalledTimes(2);

    const state = result.current.state;
    expect(state).not.toBeNull();
    expect(state!.overallStatus).toBe('complete');
    expect(state!.left.status).toBe('success');
    expect(state!.right.status).toBe('success');
    expect(state!.left.label).toBe('Current');
    expect(state!.right.label).toBe('Saved');
    // Matching outputs → empty diff
    expect(state!.diffEntries).toHaveLength(0);
  });

  it('current-vs-saved: diff computed when outputs differ', async () => {
    mockExecuteMapping
      .mockReturnValueOnce({ output: { a: 1 }, diagnostics: [] })
      .mockReturnValueOnce({ output: { a: 2 }, diagnostics: [] });

    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    const state = result.current.state;
    expect(state!.overallStatus).toBe('complete');
    expect(state!.diffEntries).not.toBeNull();
    expect(state!.diffEntries!.length).toBeGreaterThan(0);
  });

  it('mode with server side: right side delegates to server preview', async () => {
    const previewFn = vi.fn().mockResolvedValue(MOCK_SERVER_RESULT);
    const adapter = makeAdapter({ previewOnServer: previewFn });

    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    act(() => {
      result.current.setMode('current-vs-dev');
    });

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    expect(previewFn).toHaveBeenCalledWith(MAPPING_ID, expect.objectContaining({ environment: 'DEV' }));
    const state = result.current.state;
    expect(state!.right.label).toBe('DEV');
    expect(state!.right.status).toBe('success');
    expect(state!.right.metadata.executionContext).toBe('server');
  });

  it('dual-server mode: both sides fire in parallel', async () => {
    const callOrder: string[] = [];
    const previewFn = vi.fn().mockImplementation((_id: string, input: { environment: string }) => {
      callOrder.push(input.environment);
      return Promise.resolve({
        ...MOCK_SERVER_RESULT,
        metadata: { ...MOCK_SERVER_RESULT.metadata, environment: input.environment },
      });
    });

    const adapter = makeAdapter({ previewOnServer: previewFn });

    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    act(() => {
      result.current.setMode('dev-vs-preprod');
    });

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    expect(previewFn).toHaveBeenCalledTimes(2);
    const state = result.current.state;
    expect(state!.left.label).toBe('DEV');
    expect(state!.right.label).toBe('PREPROD');
    expect(state!.overallStatus).toBe('complete');
  });

  it('partial failure: one side errors, other succeeds, diff is null', async () => {
    mockExecuteMapping
      .mockReturnValueOnce({ output: MOCK_OUTPUT, diagnostics: [] })
      .mockImplementationOnce(() => { throw new Error('Engine crash'); });

    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    const state = result.current.state;
    expect(state!.overallStatus).toBe('partial-error');
    expect(state!.diffEntries).toBeNull();
    // One side succeeded, one errored
    const statuses = [state!.left.status, state!.right.status];
    expect(statuses).toContain('success');
    expect(statuses).toContain('error');
  });

  it('JSON parse failure in sourceData produces error state', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams({ sourceDataRaw: 'not-json' })),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    const state = result.current.state;
    expect(state!.overallStatus).toBe('partial-error');
    expect(state!.left.status).toBe('error');
    expect(state!.right.status).toBe('error');
  });

  it('mode change resets state to null', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    await act(async () => {
      await result.current.runComparison();
    });

    expect(result.current.state).not.toBeNull();

    act(() => {
      result.current.setMode('current-vs-dev');
    });

    expect(result.current.state).toBeNull();
  });

  it('canRun is false when selected mode is unavailable (PROD not deployed)', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.canRun).toBe(true));

    act(() => {
      result.current.setMode('preprod-vs-prod'); // PROD is not-deployed in mock
    });

    await waitFor(() => expect(result.current.canRun).toBe(false));
  });

  it('modeAvailability reflects deployment context', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(
      () => useEnvironmentComparison(makeParams()),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => {
      expect(result.current.modeAvailability('current-vs-saved').available).toBe(true);
    });

    expect(result.current.modeAvailability('current-vs-dev').available).toBe(true);
    expect(result.current.modeAvailability('preprod-vs-prod').available).toBe(false);
  });
});
