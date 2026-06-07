// HomeDashboardPage.test.tsx — Integration test for the assembled dashboard page (FS-014 T-11, FS-049 T-08)

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { AdapterProvider } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectMetadata, SchemaMetadata } from '@/lib/types/domain';

import { HomeDashboardPage } from '../HomeDashboardPage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<ProjectMetadata> = {}): ProjectMetadata {
  return {
    projectId: 'proj-1',
    name: 'Alpha Project',
    description: 'A test project',
    slug: 'alpha-project',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSchema(id: string): SchemaMetadata {
  return {
    schemaId: id,
    name: `Schema ${id}`,
    format: 'json-schema',
    fieldCount: 5,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeMapping(overrides: Partial<MappingMetadata> = {}): MappingMetadata {
  return {
    mappingId: 'm-1',
    projectId: 'proj-1',
    name: 'Mapping One',
    version: 1,
    status: 'ready',
    ruleCount: 2,
    coverage: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  const emptyDeployments: CurrentDeployments = {
    DEV: { environment: 'DEV', deployment: null, status: 'not-deployed' },
    PREPROD: { environment: 'PREPROD', deployment: null, status: 'not-deployed' },
    PROD: { environment: 'PROD', deployment: null, status: 'not-deployed' },
    QA: { environment: 'QA', deployment: null, status: 'not-deployed' },
  };

  return {
    listProjects: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn().mockResolvedValue([]),
    listMappings: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
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
    getCurrentDeployments: vi.fn().mockResolvedValue(emptyDeployments),
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
    ...overrides,
  } as unknown as ApiAdapter;
}

function renderPage(adapter: ApiAdapter) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AdapterProvider adapter={adapter}>
        <HomeDashboardPage />
      </AdapterProvider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HomeDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders data-testid="page-home-dashboard"', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);
    expect(screen.getByTestId('page-home-dashboard')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn(() => new Promise(() => {})), // never resolves
      listSchemas: vi.fn(() => new Promise(() => {})),
    });
    renderPage(adapter);
    expect(screen.getByRole('status', { name: /loading dashboard/i })).toBeInTheDocument();
  });

  it('shows error banner when load fails', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockRejectedValue(new Error('Network error')),
      listSchemas: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows empty state when no projects', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
      listSchemas: vi.fn().mockResolvedValue([makeSchema('s-1')]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
  });

  it('shows full dashboard with project list when projects exist', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([makeSchema('s-1')]),
      listMappings: vi.fn().mockResolvedValue([makeMapping()]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });
  });

  it('renders the PageHeader title', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });
  });

  it('does not render a tab bar (DashboardTabs removed in FS-049)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('does not render a Schema Library card (removed in FS-049)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([makeSchema('s-1'), makeSchema('s-2')]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });
    expect(screen.queryByText(/schema library/i)).not.toBeInTheDocument();
  });

  it('does not render metrics region in the loaded state (AE-10)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([makeSchema('s-1')]),
      listMappings: vi.fn().mockResolvedValue([makeMapping()]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: /dashboard metrics/i })).not.toBeInTheDocument();
  });

  it('does not render metrics region in the empty state (AE-10)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
      listSchemas: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: /dashboard metrics/i })).not.toBeInTheDocument();
  });

  it('retry button triggers a re-fetch on error', async () => {
    const listProjects = vi.fn().mockRejectedValueOnce(new Error('fail'));
    const listSchemas = vi.fn().mockRejectedValueOnce(new Error('fail'));
    const adapter = createMockAdapter({ listProjects, listSchemas });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    listProjects.mockResolvedValueOnce([]);
    listSchemas.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => {
      expect(listProjects).toHaveBeenCalledTimes(2);
    });
  });

  it('renders Projects panel in the loaded state (AE-04/AE-05)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([makeMapping()]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^projects$/i })).toBeInTheDocument();
    });
  });

  it('renders projects empty state in the empty state (AE-06)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
      listSchemas: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: /^projects$/i })).not.toBeInTheDocument();
  });

  it('renders ActivityPlaceholder in the right rail for loaded state', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('activity-placeholder')).toBeInTheDocument();
    });
  });

  it('renders ActivityPlaceholder in the right rail for error state', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockRejectedValue(new Error('fail')),
      listSchemas: vi.fn().mockRejectedValue(new Error('fail')),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('activity-placeholder')).toBeInTheDocument();
    });
  });

  it('renders ActivityPlaceholder in the right rail for empty state', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
      listSchemas: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('activity-placeholder')).toBeInTheDocument();
  });

  it('renders New project button in header (AE-04)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    });
  });

  it('renders search and view toggle controls in Projects panel (AE-05/AE-07)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: /search projects/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /grid view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table view/i })).toBeInTheDocument();
  });

  it('does not render ContinueWhereYouLeftOff when no recent items (empty localStorage)', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('continue-where-you-left-off')).not.toBeInTheDocument();
  });
});
