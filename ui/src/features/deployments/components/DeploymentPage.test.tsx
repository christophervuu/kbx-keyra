import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeploymentPage } from './DeploymentPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import { HttpClientError } from '@/lib/api/http-client';
import type { CurrentDeployments, DeploymentRecord } from '@/lib/api/types';
import * as queryLib from '@/lib/query';
import type { MappingVersion } from '@/lib/types';
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

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

const VERSIONS: MappingVersion[] = [
  { version: 4, revisionNumber: 11, createdAt: '2026-01-04T10:00:00Z', createdBy: 'alice' },
  { version: 3, revisionNumber: 10, createdAt: '2026-01-03T10:00:00Z', createdBy: 'alice' },
];

const CURRENT_DEPLOYMENTS: CurrentDeployments = {
  DEV: {
    environment: 'DEV',
    deployment: {
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-01-04T12:00:00Z',
      sourceType: 'version',
      sourceNumber: 4,
      artifactId: 'artifact-dev-4',
      artifactHash: 'hash-dev-4-1234567890',
      configHash: 'cfg-dev',
      configS3Key: 's3://runtime/dev/4.json',
    },
    status: 'current',
  },
  PREPROD: {
    environment: 'PREPROD',
    deployment: {
      mappingId: 'map-1',
      environment: 'PREPROD',
      deployedAt: '2026-01-03T12:00:00Z',
      sourceType: 'version',
      sourceNumber: 3,
      artifactId: 'artifact-preprod-3',
      artifactHash: 'hash-preprod-3-1234567890',
      configHash: 'cfg-preprod',
      configS3Key: 's3://runtime/preprod/3.json',
    },
    status: 'stale',
  },
  PROD: {
    environment: 'PROD',
    deployment: null,
    status: 'not-deployed',
  },
  QA: {
    environment: 'QA',
    deployment: null,
    status: 'not-deployed',
  },
};

const HISTORY: DeploymentRecord[] = [
  {
    mappingId: 'map-1',
    environmentDeployedAt: 'DEV#2026-01-04T12:00:00Z',
    environment: 'DEV',
    sourceType: 'version',
    sourceNumber: 4,
    artifactId: 'artifact-dev-4',
    artifactHash: 'hash-dev-4-1234567890',
    configS3Key: 's3://runtime/dev/4.json',
    configHash: 'cfg-dev',
    deployedAt: '2026-01-04T12:00:00Z',
    deployedBy: 'alice',
  },
  {
    mappingId: 'map-1',
    environmentDeployedAt: 'DEV#2026-01-03T12:00:00Z',
    environment: 'DEV',
    sourceType: 'version',
    sourceNumber: 3,
    artifactId: 'artifact-dev-3',
    artifactHash: 'hash-dev-3-1234567890',
    configS3Key: 's3://runtime/dev/3.json',
    configHash: 'cfg-dev-3',
    deployedAt: '2026-01-03T12:00:00Z',
    deployedBy: 'alice',
  },
  {
    mappingId: 'map-1',
    environmentDeployedAt: 'PREPROD#2026-01-03T12:00:00Z',
    environment: 'PREPROD',
    sourceType: 'version',
    sourceNumber: 3,
    artifactId: 'artifact-preprod-3',
    artifactHash: 'hash-preprod-3-1234567890',
    configS3Key: 's3://runtime/preprod/3.json',
    configHash: 'cfg-preprod',
    deployedAt: '2026-01-03T12:00:00Z',
    deployedBy: 'alice',
    promotedFrom: 'DEV',
  },
];

const DEPLOY_RECORD: DeploymentRecord = {
  ...HISTORY[0],
  orchestrationId: 'orc-deploy-1',
};

const PROMOTE_RECORD: DeploymentRecord = {
  ...HISTORY[2],
  orchestrationId: 'orc-promote-1',
};

const ROLLBACK_RECORD: DeploymentRecord = {
  ...HISTORY[1],
  environmentDeployedAt: 'DEV#2026-01-05T12:00:00Z',
  rollbackOf: HISTORY[0].environmentDeployedAt,
  orchestrationId: 'orc-rollback-1',
};

