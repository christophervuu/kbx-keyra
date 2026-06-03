import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';
import MappingEditor from '@/routes/pages/MappingEditor';

const MOCK_CONFIG: MappingConfig = {
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 3,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'source-schema-1', type: 'local' },
  targetSchemaRef: { schemaId: 'target-schema-1', type: 'local' },
  config: { unmappedTargets: 'omit' },
  rules: [
    { target: 'Order.Header.Currency', type: 'string', expression: 'source("currency")' },
    { target: 'Order.Header.Total', type: 'number', expression: 'source("total")' },
  ],
};

const MOCK_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Source Schema',
    format: 'json-schema',
    fieldCount: 2,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      currency: { type: 'string' },
      total: { type: 'number' },
    },
  },
};

const MOCK_TARGET_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Target Schema',
    format: 'json-schema',
    fieldCount: 2,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      Order: {
        type: 'object',
        properties: {
          Header: {
            type: 'object',
            properties: {
              Currency: { type: 'string' },
              Total: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

function createMockAdapter(overrides?: Partial<ApiAdapter>): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockImplementation((id: string) => {
      if (id === 'source-schema-1') return Promise.resolve(MOCK_SOURCE_SCHEMA);
      if (id === 'target-schema-1') return Promise.resolve(MOCK_TARGET_SCHEMA);
      return Promise.reject(new Error(`Schema ${id} not found`));
    }),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn().mockResolvedValue(MOCK_CONFIG),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    saveMapping: vi.fn().mockResolvedValue({ revision: 4, noChange: false }),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn().mockResolvedValue({
      projectId: 'project-1',
      name: 'Project One',
      description: '',
      slug: 'project-one',
      schemaRefs: [],
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      mappings: [],
    }),
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
    validateMappings: vi.fn().mockResolvedValue({
      summary: {
        totalIssues: 1,
        bySeverity: { info: 0, warning: 1, error: 0 },
        byCategory: {
          correctness: 0,
          completeness: 1,
          maintainability: 0,
          risk: 0,
        },
      },
      issues: [
        {
          id: 'issue-1',
          category: 'completeness',
          severity: 'warning',
          affectedRules: [{ targetPath: 'Order.Header.Currency' }],
          description: 'Fallback missing for currency.',
          recommendation: 'Add default().',
        },
      ],
    }),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    listMappingVersions: vi.fn().mockResolvedValue([]),
    getMappingVersion: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getVersion: vi.fn(),
    listMappingRevisions: vi.fn().mockResolvedValue([]),
    getMappingRevision: vi.fn(),
    listRevisions: vi.fn().mockResolvedValue([]),
    getRevision: vi.fn(),
    createMappingVersion: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),
    ...overrides,
  } as ApiAdapter;
}

function renderPage(adapter: ApiAdapter) {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:projectId/mappings/:mappingId',
        element: <MappingEditor />,
      },
    ],
    {
      initialEntries: ['/projects/project-1/mappings/mapping-1'],
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      },
    },
  );

  return render(
    <AdapterProvider adapter={adapter}>
      <RouterProvider
        router={router}
        future={{
          v7_startTransition: true,
        }}
      />
    </AdapterProvider>,
  );
}

describe('MappingEditor AI Validation integration', () => {
  it('renders AI panel in rules view and keeps deterministic summary visible', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toolbar-view-rules'));

    expect(screen.getByTestId('ai-validation-panel')).toBeInTheDocument();
    expect(screen.getByTestId('validation-summary-bar')).toBeInTheDocument();
    expect(screen.getByTestId('ai-validation-advisory-label')).toHaveTextContent(
      'AI findings are advisory/additive',
    );
  });

  it('runs AI validation and supports issue-to-rule navigation in rules view', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toolbar-view-rules'));
    fireEvent.click(screen.getByTestId('ai-validation-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-validation-report')).toBeInTheDocument();
    });

    expect(adapter.validateMappings).toHaveBeenCalledWith({ mappingId: 'mapping-1' });

    fireEvent.click(screen.getByTestId('ai-validation-issue-link-issue-1-0'));
    expect(screen.getByTestId('rule-row-0')).toHaveAttribute('data-active', 'true');
  });
});
