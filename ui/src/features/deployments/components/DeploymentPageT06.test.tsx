/**
 * T-06 acceptance tests:
 *  - Deployment history shows entries with source type and number
 *  - Promote button only appears for version-backed deployments (AE-07)
 *  - Rollback calls adapter with correct reference
 *  - Environment comparison shows all three environments with staleness
 */
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
  { revision: 2, savedAt: '2026-01-02T00:00:00Z', savedBy: 'alice', ruleCount: 4 },
  { revision: 1, savedAt: '2026-01-01T00:00:00Z', savedBy: 'alice', ruleCount: 2 },
];

const VERSIONS: MappingVersion[] = [
  { version: 1, revisionNumber: 2, createdAt: '2026-01-02T00:00:00Z', createdBy: 'alice' },
];

// DEV = version-backed, PREPROD = revision-backed, PROD = not-deployed
const CURRENT_WITH_MIXED: CurrentDeployments = {
  DEV: {
    environment: 'DEV',
    deployment: {
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-01-02T10:00:00Z',
      sourceType: 'version',
      sourceNumber: 1,
      artifactId: 'artifact-dev-1',
      artifactHash: 'hash-dev-1-abcdef',
      configHash: 'abc',
      configS3Key: 's3://bucket/map-1/v1.json',
    },
    status: 'current',
  },
  PREPROD: {
    environment: 'PREPROD',
    deployment: {
      mappingId: 'map-1',
      environment: 'PREPROD',
      deployedAt: '2026-01-01T10:00:00Z',
      sourceType: 'revision',
      sourceNumber: 1,
      artifactId: 'artifact-preprod-1',
      artifactHash: 'hash-preprod-1-xyz',
      configHash: 'xyz',
      configS3Key: 's3://bucket/map-1/rev1.json',
    },
    status: 'stale',
  },
  PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
};

const HISTORY_RECORDS: DeploymentRecord[] = [
  {
    mappingId: 'map-1',
    environmentDeployedAt: 'DEV#2026-01-02T10:00:00Z',
    environment: 'DEV',
    sourceType: 'version',
    sourceNumber: 1,
    artifactId: 'artifact-dev-1',
    artifactHash: 'hash-dev-1-abcdef',
    configS3Key: 's3://bucket/map-1/v1.json',
    configHash: 'abc',
    deployedAt: '2026-01-02T10:00:00Z',
    deployedBy: 'alice',
  },
  {
    mappingId: 'map-1',
    environmentDeployedAt: 'DEV#2026-01-01T09:00:00Z',
    environment: 'DEV',
    sourceType: 'revision',
    sourceNumber: 2,
    artifactId: 'artifact-dev-rev2',
    artifactHash: 'hash-dev-rev2-def',
    configS3Key: 's3://bucket/map-1/rev2.json',
    configHash: 'def',
    deployedAt: '2026-01-01T09:00:00Z',
    deployedBy: 'alice',
  },
];

const PROMOTE_RECORD: DeploymentRecord = {
  mappingId: 'map-1',
  environmentDeployedAt: 'PREPROD#2026-01-02T11:00:00Z',
  environment: 'PREPROD',
  sourceType: 'version',
  sourceNumber: 1,
  artifactId: 'artifact-dev-1',
  artifactHash: 'hash-dev-1-abcdef',
  configS3Key: 's3://bucket/map-1/v1.json',
  configHash: 'abc',
  deployedAt: '2026-01-02T11:00:00Z',
  deployedBy: 'alice',
  promotedFrom: 'DEV',
};

const ROLLBACK_RECORD: DeploymentRecord = {
  mappingId: 'map-1',
  environmentDeployedAt: 'DEV#2026-01-02T12:00:00Z',
  environment: 'DEV',
  sourceType: 'revision',
  sourceNumber: 2,
  artifactId: 'artifact-dev-rev2',
  artifactHash: 'hash-dev-rev2-def',
  configS3Key: 's3://bucket/map-1/rev2.json',
  configHash: 'def',
  deployedAt: '2026-01-02T12:00:00Z',
  deployedBy: 'alice',
  rollbackOf: 'DEV#2026-01-02T10:00:00Z',
};

