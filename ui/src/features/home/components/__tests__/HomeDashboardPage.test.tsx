// HomeDashboardPage.test.tsx — Integration test for the assembled dashboard page (FS-014 T-11)

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { AdapterProvider } from '@/lib/api';
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

  it('renders Schema Library card with schema count', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([makeSchema('s-1'), makeSchema('s-2')]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText(/2 schemas/i)).toBeInTheDocument();
    });
  });

  it('renders DashboardTabs when projects are loaded', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([makeProject()]),
      listSchemas: vi.fn().mockResolvedValue([]),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('tablist', { name: /dashboard sections/i })).toBeInTheDocument();
    });
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
});