function createDeployBlockedError(issues: unknown[]): Error {
  const error = new Error('Deployment blocked: referenced CDM schema state is not deployable') as Error & {
    code?: string;
    statusCode?: number;
    retryable?: boolean;
    details?: unknown;
    requestId?: string;
  };
  error.code = 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE';
  error.statusCode = 409;
  error.retryable = false;
  error.requestId = 'req-deploy-blocked';
  error.details = { issues };
  return error;
}

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  const adapter: ApiAdapter = {
    getDeploymentContext: vi.fn().mockResolvedValue({
      mappingId: 'map-1',
      mappingName: 'Test Mapping',
      projectId: 'proj-1',
      projectName: 'Test Project',
      environments: [
        { environment: 'DEV', status: 'deployed', deployedVersion: 4, deployedAt: '2026-01-04T12:00:00Z' },
        { environment: 'PREPROD', status: 'stale', deployedVersion: 3, deployedAt: '2026-01-03T12:00:00Z' },
        { environment: 'PROD', status: 'not-deployed' },
      ],
    }),
    listVersions: vi.fn().mockResolvedValue(VERSIONS),
    listRevisions: vi.fn().mockResolvedValue([]),
    getCurrentDeployments: vi.fn().mockResolvedValue(CURRENT_DEPLOYMENTS),
    listDeployments: vi.fn().mockResolvedValue(HISTORY),
    listGlobalDeploymentSummaries: vi.fn(),
    listProjectDeploymentSummaries: vi.fn(),
    deployMapping: vi.fn().mockResolvedValue(DEPLOY_RECORD),
    promoteDeployment: vi.fn().mockResolvedValue(PROMOTE_RECORD),
    rollbackDeployment: vi.fn().mockResolvedValue(ROLLBACK_RECORD),

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
    getAutoMapCapabilities: unimplementedAsync(),
    getAutoMapSession: unimplementedAsync(),
    startAutoMapSession: unimplementedAsync(),
    startAutoMapRun: unimplementedAsync(),
    getAutoMapRunStatus: unimplementedAsync(),
    listAutoMapSuggestions: unimplementedAsync(),
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
    listProjectValueMaps: vi.fn(),
    linkProjectValueMap: vi.fn(),
    getProjectValueMapDetail: vi.fn(),
    updateProjectValueMapOverlay: vi.fn(),
    reviewProjectValueMapUpdate: vi.fn(),
    acceptProjectValueMapUpdate: vi.fn(),
    unlinkProjectValueMap: vi.fn(),
    importProjectValueMapPortable: vi.fn(),
    promoteProjectValueMap: vi.fn(),
    ...overrides,
  };

  return adapter;
}

function renderPage(adapter: ApiAdapter) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/proj-1/mappings/map-1/deploy']}>
          <Routes>
            <Route
              path="/projects/:projectId/mappings/:mappingId/deploy"
              element={<DeploymentPage mappingId="map-1" projectId="proj-1" mappingName="Test Mapping" />}
            />
            <Route path="/projects/:projectId/mappings/:mappingId" element={<div>Editor</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>
    </QueryClientProvider>,
  );
}