function createDeployBlockedError(issues: unknown[]): Error {
  const error = new Error('Promotion blocked: referenced CDM schema state is not deployable') as Error & {
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
    getCurrentDeployments: vi.fn().mockResolvedValue(CURRENT_WITH_MIXED),
    deployMapping: vi.fn().mockResolvedValue(HISTORY_RECORDS[0]),
    promoteDeployment: vi.fn().mockResolvedValue(PROMOTE_RECORD),
    rollbackDeployment: vi.fn().mockResolvedValue(ROLLBACK_RECORD),
    listDeployments: vi.fn().mockResolvedValue(HISTORY_RECORDS),
    // stubs
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

function renderPage(adapter: ApiAdapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={['/projects/proj-1/mappings/map-1/deploy']}>
        <Routes>
          <Route
            path="/projects/:projectId/mappings/:mappingId/deploy"
            element={
              <DeploymentPage mappingId="map-1" projectId="proj-1" mappingName="My Mapping" />
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

describe('T-06: Environment comparison panel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all three environment cards', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('environment-comparison-panel'));
    expect(screen.getByTestId('env-card-DEV')).toBeTruthy();
    expect(screen.getByTestId('env-card-PREPROD')).toBeTruthy();
    expect(screen.getByTestId('env-card-PROD')).toBeTruthy();
  });

  it('DEV card shows correct status label', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-status-DEV'));
    expect(screen.getByTestId('env-status-DEV').textContent).toBe('Current');
  });

  it('PREPROD card shows stale status', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-status-PREPROD'));
    expect(screen.getByTestId('env-status-PREPROD').textContent).toBe('Stale');
  });

  it('PROD card shows not-deployed status', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-status-PROD'));
    expect(screen.getByTestId('env-status-PROD').textContent).toBe('Not deployed');
  });

  it('DEV source label shows version number', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-source-DEV'));
    expect(screen.getByTestId('env-source-DEV').textContent).toBe('v1');
  });

  it('shows artifact identity on environment cards', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-artifact-DEV'));
    expect(screen.getByTestId('env-artifact-DEV').textContent).toContain('artifact-dev-1');
    expect(screen.getByTestId('env-artifact-PREPROD').textContent).toContain('artifact-preprod-1');
  });

  it('PREPROD source label shows revision number', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-source-PREPROD'));
    expect(screen.getByTestId('env-source-PREPROD').textContent).toBe('Rev 1');
  });
});

describe('T-06: Promote button visibility (AE-07)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DEV promote button shown when version-backed', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-card-DEV'));
    expect(screen.getByTestId('promote-btn-DEV')).toBeTruthy();
  });

  it('DEV promote button hidden when revision-backed', async () => {
    const revisionsOnlyDeployments: CurrentDeployments = {
      ...CURRENT_WITH_MIXED,
      DEV: {
        environment: 'DEV',
        deployment: {
          mappingId: 'map-1',
          environment: 'DEV',
          deployedAt: '2026-01-02T10:00:00Z',
          sourceType: 'revision',
          sourceNumber: 2,
          configHash: 'abc',
          configS3Key: 's3://bucket/map-1/rev2.json',
        },
        status: 'current',
      },
    };
    renderPage(
      createMockAdapter({
        getCurrentDeployments: vi.fn().mockResolvedValue(revisionsOnlyDeployments),
      }),
    );
    await waitFor(() => screen.getByTestId('env-card-DEV'));
    expect(screen.queryByTestId('promote-btn-DEV')).toBeNull();
  });

  it('DEV promote button hidden when not-deployed', async () => {
    const noneDeployments: CurrentDeployments = {
      DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
      PREPROD: { environment: 'PREPROD', deployment: null, status: 'not-deployed' },
      PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
    };
    renderPage(
      createMockAdapter({
        getCurrentDeployments: vi.fn().mockResolvedValue(noneDeployments),
      }),
    );
    await waitFor(() => screen.getByTestId('env-card-DEV'));
    expect(screen.queryByTestId('promote-btn-DEV')).toBeNull();
  });

  it('PROD has no promote button', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('env-card-PROD'));
    expect(screen.queryByTestId('promote-btn-PROD')).toBeNull();
  });

  it('promote button calls adapter.promoteDeployment with correct args', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => screen.getByTestId('promote-btn-DEV'));
    await user.click(screen.getByTestId('promote-btn-DEV'));

    expect(adapter.promoteDeployment).toHaveBeenCalledWith('map-1', {
      fromEnvironment: 'DEV',
      toEnvironment: 'PREPROD',
    });
  });

  it('shows success banner after promote', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    await waitFor(() => screen.getByTestId('promote-btn-DEV'));
    await user.click(screen.getByTestId('promote-btn-DEV'));

    await waitFor(() => screen.getByTestId('deploy-success-banner'));
    expect(screen.getByTestId('deploy-success-banner').textContent).toContain('promoted');
  });

  it('shows schema-specific block messaging for promote guardrail failures', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter({
      promoteDeployment: vi.fn().mockRejectedValue(
        createDeployBlockedError([
          {
            schemaId: 'schema-target',
            schemaName: 'Order Target',
            referenceRole: 'target',
            reason: 'metadata-incomplete',
            remediationKey: 'relink-cdm-schema',
          },
        ]),
      ),
    });

    renderPage(adapter);
    await waitFor(() => screen.getByTestId('promote-btn-DEV'));
    await user.click(screen.getByTestId('promote-btn-DEV'));

    await waitFor(() => screen.getByTestId('cdm-block-list'));
    expect(screen.getByTestId('cdm-block-issue-target-schema-target').textContent).toContain(
      'Target schema: Order Target — Schema metadata is incomplete',
    );
    const cta = screen.getByTestId('cdm-remediation-cta-target-schema-target');
    expect(cta.textContent).toContain('Open schema library to relink');
    expect(cta.getAttribute('href')).toBe('/schemas');
  });
});

