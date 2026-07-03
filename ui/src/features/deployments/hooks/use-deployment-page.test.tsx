import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeploymentPage } from './use-deployment-page';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import { HttpClientError } from '@/lib/api/http-client';
import type {
  ActivityEntry,
  CdmBulkSyncResult,
  CreateProjectValueTableInput,
  CreateProjectValueTableRevisionInput,
  DuplicateProjectValueTableInput,
  GitHubFile,
  LinkCdmSchemaInput,
  LinkPublishedSchemaInput,
  ProjectValueTable,
  ProjectValueTableRevision,
  PublishSchemaInput,
  ResolveProjectValueTableReferenceInput,
  ResolveProjectValueTableReferenceResult,
  SchemaMetadata,
  SchemaSearchResult,
  SchemaSyncResult,
  ServerPreviewInput,
  ServerPreviewResult,
  ValueTableDiffPage,
  ValueTableListOptions,
  ValueTableUsageEntry,
} from '@/lib/types';

function unimplementedAsync<T>() {
  return vi.fn<(...args: unknown[]) => Promise<T>>().mockRejectedValue(new Error('not implemented in test'));
}

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  const adapter: ApiAdapter = {
    getDeploymentContext: vi.fn().mockResolvedValue({
      mappingId: 'map-1',
      mappingName: 'Test Mapping',
      projectId: 'proj-1',
      projectName: 'Project One',
      environments: [
        { environment: 'DEV', status: 'deployed', deployedVersion: 2, deployedAt: '2026-01-02T00:00:00Z' },
        { environment: 'PREPROD', status: 'not-deployed' },
        { environment: 'PROD', status: 'not-deployed' },
      ],
    }),
    listRevisions: vi.fn().mockResolvedValue([]),
    listVersions: vi.fn().mockResolvedValue([
      { version: 2, revisionNumber: 2, createdAt: '2026-01-02T00:00:00Z', createdBy: 'alice' },
      { version: 1, revisionNumber: 1, createdAt: '2026-01-01T00:00:00Z', createdBy: 'alice' },
    ]),
    getCurrentDeployments: vi.fn().mockResolvedValue({
      DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
      PREPROD: { environment: 'PREPROD', deployment: null, status: 'not-deployed' },
      PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
      QA: { environment: 'QA', deployment: null, status: 'not-deployed' },
    }),
    listDeployments: vi.fn().mockResolvedValue([]),
    deployMapping: vi.fn().mockResolvedValue({
      mappingId: 'map-1',
      environmentDeployedAt: 'DEV#2026-01-02T01:00:00Z',
      environment: 'DEV',
      sourceType: 'version',
      sourceNumber: 2,
      artifactId: 'artifact-2',
      artifactHash: 'hash-2',
      deployedAt: '2026-01-02T01:00:00Z',
      deployedBy: 'alice',
    }),
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),

    listSchemas: unimplementedAsync(),
    getSchema: unimplementedAsync(),
    createSchema: unimplementedAsync(),
    updateSchema: unimplementedAsync(),
    markSchemaReviewed: unimplementedAsync(),
    addSchemaSample: unimplementedAsync(),
    deleteSchemaSample: unimplementedAsync(),
    getSchemaSamplePayload: unimplementedAsync(),
    deleteSchema: unimplementedAsync(),
    listMappings: unimplementedAsync(),
    getMapping: unimplementedAsync(),
    createMapping: unimplementedAsync(),
    updateMapping: unimplementedAsync(),
    saveMapping: unimplementedAsync(),
    deleteMapping: unimplementedAsync(),
    duplicateMapping: unimplementedAsync(),
    importLocalMappings: unimplementedAsync(),
    listMappingVersions: unimplementedAsync(),
    getMappingVersion: unimplementedAsync(),
    getVersion: unimplementedAsync(),
    getMappingRevision: unimplementedAsync(),
    listMappingRevisions: unimplementedAsync(),
    getRevision: unimplementedAsync(),
    createMappingVersion: unimplementedAsync(),
    createVersion: unimplementedAsync(),
    saveMappingVersion: unimplementedAsync(),
    listProjects: unimplementedAsync(),
    getProject: unimplementedAsync(),
    createProject: unimplementedAsync(),
    updateProject: unimplementedAsync(),
    deleteProject: unimplementedAsync(),
    listTemplates: unimplementedAsync(),
    getTemplate: unimplementedAsync(),
    deploy: unimplementedAsync(),
    promote: unimplementedAsync(),
    rollback: unimplementedAsync(),
    getDeploymentDiff: unimplementedAsync(),
    listCdmSchemas: vi.fn<(path?: string) => Promise<GitHubFile[]>>(),
    linkCdmSchema: vi.fn<(input: LinkCdmSchemaInput) => Promise<SchemaMetadata>>(),
    syncAllCdmSchemas: vi.fn<() => Promise<CdmBulkSyncResult>>(),
    syncCdmSchema: vi.fn<(schemaId: string, options?: { statusOnly?: boolean }) => Promise<SchemaSyncResult>>(),
    listPublishedSchemas: vi.fn<(path?: string) => Promise<GitHubFile[]>>(),
    publishSchemaToGitHub: vi.fn<(schemaId: string, input: PublishSchemaInput) => Promise<void>>(),
    linkPublishedSchema: vi.fn<(input: LinkPublishedSchemaInput) => Promise<SchemaMetadata>>(),
    autoMap: unimplementedAsync(),
    autoMapSection: unimplementedAsync(),
    suggestExpression: unimplementedAsync(),
    explainRule: unimplementedAsync(),
    smartFix: unimplementedAsync(),
    validateMappings: unimplementedAsync(),
    querySchemaNodes: vi.fn<(schemaId: string, query: string) => Promise<SchemaSearchResult[]>>(),
    listActivity: vi.fn<(projectId?: string, limit?: number) => Promise<ActivityEntry[]>>(),
    previewOnServer: vi.fn<(mappingId: string, input: ServerPreviewInput) => Promise<ServerPreviewResult>>(),
    listProjectValueTables: vi.fn<(projectId: string, options?: ValueTableListOptions) => Promise<ProjectValueTable[]>>(),
    getProjectValueTable: vi.fn<(valueTableId: string) => Promise<ProjectValueTable>>(),
    getProjectValueTableRevision: vi.fn<(valueTableId: string, revision: number) => Promise<ProjectValueTableRevision>>(),
    createProjectValueTable: vi.fn<(input: CreateProjectValueTableInput) => Promise<ProjectValueTable>>(),
    createProjectValueTableRevision: vi.fn<(valueTableId: string, input: CreateProjectValueTableRevisionInput) => Promise<ProjectValueTableRevision>>(),
    duplicateProjectValueTable: vi.fn<(input: DuplicateProjectValueTableInput) => Promise<ProjectValueTable>>(),
    archiveProjectValueTable: vi.fn<(valueTableId: string) => Promise<ProjectValueTable>>(),
    deleteProjectValueTable: vi.fn<(valueTableId: string) => Promise<void>>(),
    listProjectValueTableUsage: vi.fn<(valueTableId: string) => Promise<ValueTableUsageEntry[]>>(),
    getProjectValueTableRevisionDiff: vi.fn<(valueTableId: string, fromRevision: number, toRevision: number, options?: { cursor?: string; pageSize?: number }) => Promise<ValueTableDiffPage>>(),
    exportProjectValueTableCsv: vi.fn<(valueTableId: string, revision?: number) => Promise<string>>(),
    importProjectValueTableCsv: vi.fn<(projectId: string, csv: string, options?: { name?: string; key?: string }) => Promise<ProjectValueTableRevision>>(),
    resolveProjectValueTableReference: vi.fn<(input: ResolveProjectValueTableReferenceInput) => Promise<ResolveProjectValueTableReferenceResult>>(),
    listGlobalValueMaps: vi.fn<(options?: ValueTableListOptions) => Promise<ProjectValueTable[]>>(),
    createGlobalValueMap: vi.fn(),
    getGlobalValueMap: vi.fn(),
    listGlobalValueMapRevisions: vi.fn(),
    createGlobalValueMapRevision: vi.fn(),
    getGlobalValueMapRevision: vi.fn(),
    archiveGlobalValueMap: vi.fn(),
    getGlobalValueMapUsage: vi.fn(),
    ...overrides,
  };

  return adapter;
}

