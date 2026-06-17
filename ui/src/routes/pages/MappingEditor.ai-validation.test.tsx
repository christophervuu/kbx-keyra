import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { ValidationResult as EngineValidationResult } from '@/lib/engine';
import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';
import MappingEditor from '@/routes/pages/MappingEditor';
import { PATHS } from '@/routes/paths';

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

const SIMPLE_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Source Schema',
    format: 'json-schema',
    fieldCount: 1,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
    },
  },
};

const SIMPLE_TARGET_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Target Schema',
    format: 'json-schema',
    fieldCount: 1,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
    },
  },
};

const MULTI_SOURCE_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'source-schema-1',
    name: 'Multi Source Schema',
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
      firstName: { type: 'string' },
      lastName: { type: 'string' },
    },
  },
};

const SINGLE_TARGET_NAME_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'target-schema-1',
    name: 'Single Target Schema',
    format: 'json-schema',
    fieldCount: 1,
    origin: 'local',
    status: 'ready',
    source: { type: 'upload' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      fullName: { type: 'string' },
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
  return renderWithRouter(adapter, [
    {
      path: '/projects/:projectId/mappings/:mappingId',
      element: <MappingEditor />,
    },
  ]);
}

function renderWithRouter(
  adapter: ApiAdapter,
  routes: Array<{ path: string; element: ReactNode }>,
  initialEntries: string[] = ['/projects/project-1/mappings/mapping-1'],
) {
  const router = createMemoryRouter(routes, {
    initialEntries,
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  });

  const rendered = render(
    <AdapterProvider adapter={adapter}>
      <RouterProvider
        router={router}
        future={{
          v7_startTransition: true,
        }}
      />
    </AdapterProvider>,
  );

  return { ...rendered, router };
}

function createValidationErrorResult(targetPath: string): EngineValidationResult {
  return {
    valid: false,
    diagnostics: [
      {
        code: 'KEYRA-E005',
        severity: 'error',
        message: 'Type mismatch',
        targetPath,
        ruleIndex: 0,
      },
    ],
  };
}

