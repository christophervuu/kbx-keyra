import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DeploymentPage } from './DeploymentPage';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { CurrentDeployments, DeploymentRecord } from '@/lib/api/types';
import type { MappingRevision, MappingVersion } from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REVISIONS: MappingRevision[] = [
  { revision: 3, savedAt: '2026-01-03T00:00:00Z', savedBy: 'alice', ruleCount: 6 },
  { revision: 2, savedAt: '2026-01-02T00:00:00Z', savedBy: 'alice', ruleCount: 4 },
  { revision: 1, savedAt: '2026-01-01T00:00:00Z', savedBy: 'alice', ruleCount: 2 },
];

const VERSIONS: MappingVersion[] = [
  { version: 2, revisionNumber: 3, createdAt: '2026-01-03T00:00:00Z', createdBy: 'alice' },
  { version: 1, revisionNumber: 2, createdAt: '2026-01-02T00:00:00Z', createdBy: 'alice' },
];

const CURRENT_DEPLOYMENTS: CurrentDeployments = {
  DEV: {
    environment: 'DEV',
    deployment: {
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-01-03T00:00:00Z',
      sourceType: 'version',
      sourceNumber: 2,
      configHash: 'abc',
      configS3Key: 's3://bucket/map-1/v2.json',
    },
    status: 'current',
  },
  PREPROD: { environment: 'PREPROD', deployment: null, status: 'not-deployed' },
  PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
};

const DEPLOY_RECORD: DeploymentRecord = {
  mappingId: 'map-1',
  environmentDeployedAt: '2026-01-03T01:00:00Z',
  environment: 'DEV',
  sourceType: 'revision',
  sourceNumber: 3,
  configS3Key: 's3://bucket/map-1/rev3.json',
  configHash: 'def',
  deployedAt: '2026-01-03T01:00:00Z',
  deployedBy: 'alice',
};