describe('T-06: Deployment history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders history table after load', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('history-table-body'));
  });

  it('shows source label for version entry', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('history-table-body'));
    // v1 entry
    expect(screen.getByTestId('history-table-body').textContent).toContain('v1');
  });

  it('history rows render artifact identity column values', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('history-table-body'));
    expect(
      screen.getByTestId(`history-artifact-${HISTORY_RECORDS[0].environmentDeployedAt}`).textContent,
    ).toContain('artifact-dev-1');
    expect(
      screen.getByTestId(`history-artifact-${HISTORY_RECORDS[1].environmentDeployedAt}`).textContent,
    ).toContain('artifact-dev-rev2');
  });

  it('shows source label for revision entry', async () => {
    renderPage(createMockAdapter());
    await waitFor(() => screen.getByTestId('history-table-body'));
    expect(screen.getByTestId('history-table-body').textContent).toContain('Rev 2');
  });

  it('rollback button calls adapter.rollbackDeployment with correct args after confirm', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);

    const sk = HISTORY_RECORDS[1].environmentDeployedAt;
    await waitFor(() => screen.getByTestId(`rollback-btn-${sk}`));
    await user.click(screen.getByTestId(`rollback-btn-${sk}`));

    // Confirm dialog should appear
    await waitFor(() => screen.getByTestId('confirm-dialog'));

    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(adapter.rollbackDeployment).toHaveBeenCalledWith('map-1', {
      environment: 'DEV',
      deploymentSK: sk,
    });
  });

  it('rollback confirm cancel does NOT call adapter', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    renderPage(adapter);

    const sk = HISTORY_RECORDS[1].environmentDeployedAt;
    await waitFor(() => screen.getByTestId(`rollback-btn-${sk}`));
    await user.click(screen.getByTestId(`rollback-btn-${sk}`));

    await waitFor(() => screen.getByTestId('confirm-dialog'));
    await user.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(adapter.rollbackDeployment).not.toHaveBeenCalled();
  });

  it('shows success banner after rollback', async () => {
    const user = userEvent.setup();
    renderPage(createMockAdapter());

    const sk = HISTORY_RECORDS[1].environmentDeployedAt;
    await waitFor(() => screen.getByTestId(`rollback-btn-${sk}`));
    await user.click(screen.getByTestId(`rollback-btn-${sk}`));

    await waitFor(() => screen.getByTestId('confirm-dialog'));
    await user.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => screen.getByTestId('deploy-success-banner'));
    expect(screen.getByTestId('deploy-success-banner').textContent).toContain('Rolled back');
  });

  it('shows empty state when no history', async () => {
    renderPage(
      createMockAdapter({ listDeployments: vi.fn().mockResolvedValue([]) }),
    );
    await waitFor(() => screen.getByTestId('history-empty'));
  });
});
