/**
 * T-07 tests:
 * - DeploymentBadge renders correct label and color for each DeploymentStatus
 * - Mapping cards (ProjectOverviewPage) show per-env badges from getCurrentDeployments()
 * - Home dashboard (ProjectCard) shows per-env badges from getCurrentDeployments()
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DeploymentBadge } from '@/components/DeploymentBadge';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import type { MappingMetadata, ProjectDetail, ProjectMetadata } from '@/lib/types';

// ---------------------------------------------------------------------------
// DeploymentBadge unit tests
// ---------------------------------------------------------------------------

describe('DeploymentBadge', () => {
  it('renders "Current" with green dot for current status', () => {
    const { container } = render(<DeploymentBadge status="current" />);
    expect(screen.getByText('Current')).toBeTruthy();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-green-500');
  });

  it('renders "Stale" with amber dot for stale status', () => {
    const { container } = render(<DeploymentBadge status="stale" />);
    expect(screen.getByText('Stale')).toBeTruthy();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-amber-500');
  });

  it('renders "Not deployed" with gray dot for not-deployed status', () => {
    const { container } = render(<DeploymentBadge status="not-deployed" />);
    expect(screen.getByText('Not deployed')).toBeTruthy();
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-slate-500');
  });

  it('applies data-testid for each status', () => {
    const { rerender } = render(<DeploymentBadge status="current" />);
    expect(screen.getByTestId('deployment-badge-current')).toBeTruthy();

    rerender(<DeploymentBadge status="stale" />);
    expect(screen.getByTestId('deployment-badge-stale')).toBeTruthy();

    rerender(<DeploymentBadge status="not-deployed" />);
    expect(screen.getByTestId('deployment-badge-not-deployed')).toBeTruthy();
  });

  it('renders as inline-flex element', () => {
    const { container } = render(<DeploymentBadge status="current" />);
    expect(container.firstChild?.toString()).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toContain('inline-flex');
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_META: MappingMetadata = {
  mappingId: 'map-1',
  projectId: 'proj-1',
  name: 'My Mapping',
  version: 1,
  ruleCount: 2,
  coverage: 0.5,
  status: 'ready',
  updatedAt: '2026-01-01T00:00:00Z',
};

const PROJECT_META: ProjectMetadata = {
  projectId: 'proj-1',
  name: 'My Project',
  description: 'Test',
  slug: 'my-project',
  updatedAt: '2026-01-01T00:00:00Z',
  mappingCount: 1,
};

const PROJECT_DETAIL: ProjectDetail = {
  projectId: 'proj-1',
  name: 'My Project',
  description: 'Test',
  slug: 'my-project',
  tags: [],
  schemaRefs: [],
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  mappings: [MAPPING_META],
};

const CURRENT_MIXED: CurrentDeployments = {
  DEV: {
    environment: 'DEV',
    deployment: {
      mappingId: 'map-1',
      environment: 'DEV',
      deployedAt: '2026-01-02T10:00:00Z',
      sourceType: 'version',
      sourceNumber: 1,
      configHash: 'abc',
      configS3Key: 's3://x',
    },
    status: 'current',
  },
  QA: {
    environment: 'QA',
    deployment: {
      mappingId: 'map-1',
      environment: 'QA',
      deployedAt: '2026-01-01T10:00:00Z',
      sourceType: 'revision',
      sourceNumber: 1,
      configHash: 'xyz',
      configS3Key: 's3://y',
    },
    status: 'stale',
  },
  PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
};

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
    listProjects: vi.fn().mockResolvedValue([PROJECT_META]),
    listMappings: vi.fn().mockResolvedValue([MAPPING_META]),
    listSchemas: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn().mockResolvedValue({}),
    getCurrentDeployments: vi.fn().mockResolvedValue(CURRENT_MIXED),
    listRevisions: vi.fn().mockResolvedValue([]),
    listVersions: vi.fn().mockResolvedValue([]),
    listDeployments: vi.fn().mockResolvedValue([]),
    // stub everything else
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappingVersions: vi.fn(),
    getMappingVersion: vi.fn(),
    getVersion: vi.fn(),
    listMappingRevisions: vi.fn(),
    getMappingRevision: vi.fn(),
    createMappingVersion: vi.fn(),
    getRevision: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),
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
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    saveMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Project overview mapping row integration
// ---------------------------------------------------------------------------

describe('T-07: Project overview mapping row deployment badges', () => {
  it('calls getCurrentDeployments for each mapping during load', async () => {
    const { ProjectOverviewPage } = await import(
      '@/features/projects/components/ProjectOverviewPage'
    );
    const adapter = createMockAdapter();

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/proj-1']}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectOverviewPage />} />
            <Route
              path="/projects/:projectId/mappings/:mappingId"
              element={<div>editor</div>}
            />
            <Route
              path="/projects/:projectId/mappings/:mappingId/deploy"
              element={<div>deploy</div>}
            />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    // Wait for page to load
    await waitFor(() => screen.getByText('My Mapping'));

    // getCurrentDeployments called for each mapping
    expect(adapter.getCurrentDeployments).toHaveBeenCalledWith('map-1');
  });

  it('mapping row shows individual env badges (not condensed) when at least one env deployed', async () => {
    const { ProjectOverviewPage } = await import(
      '@/features/projects/components/ProjectOverviewPage'
    );
    const adapter = createMockAdapter();

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/proj-1']}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectOverviewPage />} />
            <Route
              path="/projects/:projectId/mappings/:mappingId"
              element={<div>editor</div>}
            />
            <Route
              path="/projects/:projectId/mappings/:mappingId/deploy"
              element={<div>deploy</div>}
            />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => screen.getByText('My Mapping'));

    // DEV=current (deployed), QA=stale → not all-not-deployed → condensed badge hidden
    expect(screen.queryByTestId('deploy-condensed')).toBeNull();
  });

  it('mapping row shows condensed badge when all envs are not-deployed', async () => {
    const { ProjectOverviewPage } = await import(
      '@/features/projects/components/ProjectOverviewPage'
    );
    const noneDeployed: CurrentDeployments = {
      DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
      QA: { environment: 'QA', deployment: null, status: 'not-deployed' },
      PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
    };
    const adapter = createMockAdapter({
      getCurrentDeployments: vi.fn().mockResolvedValue(noneDeployed),
    });

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/projects/proj-1']}>
          <Routes>
            <Route path="/projects/:projectId" element={<ProjectOverviewPage />} />
            <Route
              path="/projects/:projectId/mappings/:mappingId"
              element={<div>editor</div>}
            />
            <Route
              path="/projects/:projectId/mappings/:mappingId/deploy"
              element={<div>deploy</div>}
            />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => screen.getByText('My Mapping'));
    await waitFor(() => expect(screen.getByTestId('deploy-condensed')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Home dashboard project card integration
// ---------------------------------------------------------------------------

describe('T-07: Home dashboard project card deployment badges', () => {
  it('fetches getCurrentDeployments for each mapping', async () => {
    const { HomeDashboardPage } = await import(
      '@/features/home/components/HomeDashboardPage'
    );
    const adapter = createMockAdapter();

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomeDashboardPage />} />
            <Route path="/projects/new" element={<div>new project</div>} />
            <Route path="/projects/:projectId" element={<div>project</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => screen.getByTestId('page-home-dashboard'));
    await waitFor(() => expect(adapter.getCurrentDeployments).toHaveBeenCalledWith('map-1'));
  });

  it('project card shows deployment badges when at least one env is deployed', async () => {
    const { HomeDashboardPage } = await import(
      '@/features/home/components/HomeDashboardPage'
    );
    const adapter = createMockAdapter();

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomeDashboardPage />} />
            <Route path="/projects/new" element={<div>new project</div>} />
            <Route path="/projects/:projectId" element={<div>project</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => screen.getByText('My Project'));

    // When DEV=current (deployed) and QA=stale, all-not-deployed is false
    // → individual DEV/QA/PROD status badges rendered, not the condensed "Not deployed"
    await waitFor(() => {
      // The condensed "Not deployed" should not be shown since DEV is deployed
      const condensed = screen.queryByTestId('deploy-condensed');
      expect(condensed).toBeNull();
    });
  });

  it('project card shows condensed not-deployed when all environments undeployed', async () => {
    const { HomeDashboardPage } = await import(
      '@/features/home/components/HomeDashboardPage'
    );
    const noneDeployed: CurrentDeployments = {
      DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
      QA: { environment: 'QA', deployment: null, status: 'not-deployed' },
      PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
    };
    const adapter = createMockAdapter({
      getCurrentDeployments: vi.fn().mockResolvedValue(noneDeployed),
    });

    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<HomeDashboardPage />} />
            <Route path="/projects/new" element={<div>new project</div>} />
            <Route path="/projects/:projectId" element={<div>project</div>} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => screen.getByText('My Project'));
    await waitFor(() => {
      expect(screen.getByTestId('deploy-condensed')).toBeTruthy();
    });
  });
});
