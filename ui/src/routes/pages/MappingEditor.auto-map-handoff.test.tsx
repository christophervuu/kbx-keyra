import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { saveAutoMapSuggestions } from '@/features/mappings/lib';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { MappingConfig, ProjectDetail, SchemaDetail } from '@/lib/types/domain';
import MappingEditor from '@/routes/pages/MappingEditor';

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

const MOCK_CONFIG: MappingConfig = {
  id: 'mapping-1',
  projectId: 'project-1',
  name: 'Test Mapping',
  version: 1,
  engineVersion: '1.0.0',
  sourceSchemaRef: { schemaId: 'source-schema-1', type: 'local' },
  targetSchemaRef: { schemaId: 'target-schema-1', type: 'local' },
  config: { unmappedTargets: 'omit' },
  rules: [],
};

const MOCK_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Source Schema',
    format: 'json-schema',
    fieldCount: 1,
    origin: 'uploaded',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
    },
  },
};

const MOCK_TARGET_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Target Schema',
    format: 'json-schema',
    fieldCount: 1,
    origin: 'uploaded',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      Order: {
        type: 'object',
        properties: {
          Id: { type: 'string' },
        },
      },
    },
  },
};

const PROJECT_DETAIL: ProjectDetail = {
  projectId: 'project-1',
  name: 'Project One',
  description: '',
  slug: 'project-one',
  schemaRefs: [],
  linkedSchemaIds: [],
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mappings: [],
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
    saveMapping: vi.fn().mockResolvedValue({ revision: 2, noChange: false }),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn().mockResolvedValue(PROJECT_DETAIL),
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
        totalIssues: 0,
        bySeverity: { info: 0, warning: 0, error: 0 },
        byCategory: { correctness: 0, completeness: 0, maintainability: 0, risk: 0 },
      },
      issues: [],
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
    createMappingVersion: vi.fn(),
    listRevisions: vi.fn().mockResolvedValue([]),
    getRevision: vi.fn(),
    createVersion: vi.fn(),
    saveMappingVersion: vi.fn(),
    ...overrides,
  } as ApiAdapter;
}

function renderEditor(adapter: ApiAdapter) {
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

describe('MappingEditor auto-map handoff contract', () => {
  it('hydrates pending auto-map session from mappingId persistence on editor re-entry', async () => {
    sessionStorageMock.clear();

    saveAutoMapSuggestions('mapping-1', '', [
      {
        targetPath: 'Order.Id',
        suggestedExpression: 'source("orderId")',
        explanation: 'Maps order id',
        confidence: 'high',
        validation: { valid: true, diagnostics: [] },
        status: 'suggested',
        isNew: true,
        existingExpressionAtGeneration: null,
      },
    ], {
      generatedAt: '2026-06-08T11:00:00.000Z',
    });

    const adapter = createMockAdapter();
    renderEditor(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('builder-panel')).toHaveAttribute('data-automap-mode', 'true');
    });

    expect(screen.getByTestId('automap-reentry-pill')).toHaveTextContent('Auto-Map: 1 pending');
  });
});