function createDeployBlockedError(issues: unknown[]): Error {
  const error = new Error('Deployment blocked: referenced CDM schema state is not deployable') as Error & {
    code?: string;
    statusCode?: number;
    retryable?: boolean;
    details?: unknown;
  };
  error.code = 'DEPLOY_BLOCKED_CDM_SCHEMA_STATE';
  error.statusCode = 409;
  error.retryable = false;
  error.details = { issues };
  return error;
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listRevisions: vi.fn().mockResolvedValue(REVISIONS),
    listVersions: vi.fn().mockResolvedValue(VERSIONS),
    getCurrentDeployments: vi.fn().mockResolvedValue(CURRENT_DEPLOYMENTS),
    deployMapping: vi.fn().mockResolvedValue(DEPLOY_RECORD),
    // stubs for the rest
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
    getVersion: vi.fn(),
    getMappingRevision: vi.fn(),
    listMappingRevisions: vi.fn(),
    getRevision: vi.fn(),
    createMappingVersion: vi.fn(),
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
    promoteDeployment: vi.fn(),
    rollbackDeployment: vi.fn(),
    listDeployments: vi.fn(),
    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),
    autoMap: vi.fn(),
    autoMapSection: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(adapter: ApiAdapter, mappingId = 'map-1', projectId = 'proj-1') {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={[`/projects/${projectId}/mappings/${mappingId}/deploy`]}>
        <Routes>
          <Route
            path="/projects/:projectId/mappings/:mappingId/deploy"
            element={
              <DeploymentPage
                mappingId={mappingId}
                projectId={projectId}
                mappingName="Test Mapping"
              />
            }
          />
          <Route
            path="/projects/:projectId/mappings/:mappingId"
            element={<div data-testid="editor-page">Editor</div>}
          />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page with title', async () => {
    renderPage(createMockAdapter());
    // deployment-page wrapper is rendered immediately
    expect(screen.getByTestId('deployment-page')).toBeTruthy();
    expect(screen.getByText(/Deploy: Test Mapping/)).toBeTruthy();
  });

  it('shows loading skeleton initially', () => {
    renderPage(createMockAdapter());
    expect(screen.getByTestId('deployment-loading')).toBeTruthy();
  });

  it('renders environment selector after load', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('environment-selector'));
  });

  it('DEV: shows both revision and version sections with active deploy buttons', async () => {
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('revision-section'));

    // DEV is default
    expect(screen.getByTestId('env-tab-DEV').getAttribute('aria-selected')).toBe('true');

    // Revision deploy buttons should be enabled
    const revDeployBtn = screen.getByTestId('deploy-revision-3') as HTMLButtonElement;
    expect(revDeployBtn.disabled).toBe(false);

    // Version deploy buttons should also be enabled
    const verDeployBtn = screen.getByTestId('deploy-version-2') as HTMLButtonElement;
    expect(verDeployBtn.disabled).toBe(false);
  });

  it('PREPROD: revision deploy buttons are disabled', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('env-tab-PREPROD'));

    await user.click(screen.getByTestId('env-tab-PREPROD'));

    await waitFor(() => {
      const revDeployBtn = screen.getByTestId('deploy-revision-3') as HTMLButtonElement;
      expect(revDeployBtn.disabled).toBe(true);
    });
  });

  it('PROD: revision deploy buttons are disabled', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('env-tab-PROD'));

    await user.click(screen.getByTestId('env-tab-PROD'));

    await waitFor(() => {
      const revDeployBtn = screen.getByTestId('deploy-revision-3') as HTMLButtonElement;
      expect(revDeployBtn.disabled).toBe(true);
    });
  });

  it('PREPROD: version deploy buttons are enabled', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('env-tab-PREPROD'));

    await user.click(screen.getByTestId('env-tab-PREPROD'));

    await waitFor(() => {
      const verDeployBtn = screen.getByTestId('deploy-version-2') as HTMLButtonElement;
      expect(verDeployBtn.disabled).toBe(false);
    });
  });

  it('deploy action calls adapter.deployMapping with correct params', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    expect(adapter.deployMapping).toHaveBeenCalledWith('map-1', {
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 3,
    });
  });

  it('deploy action for version calls adapter.deployMapping with version source type', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => screen.getByTestId('deploy-version-2'));

    await user.click(screen.getByTestId('deploy-version-2'));

    expect(adapter.deployMapping).toHaveBeenCalledWith('map-1', {
      environment: 'DEV',
      sourceType: 'version',
      sourceNumber: 2,
    });
  });

  it('shows success banner after successful deploy', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    await waitFor(() => screen.getByTestId('deploy-success-banner'));

    expect(screen.getByTestId('deploy-success-banner').textContent).toContain(
      'deployed to DEV successfully',
    );
  });

  it('shows error banner when deploy fails', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      deployMapping: vi.fn().mockRejectedValue(new Error('Deploy failed: permission denied')),
    });
    renderPage(adapter);

    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    await waitFor(() => screen.getByTestId('deploy-error-banner'));

    expect(screen.getByTestId('deploy-error-banner').textContent).toContain('permission denied');
  });

  it('renders schema-specific deploy-block reasons and remediation CTAs from backend issues', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      deployMapping: vi.fn().mockRejectedValue(
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
    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    await waitFor(() => screen.getByTestId('cdm-block-list'));
    expect(screen.getByTestId('cdm-block-issue-source-schema-source').textContent).toContain(
      'Source schema: Order Source — Not synced yet',
    );
    expect(screen.getByTestId('cdm-block-issue-target-schema-target').textContent).toContain(
      'Target schema: schema-target — Schema is missing',
    );

    const sourceCta = screen.getByTestId('cdm-remediation-cta-source-schema-source');
    expect(sourceCta.textContent).toContain('Open schema to re-sync');
    expect(sourceCta.getAttribute('href')).toBe('/schemas/schema-source');

    const targetCta = screen.getByTestId('cdm-remediation-cta-target-schema-target');
    expect(targetCta.textContent).toContain('Open schema library to relink');
    expect(targetCta.getAttribute('href')).toBe('/schemas');
  });

  it('clears prior deploy-block messaging after successful retry', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      deployMapping: vi
        .fn()
        .mockRejectedValueOnce(
          createDeployBlockedError([
            {
              schemaId: 'schema-source',
              referenceRole: 'source',
              reason: 'update-failed',
              remediationKey: 'retry-sync',
            },
          ]),
        )
        .mockResolvedValueOnce(DEPLOY_RECORD),
    });

    renderPage(adapter);
    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));
    await waitFor(() => screen.getByTestId('cdm-block-list'));

    await user.click(screen.getByTestId('deploy-revision-3'));
    await waitFor(() => screen.getByTestId('deploy-success-banner'));

    expect(screen.queryByTestId('cdm-block-list')).toBeNull();
  });

  it('keeps generic error treatment for non-CDM deployment failures', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      deployMapping: vi.fn().mockRejectedValue(
        Object.assign(new Error('Conflict: duplicate deployment request'), {
          code: 'CONFLICT',
          statusCode: 409,
          retryable: false,
        }),
      ),
    });

    renderPage(adapter);
    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    await waitFor(() => screen.getByTestId('deploy-error-banner'));
    expect(screen.getByTestId('deploy-error-banner').textContent).toContain('duplicate deployment request');
    expect(screen.queryByTestId('cdm-block-list')).toBeNull();
  });

  it('dismisses success banner on close', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('deploy-revision-3'));

    await user.click(screen.getByTestId('deploy-revision-3'));

    await waitFor(() => screen.getByTestId('deploy-success-banner'));

    await user.click(screen.getByRole('button', { name: /Dismiss success/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('deploy-success-banner')).toBeNull();
    });
  });

  it('shows error state when data load fails', async () => {
    const adapter = createMockAdapter({
      listRevisions: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('deployment-loading')).toBeNull();
    });

    expect(screen.getByText(/Network error/)).toBeTruthy();
  });

  it('back-to-editor link is present', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('back-to-editor-link'));
  });

  it('current deployment strip shows for active environment', async () => {
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('current-deploy-strip-DEV'));

    const strip = screen.getByTestId('current-deploy-strip-DEV');
    expect(strip.textContent).toContain('v2');
    expect(strip.textContent).toContain('Current');
  });
});
