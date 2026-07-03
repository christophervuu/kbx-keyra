import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { saveAutoMapSuggestions } from '@/features/mappings/lib';
import { AdapterProvider, createQueryClient } from '@/lib/api';
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
    listProjectValueTables: vi.fn().mockResolvedValue([]),
    getProjectValueTable: vi.fn(),
    getProjectValueTableRevision: vi.fn(),
    createProjectValueTable: vi.fn(),
    createProjectValueTableRevision: vi.fn(),
    duplicateProjectValueTable: vi.fn(),
    archiveProjectValueTable: vi.fn(),
    deleteProjectValueTable: vi.fn(),
    listProjectValueTableUsage: vi.fn(),
    getProjectValueTableRevisionDiff: vi.fn(),
    exportProjectValueTableCsv: vi.fn(),
    importProjectValueTableCsv: vi.fn(),
    resolveProjectValueTableReference: vi.fn(),
    listGlobalValueMaps: vi.fn().mockResolvedValue([]),
    createGlobalValueMap: vi.fn(),
    getGlobalValueMap: vi.fn(),
    listGlobalValueMapRevisions: vi.fn(),
    createGlobalValueMapRevision: vi.fn(),
    getGlobalValueMapRevision: vi.fn(),
    archiveGlobalValueMap: vi.fn(),
    getGlobalValueMapUsage: vi.fn(),
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

function renderEditor(
  adapter: ApiAdapter,
  initialEntry:
    | string
    | {
      pathname: string;
      state?: Record<string, unknown>;
    } = '/projects/project-1/mappings/mapping-1',
) {
  const queryClient = createQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:projectId/mappings/:mappingId',
        element: <MappingEditor />,
      },
    ],
    {
      initialEntries: [initialEntry],
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      },
    },
  );

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <AdapterProvider adapter={adapter}>
        <RouterProvider
          router={router}
          future={{
            v7_startTransition: true,
          }}
        />
      </AdapterProvider>
    </QueryClientProvider>,
  );

  return {
    router,
    queryClient,
    ...rendered,
  };
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
      expect(screen.getByTestId('mapping-fields-card').className).toContain('w-[min(96%,1600px)]');
      expect(screen.queryByTestId('builder-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('source-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('automap-workspace')).toBeInTheDocument();
    });

    expect(screen.getByTestId('automap-reentry-pill')).toHaveTextContent('Auto-Map: 1 pending');
  });

  it('opens contextual Source + Builder details when editing a suggestion from full-width auto-map review', async () => {
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
      expect(screen.getByTestId('automap-workspace')).toBeInTheDocument();
      expect(screen.queryByTestId('builder-panel')).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('edit-Order.Id'));

    await waitFor(() => {
      expect(screen.queryByTestId('automap-workspace')).not.toBeInTheDocument();
      expect(screen.getByTestId('source-card')).toBeInTheDocument();
      expect(screen.getByTestId('builder-panel')).toBeInTheDocument();
      expect(screen.getByTestId('builder-panel')).not.toHaveAttribute('data-automap-mode', 'true');
    });
  });

  it('consumes create-time auto-map route state and triggers root auto-map fetch once', async () => {
    sessionStorageMock.clear();

    const autoMapSection = vi.fn().mockResolvedValue({
      suggestions: [],
      session: {
        sessionId: 'ams-1',
        runId: 'run-1',
        runStatus: 'completed',
        executionMode: 'async',
        queued: false,
      },
    });
    const adapter = createMockAdapter({ autoMapSection });

    const { router, queryClient, rerender } = renderEditor(
      adapter,
      {
        pathname: '/projects/project-1/mappings/mapping-1',
        state: {
          autoMapCreate: true,
        },
      },
    );

    await waitFor(() => {
      expect(autoMapSection).toHaveBeenCalledTimes(1);
    });

    expect(autoMapSection).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      mappingId: 'mapping-1',
      mode: 'whole',
    }));

    await waitFor(() => {
      const locationState = router.state.location.state as Record<string, unknown> | null;
      expect(locationState?.autoMapCreate).toBeUndefined();
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>
          <RouterProvider
            router={router}
            future={{
              v7_startTransition: true,
            }}
          />
        </AdapterProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(autoMapSection).toHaveBeenCalledTimes(1);
    });
  });

});