describe('MappingEditor AI Validation integration', () => {
  it('renders AI panel in rules view and keeps deterministic summary visible', async () => {
    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-rules-view'));

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

    fireEvent.click(screen.getByTestId('more-menu-button'));
    fireEvent.click(screen.getByTestId('more-menu-rules-view'));
    fireEvent.click(screen.getByTestId('ai-validation-run'));

    await waitFor(() => {
      expect(screen.getByTestId('ai-validation-report')).toBeInTheDocument();
    });

    expect(adapter.validateMappings).toHaveBeenCalledWith({ mappingId: 'mapping-1' });

    fireEvent.click(screen.getByTestId('ai-validation-issue-link-issue-1-0'));
    expect(screen.getByTestId('rule-row-0')).toHaveAttribute('data-active', 'true');
  });

  it('shows selected scalar header as error when validation has error diagnostics', async () => {
    const engine = await import('@/lib/engine');
    const validateSpy = vi
      .spyOn(engine, 'validateMapping')
      .mockReturnValue(createValidationErrorResult('Order.Header.Currency'));

    const adapter = createMockAdapter();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    // Expand container nodes to reveal leaf target row.
    await waitFor(() => {
      expect(screen.getByTestId('expand-toggle-Order')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('expand-toggle-Order'));

    await waitFor(() => {
      expect(screen.getByTestId('expand-toggle-Order.Header')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('expand-toggle-Order.Header'));

    await waitFor(() => {
      expect(screen.getByTestId('target-field-row-Order.Header.Currency')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('target-field-row-Order.Header.Currency'));

    await waitFor(() => {
      expect(screen.getByTestId('header-status-icon')).toBeInTheDocument();
    });

    await waitFor(() => {
      const headerStatus = screen.getByTestId('header-status-icon');
      expect(headerStatus).toHaveClass('text-red-400');
    });

    validateSpy.mockRestore();
  });

  it('routes More menu actions to canonical Test Lab and Deployment paths', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();

    const { router } = renderWithRouter(adapter, [
      {
        path: '/projects/:projectId/mappings/:mappingId',
        element: <MappingEditor />,
      },
      {
        path: PATHS.MAPPING_TEST,
        element: <div data-testid="test-lab-route" />,
      },
      {
        path: PATHS.MAPPING_DEPLOYMENT,
        element: <div data-testid="deployment-route" />,
      },
    ]);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId('more-menu-button'));
    await user.click(screen.getByTestId('more-menu-test-lab'));
    await waitFor(() => {
      expect(screen.getByTestId('test-lab-route')).toBeInTheDocument();
    });

    await router.navigate('/projects/project-1/mappings/mapping-1');
    await waitFor(() => {
      expect(screen.getByTestId('more-menu-button')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('more-menu-button'));
    await user.click(screen.getByTestId('more-menu-deployment'));
    await waitFor(() => {
      expect(screen.getByTestId('deployment-route')).toBeInTheDocument();
    });
  });

  it('marks selected target row mapped immediately after source click in target view', async () => {
    const adapter = createMockAdapter({
      getMapping: vi.fn().mockResolvedValue({
        ...MOCK_CONFIG,
        rules: [],
      }),
      getSchema: vi.fn().mockImplementation((id: string) => {
        if (id === 'source-schema-1') return Promise.resolve(SIMPLE_SOURCE_SCHEMA);
        if (id === 'target-schema-1') return Promise.resolve(SIMPLE_TARGET_SCHEMA);
        return Promise.reject(new Error(`Schema ${id} not found`));
      }),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    const targetRow = screen.getByTestId('target-field-row-orderId');
    expect(within(targetRow).getByTestId('status-icon-unmapped')).toBeInTheDocument();

    fireEvent.click(targetRow);
    fireEvent.click(screen.getByTestId('source-field-orderId'));

    await waitFor(() => {
      expect(within(targetRow).getByTestId('status-icon-mapped')).toBeInTheDocument();
    });
  });

  it('uses Smart Builder as the primary guided scalar surface in target view', async () => {
    const adapter = createMockAdapter({
      getMapping: vi.fn().mockResolvedValue({
        ...MOCK_CONFIG,
        rules: [],
      }),
      getSchema: vi.fn().mockImplementation((id: string) => {
        if (id === 'source-schema-1') return Promise.resolve(SIMPLE_SOURCE_SCHEMA);
        if (id === 'target-schema-1') return Promise.resolve(SIMPLE_TARGET_SCHEMA);
        return Promise.reject(new Error(`Schema ${id} not found`));
      }),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('target-field-row-orderId'));

    expect(screen.getByTestId('smart-builder-panel')).toBeInTheDocument();
  });

  it('marks selected target row unmapped immediately after removing mapping', async () => {
    const adapter = createMockAdapter({
      getMapping: vi.fn().mockResolvedValue({
        ...MOCK_CONFIG,
        rules: [
          { target: 'orderId', type: 'string', expression: 'source("orderId")' },
        ],
      }),
      getSchema: vi.fn().mockImplementation((id: string) => {
        if (id === 'source-schema-1') return Promise.resolve(SIMPLE_SOURCE_SCHEMA);
        if (id === 'target-schema-1') return Promise.resolve(SIMPLE_TARGET_SCHEMA);
        return Promise.reject(new Error(`Schema ${id} not found`));
      }),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    const mappedRow = screen.getByTestId('target-field-row-orderId');
    expect(within(mappedRow).getByTestId('status-icon-mapped')).toBeInTheDocument();

    fireEvent.click(mappedRow);
    fireEvent.click(screen.getByTestId('header-overflow-trigger'));
    fireEvent.click(screen.getByTestId('remove-mapping-btn'));
    fireEvent.click(screen.getByTestId('remove-mapping-confirm'));

    await waitFor(() => {
      const unmappedRow = screen.getByTestId('target-field-row-orderId');
      expect(within(unmappedRow).getByTestId('status-icon-unmapped')).toBeInTheDocument();
    });
  });

  it('appends second source click (not replace) and persists composed draft only after Save', async () => {
    const adapter = createMockAdapter({
      getMapping: vi.fn().mockResolvedValue({
        ...MOCK_CONFIG,
        rules: [],
      }),
      getSchema: vi.fn().mockImplementation((id: string) => {
        if (id === 'source-schema-1') return Promise.resolve(MULTI_SOURCE_SCHEMA);
        if (id === 'target-schema-1') return Promise.resolve(SINGLE_TARGET_NAME_SCHEMA);
        return Promise.reject(new Error(`Schema ${id} not found`));
      }),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.queryByTestId('editor-loading')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('target-field-row-fullName'));
    fireEvent.click(screen.getByTestId('source-field-firstName'));
    fireEvent.click(screen.getByTestId('source-field-lastName'));

    expect(adapter.saveMapping).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('save-button'));

    await waitFor(() => {
      expect(adapter.saveMapping).toHaveBeenCalledTimes(1);
    });

    const [, payload] = (adapter.saveMapping as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      MappingConfig,
    ];
    const fullNameRule = payload.rules.find((rule) => rule.target === 'fullName');
    expect(fullNameRule?.expression).toContain('source("firstName")');
    expect(fullNameRule?.expression).toContain('source("lastName")');
  });
});
