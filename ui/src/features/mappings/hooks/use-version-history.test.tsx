import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useVersionHistory } from './use-version-history';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingConfig, MappingVersionEntry } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(version: number, rules: MappingConfig['rules'] = []): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Test Mapping',
    version,
    engineVersion: '2.0.0',
    config: {},
    rules,
  };
}

function makeEntry(version: number, rules: MappingConfig['rules'] = []): MappingVersionEntry {
  return {
    version,
    savedAt: `2024-01-0${version}T00:00:00.000Z`,
    savedBy: 'You',
    ruleCount: rules.length,
    config: makeConfig(version, rules),
  };
}

const RULE_A = { target: 'A.B', type: 'string' as const, expression: 'source("x")' };
const RULE_B = { target: 'A.C', type: 'string' as const, expression: 'static("y")' };
const RULE_C = { target: 'A.D', type: 'string' as const, expression: 'static("z")' };

const MOCK_VERSIONS: MappingVersionEntry[] = [
  makeEntry(1, [RULE_A]),
  makeEntry(2, [RULE_A, RULE_B]),
  makeEntry(3, [RULE_A, RULE_B, RULE_C]),
];

const CURRENT_CONFIG = makeConfig(4, [RULE_A, RULE_B]);

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides?: Partial<ApiAdapter>): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    getDeploymentContext: vi.fn(),
    deploy: vi.fn(),
    promote: vi.fn(),
    rollback: vi.fn(),
    getDeploymentDiff: vi.fn(),
    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),
    autoMap: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    listMappingVersions: vi.fn().mockResolvedValue(MOCK_VERSIONS),
    getMappingVersion: vi.fn(),
    saveMappingVersion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ApiAdapter;
}

function createWrapper(adapter: ApiAdapter) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AdapterProvider adapter={adapter}>{children}</AdapterProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useVersionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with isLoading: true and isEmpty: false', () => {
    const adapter = createMockAdapter({
      listMappingVersions: vi.fn(() => new Promise(() => {})), // never resolves
    });
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isEmpty).toBe(false);
    expect(result.current.versions).toEqual([]);
  });

  it('loads versions on mount and sorts most recent first (AE-02)', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(adapter.listMappingVersions).toHaveBeenCalledWith('mapping-1');
    expect(result.current.versions).toHaveLength(3);
    expect(result.current.versions[0].version).toBe(3);
    expect(result.current.versions[1].version).toBe(2);
    expect(result.current.versions[2].version).toBe(1);
  });

  it('returns isEmpty: true when no versions exist (AE-06)', async () => {
    const adapter = createMockAdapter({
      listMappingVersions: vi.fn().mockResolvedValue([]),
    });
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isEmpty).toBe(true);
    expect(result.current.versions).toEqual([]);
  });

  it('computes "Initial version — N rules" summary for the first version', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const v1 = result.current.versions.find((v) => v.version === 1);
    expect(v1?.summary).toBe('Initial version — 1 rules');
  });

  it('computes diff-based summaries for subsequent versions', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // v2 added 1 rule vs v1
    const v2 = result.current.versions.find((v) => v.version === 2);
    expect(v2?.summary).toContain('+1 added');

    // v3 added 1 rule vs v2
    const v3 = result.current.versions.find((v) => v.version === 3);
    expect(v3?.summary).toContain('+1 added');
  });

  it('selectedVersion starts as null and selectedDiff is null', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.selectedVersion).toBeNull();
    expect(result.current.selectedDiff).toBeNull();
  });

  it('selectVersion sets selectedVersion and computes selectedDiff against currentConfig', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectVersion(3);
    });

    expect(result.current.selectedVersion).toBe(3);
    // v3 has [RULE_A, RULE_B, RULE_C]; current has [RULE_A, RULE_B] → RULE_C removed
    expect(result.current.selectedDiff).not.toBeNull();
    expect(result.current.selectedDiff?.summary.removed).toBe(1);
  });

  it('selectVersion(null) clears selectedDiff', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectVersion(2);
    });

    expect(result.current.selectedDiff).not.toBeNull();

    act(() => {
      result.current.selectVersion(null);
    });

    expect(result.current.selectedVersion).toBeNull();
    expect(result.current.selectedDiff).toBeNull();
  });

  it('getRestoreConfig returns the full MappingConfig for the requested version', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const config = result.current.getRestoreConfig(2);
    expect(config).not.toBeNull();
    expect(config?.version).toBe(2);
    expect(config?.rules).toEqual([RULE_A, RULE_B]);
  });

  it('getRestoreConfig returns null for an unknown version', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.getRestoreConfig(999)).toBeNull();
  });

  it('refresh re-fetches versions from adapter', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(adapter.listMappingVersions).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(adapter.listMappingVersions).toHaveBeenCalledTimes(2);
    });
  });

  it('handles adapter errors gracefully — returns empty versions, isLoading false', async () => {
    const adapter = createMockAdapter({
      listMappingVersions: vi.fn().mockRejectedValue(new Error('network error')),
    });
    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.versions).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  it('selectedDiff is null when currentConfig is null', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useVersionHistory('mapping-1', null), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectVersion(2);
    });

    expect(result.current.selectedDiff).toBeNull();
  });

  it('handles sparse version payloads without throwing and returns stable fallbacks', async () => {
    const sparseVersion = {
      version: 4,
      savedAt: '2024-01-04T00:00:00.000Z',
      savedBy: 'You',
      ruleCount: 0,
      config: undefined,
    } as unknown as MappingVersionEntry;

    const adapter = createMockAdapter({
      listMappingVersions: vi.fn().mockResolvedValue([sparseVersion]),
    });

    const { result } = renderHook(() => useVersionHistory('mapping-1', CURRENT_CONFIG), {
      wrapper: createWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.versions).toHaveLength(1);
    expect(result.current.versions[0].summary).toBe('Initial version — 0 rules');

    act(() => {
      result.current.selectVersion(4);
    });

    expect(result.current.selectedDiff).toBeNull();
    expect(result.current.getRestoreConfig(4)).toBeNull();
  });
});
