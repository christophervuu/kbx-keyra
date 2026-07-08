import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useGlobalDeploymentOverview,
  useProjectDeploymentOverview,
} from './use-deployment-overview';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter, DeploymentOverviewListResponse } from '@/lib/api/types';

const overviewResponse: DeploymentOverviewListResponse = {
  items: [
    {
      mappingId: 'm-1',
      projectId: 'p-1',
      projectName: 'Project One',
      mappingName: 'Map One',
      latestVersion: 4,
      latestVersionCreatedAt: '2026-07-07T10:00:00.000Z',
      promotionState: 'AVAILABLE',
      attentionState: 'NEEDS_ATTENTION',
      activeOperationId: null,
      lastActivityAt: '2026-07-07T12:00:00.000Z',
      lastActorId: 'user-1',
      updatedAt: '2026-07-07T12:00:00.000Z',
      environments: {
        DEV: {
          activeArtifactId: 'a-1',
          activeVersion: 4,
          freshness: 'CURRENT',
          lastOperationStatus: 'SUCCEEDED',
        },
        PREPROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
        PROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
      },
    },
  ],
  page: {
    pageSize: 50,
    nextCursor: null,
    returned: 1,
    totalMatched: 1,
  },
  summary: {
    failedCount: 1,
    attentionCount: 1,
  },
};

function createAdapterMock(): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    saveMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listMappingVersions: vi.fn(),
    getMappingVersion: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    listMappingRevisions: vi.fn(),
    getMappingRevision: vi.fn(),
    createMappingVersion: vi.fn(),
    listRevisions: vi.fn(),
    getRevision: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),
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
    deployMapping: vi.fn(),
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),
    listDeployments: vi.fn(),
    getCurrentDeployments: vi.fn(),
    listGlobalDeploymentSummaries: vi.fn().mockResolvedValue(overviewResponse),
    listProjectDeploymentSummaries: vi.fn().mockResolvedValue({
      ...overviewResponse,
      projectId: 'p-1',
    }),
    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncAllCdmSchemas: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),
    autoMap: vi.fn(),
    autoMapSection: vi.fn(),
    getAutoMapCapabilities: vi.fn(),
    getAutoMapSession: vi.fn(),
    startAutoMapSession: vi.fn(),
    startAutoMapRun: vi.fn(),
    getAutoMapRunStatus: vi.fn(),
    listAutoMapSuggestions: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    listProjectValueTables: vi.fn(),
    getProjectValueTable: vi.fn(),
    getProjectValueTableRevision: vi.fn(),
    createProjectValueTable: vi.fn(),
    createProjectValueTableRevision: vi.fn(),
    duplicateProjectValueTable: vi.fn(),
    archiveProjectValueTable: vi.fn(),
    deleteProjectValueTable: vi.fn(),
    listProjectValueTableUsage: vi.fn(),
    getProjectValueTableRevisionDiff: vi.fn(),
    exportProjectValueTableCsv: vi.fn(),
    importProjectValueTableCsv: vi.fn(),
    resolveProjectValueTableReference: vi.fn(),
    listGlobalValueMaps: vi.fn(),
    createGlobalValueMap: vi.fn(),
    getGlobalValueMap: vi.fn(),
    listGlobalValueMapRevisions: vi.fn(),
    createGlobalValueMapRevision: vi.fn(),
    getGlobalValueMapRevision: vi.fn(),
    archiveGlobalValueMap: vi.fn(),
    getGlobalValueMapUsage: vi.fn(),
    listProjectValueMaps: vi.fn(),
    linkProjectValueMap: vi.fn(),
    getProjectValueMapDetail: vi.fn(),
    updateProjectValueMapOverlay: vi.fn(),
    reviewProjectValueMapUpdate: vi.fn(),
    acceptProjectValueMapUpdate: vi.fn(),
    unlinkProjectValueMap: vi.fn(),
    importProjectValueMapPortable: vi.fn(),
    promoteProjectValueMap: vi.fn(),
  } as unknown as ApiAdapter;
}

function wrapperFor(adapter: ApiAdapter) {
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
      </QueryClientProvider>
    );
  };
}

describe('use-deployment-overview', () => {
  it('loads global deployment overviews with filters', async () => {
    const adapter = createAdapterMock();
    const { result } = renderHook(
      () => useGlobalDeploymentOverview({ attentionState: 'NEEDS_ATTENTION', pageSize: 50 }),
      { wrapper: wrapperFor(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.summary.failedCount).toBe(1);
    expect(adapter.listGlobalDeploymentSummaries).toHaveBeenCalledWith({
      attentionState: 'NEEDS_ATTENTION',
      pageSize: 50,
    });
  });

  it('loads project deployment overviews with filters', async () => {
    const adapter = createAdapterMock();
    const { result } = renderHook(
      () => useProjectDeploymentOverview('p-1', { environment: 'DEV', freshness: 'CURRENT', pageSize: 50 }),
      { wrapper: wrapperFor(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items[0]?.projectId).toBe('p-1');
    expect(adapter.listProjectDeploymentSummaries).toHaveBeenCalledWith('p-1', {
      environment: 'DEV',
      freshness: 'CURRENT',
      pageSize: 50,
    });
  });

  it('returns adapter-mode error when overview API methods are unavailable', async () => {
    const adapter = createAdapterMock();
    adapter.listGlobalDeploymentSummaries = undefined;

    const { result } = renderHook(
      () => useGlobalDeploymentOverview({ pageSize: 50 }),
      { wrapper: wrapperFor(adapter) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.errorMessage).toContain('not available');
    });

    expect(result.current.items).toEqual([]);
  });
});
