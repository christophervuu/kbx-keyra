import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingMetadata, ProjectDetail } from '@/lib/types';

import { SchemaUsageSection } from '../SchemaUsageSection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA_ID = 'schema-abc';

const PROJECT_ALPHA: ProjectDetail = {
  projectId: 'proj-1',
  name: 'Alpha Project',
  description: '',
  slug: 'alpha',
  schemaRefs: [{ schemaId: SCHEMA_ID, type: 'local' }],
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  mappings: [],
};

const PROJECT_BETA: ProjectDetail = {
  projectId: 'proj-2',
  name: 'Beta Project',
  description: '',
  slug: 'beta',
  schemaRefs: [{ schemaId: 'other-schema', type: 'local' }],
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  mappings: [],
};

const MAPPING_SOURCE: MappingMetadata = {
  mappingId: 'map-1',
  projectId: 'proj-1',
  name: 'Alpha Source Mapping',
  version: 1,
  status: 'draft',
  sourceSchemaId: SCHEMA_ID,
  ruleCount: 0,
  coverage: 0,
  updatedAt: '2026-01-02T00:00:00Z',
};

const MAPPING_TARGET: MappingMetadata = {
  mappingId: 'map-2',
  projectId: 'proj-1',
  name: 'Alpha Target Mapping',
  version: 1,
  status: 'draft',
  targetSchemaId: SCHEMA_ID,
  ruleCount: 0,
  coverage: 0,
  updatedAt: '2026-01-02T00:00:00Z',
};

const MAPPING_UNRELATED: MappingMetadata = {
  mappingId: 'map-3',
  projectId: 'proj-1',
  name: 'Unrelated Mapping',
  version: 1,
  status: 'draft',
  sourceSchemaId: 'other-schema',
  ruleCount: 0,
  coverage: 0,
  updatedAt: '2026-01-02T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn().mockResolvedValue([]),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([]),
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

function renderSection(adapter: ApiAdapter) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter>
        <SchemaUsageSection schemaId={SCHEMA_ID} />
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaUsageSection', () => {
  it('shows loading skeleton while fetching', () => {
    // Never resolves — stays loading
    const adapter = createMockAdapter({
      listProjects: vi.fn(() => new Promise(() => {})),
    });
    renderSection(adapter);
    expect(screen.getByTestId('schema-usage-skeleton')).toBeInTheDocument();
  });

  it('shows empty state when schema is not referenced', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'proj-2', name: 'Beta Project', description: '', slug: 'beta', mappingCount: 0, schemaCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue(PROJECT_BETA),
    });
    renderSection(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('schema-usage-empty')).toBeInTheDocument();
    });
  });

  it('renders referencing project with correct link', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'proj-1', name: 'Alpha Project', description: '', slug: 'alpha', mappingCount: 0, schemaCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue(PROJECT_ALPHA),
      listMappings: vi.fn().mockResolvedValue([]),
    });
    renderSection(adapter);
    await waitFor(() => {
      const link = screen.getByTestId('schema-usage-project-link-proj-1');
      expect(link).toHaveTextContent('Alpha Project');
      expect(link).toHaveAttribute('href', '/projects/proj-1');
    });
  });

  it('renders source mapping with role label and correct link', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'proj-1', name: 'Alpha Project', description: '', slug: 'alpha', mappingCount: 0, schemaCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue(PROJECT_ALPHA),
      listMappings: vi.fn().mockResolvedValue([MAPPING_SOURCE, MAPPING_UNRELATED]),
    });
    renderSection(adapter);
    await waitFor(() => {
      const link = screen.getByTestId('schema-usage-mapping-link-map-1');
      expect(link).toHaveTextContent('Alpha Source Mapping');
      expect(link).toHaveAttribute('href', '/projects/proj-1/mappings/map-1');
      expect(screen.getByText('source')).toBeInTheDocument();
    });
    // Unrelated mapping should not appear
    expect(screen.queryByTestId('schema-usage-mapping-link-map-3')).not.toBeInTheDocument();
  });

  it('renders target mapping with role label', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'proj-1', name: 'Alpha Project', description: '', slug: 'alpha', mappingCount: 0, schemaCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn().mockResolvedValue(PROJECT_ALPHA),
      listMappings: vi.fn().mockResolvedValue([MAPPING_TARGET]),
    });
    renderSection(adapter);
    await waitFor(() => {
      const link = screen.getByTestId('schema-usage-mapping-link-map-2');
      expect(link).toHaveTextContent('Alpha Target Mapping');
      expect(screen.getByText('target')).toBeInTheDocument();
    });
  });

  it('shows empty state when no projects reference the schema', async () => {
    const adapter = createMockAdapter({
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderSection(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('schema-usage-empty')).toBeInTheDocument();
    });
  });
});