function makeWrapper(adapter: ApiAdapter) {
  const queryClient = createQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>{children}</AdapterProvider>
      </QueryClientProvider>
    );
  };
}

describe('useDeploymentPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to SANDBOX and bootstraps from deploy-context + versions/current/history', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useDeploymentPage('map-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.environment).toBe('SANDBOX');
    expect(adapter.getDeploymentContext).toHaveBeenCalledWith('map-1');
    expect(adapter.listVersions).toHaveBeenCalledWith('map-1');
    expect(adapter.listRevisions).not.toHaveBeenCalled();
    expect(adapter.getCurrentDeployments).toHaveBeenCalledWith('map-1');
    expect(adapter.listDeployments).toHaveBeenCalledWith('map-1');
  });

  it('exposes non-blocking refresh metadata when cached query data exists', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() => useDeploymentPage('map-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it('returns structured load error with request id when deploy-context load fails', async () => {
    const adapter = createMockAdapter({
      getDeploymentContext: vi.fn().mockRejectedValue(
        new HttpClientError('Deployment context unavailable', {
          code: 'RESOURCE_NOT_FOUND',
          statusCode: 404,
          requestId: 'req-load-404',
          retryable: false,
        }),
      ),
    });

    const { result } = renderHook(() => useDeploymentPage('map-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toContain('Deployment context unavailable');
    expect(result.current.error?.requestId).toBe('req-load-404');
    expect(result.current.error?.code).toBe('RESOURCE_NOT_FOUND');
    expect(result.current.error?.statusCode).toBe(404);
  });

  it('returns deploy feedback error with requestId and technicalDetails on mutation failure', async () => {
    const adapter = createMockAdapter({
      deployMapping: vi.fn().mockRejectedValue(
        new HttpClientError('Deploy guardrail blocked', {
          code: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
          statusCode: 409,
          requestId: 'req-deploy-409',
          retryable: false,
          details: {
            issues: [
              {
                schemaId: 'schema-source',
                referenceRole: 'source',
                reason: 'unsynced',
                remediationKey: 're-sync-schema',
              },
            ],
          },
        }),
      ),
    });

    const { result } = renderHook(() => useDeploymentPage('map-1'), {
      wrapper: makeWrapper(adapter),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.deploy({ environment: 'DEV', sourceType: 'version', sourceNumber: 2 });
    });

    expect(result.current.deployFeedback?.kind).toBe('error');
    if (result.current.deployFeedback?.kind === 'error') {
      expect(result.current.deployFeedback.requestId).toBe('req-deploy-409');
      expect(result.current.deployFeedback.technicalDetails?.requestId).toBe('req-deploy-409');
      expect(result.current.deployFeedback.technicalDetails?.code).toBe('DEPLOY_BLOCKED_CDM_SCHEMA_STATE');
    }
  });
});