describe('DeploymentPage (FS-100 T-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createStorageMock());
    globalThis.localStorage?.removeItem?.('keyra:active-deployment-operation');
  });

  it('renders three environment cards in canonical order', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('deployment-pipeline-cards'));

    const cards = [
      screen.getByTestId('pipeline-card-DEV'),
      screen.getByTestId('pipeline-card-PREPROD'),
      screen.getByTestId('pipeline-card-PROD'),
    ];

    expect(cards[0]?.textContent).toContain('DEV');
    expect(cards[1]?.textContent).toContain('Preprod');
    expect(cards[2]?.textContent).toContain('PROD');
    expect(screen.getByTestId('pipeline-card-DEV').getAttribute('aria-selected')).toBe('true');
  });

  it('renders refresh status and refresh action without blanking content', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('deployment-pipeline-cards'));

    expect(screen.getByTestId('deployment-refresh-status')).toBeInTheDocument();

    await user.click(screen.getByTestId('deployment-refresh-button'));

    await waitFor(() => {
      expect(screen.getByTestId('deployment-pipeline-cards')).toBeInTheDocument();
    });
  });

  it('changes primary action label by selected environment stage', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('primary-deployment-action'));

    expect(screen.getByTestId('primary-deployment-action').textContent).toContain('Deploy v4 to DEV');

    await user.click(screen.getByTestId('pipeline-card-PREPROD'));
    expect(screen.getByTestId('primary-deployment-action').textContent).toContain('Promote DEV snapshot to PREPROD');

    await user.click(screen.getByTestId('pipeline-card-PROD'));
    expect(screen.getByTestId('primary-deployment-action').textContent).toContain('Promote PREPROD snapshot to PROD');

    await user.click(screen.getByTestId('pipeline-card-DEV'));
    expect(screen.getByTestId('primary-deployment-action').textContent).toContain('Deploy v4 to DEV');
  });

  it('supports keyboard navigation across pipeline tabs', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('pipeline-card-DEV'));

    const devCard = screen.getByTestId('pipeline-card-DEV');
    devCard.focus();
    expect(devCard.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-card-PREPROD').getAttribute('aria-selected')).toBe('true');
    });

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-card-DEV').getAttribute('aria-selected')).toBe('true');
    });

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-card-PREPROD').getAttribute('aria-selected')).toBe('true');
    });

    await user.keyboard('{ArrowUp}');
    await waitFor(() => {
      expect(screen.getByTestId('pipeline-card-DEV').getAttribute('aria-selected')).toBe('true');
    });

    expect(screen.getByRole('tablist', { name: /Deployment stage selector/i })).toBeTruthy();
  });

  it('shows readiness blockers and disables invalid promote action', async () => {
    const preprodMissing = {
      ...CURRENT_DEPLOYMENTS,
      PREPROD: { environment: 'PREPROD', deployment: null, status: 'not-deployed' as const },
    };

    const user = userEvent.setup();
    renderPage(createMockAdapter({ getCurrentDeployments: vi.fn().mockResolvedValue(preprodMissing) }));
    await waitFor(() => screen.getByTestId('pipeline-card-PROD'));

    await user.click(screen.getByTestId('pipeline-card-PROD'));

    const primary = screen.getByTestId('primary-deployment-action') as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    expect(screen.getByTestId('readiness-blocker-message').textContent).toContain('PREPROD must have a deployed version snapshot before promotion.');
  });

  it('keeps primary and rollback actions keyboard focusable', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('primary-deployment-action'));

    const primary = screen.getByTestId('primary-deployment-action') as HTMLButtonElement;
    const rollbackButton = screen.getByTestId('secondary-rollback-action') as HTMLButtonElement;

    primary.focus();
    expect(document.activeElement).toBe(primary);

    rollbackButton.focus();
    expect(document.activeElement).toBe(rollbackButton);
  });

  it('shows combined history metadata including promote and rollback markers', async () => {
    const withRollback: DeploymentRecord[] = [
      ...HISTORY,
      {
        ...ROLLBACK_RECORD,
        environment: 'DEV',
      },
    ];

    renderPage(createMockAdapter({ listDeployments: vi.fn().mockResolvedValue(withRollback) }));
    await waitFor(() => screen.getByTestId('history-table-body'));

    const body = screen.getByTestId('history-table-body').textContent ?? '';
    expect(body).toContain('Promoted from DEV');
    expect(body).toContain('Rollback');
    expect(screen.getByTestId(`history-artifact-${HISTORY[0].environmentDeployedAt}`).textContent).toContain('artifact-dev-4');
  });

  it('applies combined history filters for deploy/promote/rollback rows', async () => {
    const withRollback: DeploymentRecord[] = [
      ...HISTORY,
      {
        ...ROLLBACK_RECORD,
        environment: 'DEV',
      },
    ];

    const user = userEvent.setup();
    renderPage(createMockAdapter({ listDeployments: vi.fn().mockResolvedValue(withRollback) }));
    await waitFor(() => screen.getByTestId('history-table-body'));

    await user.click(screen.getByTestId('history-filter-promote'));
    await waitFor(() => {
      const body = screen.getByTestId('history-table-body').textContent ?? '';
      expect(body).toContain('Promoted from DEV');
      expect(body).not.toContain('Rollback');
    });

    await user.click(screen.getByTestId('history-filter-rollback'));
    await waitFor(() => {
      const body = screen.getByTestId('history-table-body').textContent ?? '';
      expect(body).toContain('Rollback');
      expect(body).not.toContain('Promoted from DEV');
    });

    await user.click(screen.getByTestId('history-filter-deploy'));
    await waitFor(() => {
      const body = screen.getByTestId('history-table-body').textContent ?? '';
      expect(body).toContain('Deploy');
      expect(body).not.toContain('Rollback');
      expect(body).not.toContain('Promoted from DEV');
    });

    await user.click(screen.getByTestId('history-filter-all'));
    await waitFor(() => {
      const body = screen.getByTestId('history-table-body').textContent ?? '';
      expect(body).toContain('Promoted from DEV');
      expect(body).toContain('Rollback');
      expect(body).toContain('Deploy');
    });
  });

  it('shows normalized backend error with request id and expandable technical details', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      promoteDeployment: vi.fn().mockRejectedValue(
        new HttpClientError('Promotion blocked by policy', {
          code: 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE',
          statusCode: 409,
          requestId: 'req-ui-1234',
          retryable: false,
          details: {
            reason: 'guardrail',
            issues: [{ schemaId: 'schema-1' }],
          },
        }),
      ),
    });

    renderPage(adapter);
    await waitFor(() => screen.getByTestId('primary-deployment-action'));

    await user.click(screen.getByTestId('pipeline-card-PREPROD'));
    await user.click(screen.getByTestId('primary-deployment-action'));
    await waitFor(() => screen.getByTestId('confirm-dialog'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => screen.getByTestId('deploy-error-request-id'));
    expect(screen.getByTestId('deploy-error-request-id').textContent).toContain('req-ui-1234');

    await user.click(screen.getByRole('button', { name: /Technical details/i }));
    await waitFor(() => screen.getByTestId('deploy-error-technical-details-content'));
    expect(screen.getByTestId('deploy-error-technical-details-content').textContent).toContain('DEPLOY_BLOCKED_CDM_SCHEMA_STATE');
  });

  it('renders CDM blocker details and remediation CTA links', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      promoteDeployment: vi.fn().mockRejectedValue(
        createDeployBlockedError([
          {
            schemaId: 'schema-source',
            schemaName: 'Order Source',
            referenceRole: 'source',
            reason: 'unsynced',
            remediationKey: 're-sync-schema',
          },
          {
            schemaId: 'schema-target',
            referenceRole: 'target',
            reason: 'schema-missing',
            remediationKey: 'relink-cdm-schema',
          },
        ]),
      ),
    });

    renderPage(adapter);
    await waitFor(() => screen.getByTestId('primary-deployment-action'));

    await user.click(screen.getByTestId('pipeline-card-PREPROD'));
    await user.click(screen.getByTestId('primary-deployment-action'));
    await waitFor(() => screen.getByTestId('confirm-dialog'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => screen.getByTestId('cdm-block-list'));
    const sourceCta = screen.getByTestId('cdm-remediation-cta-source-schema-source');
    expect(sourceCta.getAttribute('href')).toBe('/schemas/schema-source');

    const targetCta = screen.getByTestId('cdm-remediation-cta-target-schema-target');
    expect(targetCta.getAttribute('href')).toBe('/schemas');
  });

  it('prefetches mapping editor query from Back to editor hover/focus intent', async () => {
    const user = userEvent.setup();
    const prefetchSpy = vi
      .spyOn(queryLib, 'prefetchMappingEditorByIntent')
      .mockResolvedValue(true);

    renderPage(createMockAdapter());
    const backLink = await screen.findByTestId('back-to-editor-link');

    await user.hover(backLink);
    backLink.focus();

    await waitFor(() => {
      expect(prefetchSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'map-1',
        expect.anything(),
        'hover',
      );
    });

    expect(prefetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'map-1',
      expect.anything(),
      'focus',
    );

    prefetchSpy.mockRestore();
  });

  it('requires reason for PROD promotion and allows optional reason for PREPROD promotion', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);
    await waitFor(() => screen.getByTestId('primary-deployment-action'));

    await user.click(screen.getByTestId('pipeline-card-PROD'));
    await user.click(screen.getByTestId('primary-deployment-action'));
    await waitFor(() => screen.getByTestId('confirm-dialog'));

    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => screen.getByTestId('deployment-action-reason-error'));
    expect(screen.getByTestId('deployment-action-reason-error').textContent).toContain('Reason is required for PROD promotion.');

    await user.type(screen.getByTestId('deployment-action-reason-input'), 'release approval');
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(adapter.promoteDeployment).toHaveBeenCalledWith('map-1', {
        fromEnvironment: 'PREPROD',
        toEnvironment: 'PROD',
      });
    });

    await user.click(screen.getByTestId('pipeline-card-PREPROD'));
    await user.click(screen.getByTestId('primary-deployment-action'));
    await waitFor(() => screen.getByTestId('confirm-dialog'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(adapter.promoteDeployment).toHaveBeenCalledWith('map-1', {
        fromEnvironment: 'DEV',
        toEnvironment: 'PREPROD',
      });
    });
  });

  it('requires reason for rollback before confirming action', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);
    await waitFor(() => screen.getByTestId('secondary-rollback-action'));

    await user.click(screen.getByTestId('secondary-rollback-action'));
    await waitFor(() => screen.getByTestId('confirm-dialog'));

    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => screen.getByTestId('rollback-reason-error'));
    expect(screen.getByTestId('rollback-reason-error').textContent).toContain('Reason is required for rollback.');

    await user.type(screen.getByTestId('rollback-reason-input'), 'rollback due to incident');
    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(adapter.rollbackDeployment).toHaveBeenCalledWith('map-1', {
        environment: 'DEV',
        deploymentSK: 'DEV#2026-01-03T12:00:00Z',
      });
    });
  });

  it('renders immutable diff summary content for deploy and promotion stages', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('deployment-diff-summary'));

    expect(screen.getByTestId('deployment-diff-summary').textContent).toContain('What’s Changing (DEV deploy)');
    expect(screen.getByTestId('deployment-diff-summary').textContent).toContain('Compares immutable version payload against active DEV artifact manifest.');

    await user.click(screen.getByTestId('pipeline-card-PREPROD'));
    await waitFor(() => {
      expect(screen.getByTestId('deployment-diff-summary').textContent).toContain('What’s Changing (DEV → PREPROD)');
    });

    await user.click(screen.getByTestId('pipeline-card-PROD'));
    await waitFor(() => {
      expect(screen.getByTestId('deployment-diff-summary').textContent).toContain('What’s Changing (PREPROD → PROD)');
    });
  });
});
