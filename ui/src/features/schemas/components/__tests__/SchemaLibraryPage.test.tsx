// SchemaLibraryPage.test.tsx — Integration tests for the assembled Schema Library page (FS-016 T-04)

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SchemaLibraryPage } from '../SchemaLibraryPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { ProjectDetail, SchemaMetadata } from '@/lib/types/domain';

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchemaMeta(overrides: Partial<SchemaMetadata> = {}): SchemaMetadata {
  return {
    schemaId: 'schema-1',
    name: 'Customer Schema',
    format: 'json-schema',
    dataFormat: 'json',
    sourceKind: 'json_schema',
    fieldCount: 10,
    origin: 'uploaded',
    ownership: 'user',
    status: 'ready',
    syncStatus: 'sync-failed',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProjectDetail(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    projectId: 'p-1',
    name: 'Project One',
    description: '',
    slug: 'p-1',
    tags: [],
    schemaRefs: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    mappings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock adapter
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listProjects: vi.fn().mockResolvedValue([]),
    listSchemas: vi.fn().mockResolvedValue([]),
    listMappings: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn(),
    deleteSchema: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    getProject: vi.fn().mockResolvedValue(makeProjectDetail()),
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
    syncAllCdmSchemas: vi.fn(),
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
  const queryClient = createQueryClient();
  return render(
    <MemoryRouter initialEntries={['/schemas']}>
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>
          <SchemaLibraryPage />
        </AdapterProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', createStorageMock());
  });

  it('has data-testid="page-schema-library"', () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn(() => new Promise(() => {})),
      listProjects: vi.fn(() => new Promise(() => {})),
    });
    renderPage(adapter);
    expect(screen.getByTestId('page-schema-library')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows skeleton while loading', () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn(() => new Promise(() => {})),
      listProjects: vi.fn(() => new Promise(() => {})),
    });
    renderPage(adapter);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByTestId('schema-library-skeleton')).toBeInTheDocument();
  });

  it('skeleton has sr-only "Loading schemas" text', () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn(() => new Promise(() => {})),
      listProjects: vi.fn(() => new Promise(() => {})),
    });
    renderPage(adapter);
    expect(screen.getByText('Loading schemas')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error banner with role="alert" on failure', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockRejectedValue(new Error('Network error')),
      listProjects: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error message text', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('shows retry button in error state', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockRejectedValue(new Error('fail')),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });
  });

  it('retry button triggers a re-fetch', async () => {
    const listSchemas = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue([]);

    const adapter = createMockAdapter({ listSchemas });
    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('retry-button')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('retry-button'));
    await waitFor(() => expect(listSchemas).toHaveBeenCalledTimes(2));
  });

  // -------------------------------------------------------------------------
  // Empty state (no schemas)
  // -------------------------------------------------------------------------

  it('shows empty state when no schemas exist', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByTestId('schema-library-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No schemas available')).toBeInTheDocument();
    expect(screen.getByText(/upload a schema/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Loaded state
  // -------------------------------------------------------------------------

  it('renders page header with schema count', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Schema One' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Schema Two' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /schema library \(2 schemas\)/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Your schema management hub for CDM and user schemas')).toBeInTheDocument();
  });

  it('shows refresh metadata in success state', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Schema One' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-library-refresh-status')).toBeInTheDocument();
    });
  });

  it('renders top-right Sync CDM Models and Add Schema buttons', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Schema One' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('sync-cdm-models-button')).toBeInTheDocument();
    });
    expect(screen.getByTestId('add-schema-button')).toBeInTheDocument();
  });

  it('clicking Sync CDM Models invokes bulk sync and refreshes schema list', async () => {
    const listSchemas = vi.fn()
      .mockResolvedValueOnce([makeSchemaMeta({ schemaId: 's-1', name: 'Schema One' })])
      .mockResolvedValueOnce([makeSchemaMeta({ schemaId: 's-1', name: 'Schema One' })]);
    const syncAllCdmSchemas = vi.fn().mockResolvedValue({
      rootPath: 'JSONSchemas-bundled/CommonDataModels',
      scannedFiles: 2,
      imported: 2,
      skipped: 0,
      failed: 0,
      excludedSchemaIds: ['c0f95533-4965-45cc-8b35-5adbd44630f5'],
      errors: [],
      message: 'CDM sync completed.',
    });

    const adapter = createMockAdapter({
      listSchemas,
      listProjects: vi.fn().mockResolvedValue([]),
      syncAllCdmSchemas,
    });

    renderPage(adapter);

    await waitFor(() => expect(screen.getByTestId('sync-cdm-models-button')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('sync-cdm-models-button'));

    await waitFor(() => {
      expect(syncAllCdmSchemas).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(listSchemas).toHaveBeenCalledTimes(2);
    });
  });

  it('renders a card for each schema', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Schema Alpha' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Schema Beta' }),
        makeSchemaMeta({ schemaId: 's-3', name: 'Schema Gamma' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => {
      expect(screen.getAllByTestId('schema-library-card')).toHaveLength(3);
    });
  });

  it('renders cards when adapter returns malformed origin values', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({
          schemaId: 's-legacy',
          name: 'Legacy Schema',
          origin: 'legacy-origin' as unknown as SchemaMetadata['origin'],
          ownership: 'cdm',
        }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-library-card')).toBeInTheDocument();
    });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // No-results state
  // -------------------------------------------------------------------------

  it('shows no-results message when filters yield zero results', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Alpha', origin: 'uploaded' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);

    // Wait for load
    await waitFor(() => screen.getByTestId('schema-library-card'));

    // Type a search that matches nothing
    await userEvent.type(screen.getByRole('searchbox'), 'zzznomatch');

    await waitFor(() => {
      expect(screen.getByTestId('no-results')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('schema-library-card')).not.toBeInTheDocument();
  });

  it('clear filters from no-results restores the card grid', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Alpha' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => screen.getByTestId('schema-library-card'));

    await userEvent.type(screen.getByRole('searchbox'), 'zzznomatch');
    await waitFor(() => screen.getByTestId('no-results'));

    await userEvent.click(screen.getByTestId('no-results-clear'));
    await waitFor(() => {
      expect(screen.getByTestId('schema-library-card')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Search interaction
  // -------------------------------------------------------------------------

  it('typing in search filters displayed cards', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Customer Schema' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Order Schema' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    await userEvent.type(screen.getByRole('searchbox'), 'Customer');
    await waitFor(() => {
      expect(screen.getAllByTestId('schema-library-card')).toHaveLength(1);
      expect(screen.getByText('Customer Schema')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Filter interaction
  // -------------------------------------------------------------------------

  it('toggling origin filter updates displayed cards', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Uploaded Schema', origin: 'uploaded', ownership: 'user' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'CDM Schema', origin: 'cdm', ownership: 'cdm' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'CDM' }));
    await waitFor(() => {
      expect(screen.getAllByTestId('schema-library-card')).toHaveLength(1);
      expect(screen.getByText('CDM Schema')).toBeInTheDocument();
    });
  });

  it('supports status filter options and filtering behavior', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Ready Schema', status: 'ready' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Needs Review Schema', status: 'needs_review', inferred: true }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);

    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    expect(screen.queryByRole('button', { name: 'Needs review' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ready' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ready' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2);
      expect(screen.getByText('Needs Review Schema')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Sort interaction
  // -------------------------------------------------------------------------

  it('changing sort field reorders cards', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Zeta', fieldCount: 5 }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Alpha', fieldCount: 30 }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });
    renderPage(adapter);
    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    // Default sort is name asc → Alpha first
    const cardsBefore = screen.getAllByTestId('schema-library-card');
    expect(cardsBefore[0]).toHaveTextContent('Alpha');

    // Sort by fieldCount desc → Zeta (5) becomes first only if desc
    // First switch field to fieldCount
    await userEvent.selectOptions(screen.getByTestId('sort-field-select'), 'fieldCount:desc');

    await waitFor(() => {
      const cards = screen.getAllByTestId('schema-library-card');
      expect(cards[0]).toHaveTextContent('Alpha'); // 30 fields first in desc
    });
  });

  it('supports list view toggle and persists selected mode', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'Schema Alpha' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'Schema Beta' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter);
    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByTestId('schema-library-list')).toBeInTheDocument();
    expect(localStorage.getItem('keyra.schemas.viewMode')).toBe('list');
  });

  it('list mode sort parity uses shared sort state', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([
        makeSchemaMeta({ schemaId: 's-1', name: 'A' }),
        makeSchemaMeta({ schemaId: 's-2', name: 'B' }),
      ]),
      listProjects: vi.fn().mockResolvedValue([
        { projectId: 'p-1', name: 'Project 1', description: '', slug: 'p-1', updatedAt: '2026-01-01T00:00:00Z' },
        { projectId: 'p-2', name: 'Project 2', description: '', slug: 'p-2', updatedAt: '2026-01-01T00:00:00Z' },
        { projectId: 'p-3', name: 'Project 3', description: '', slug: 'p-3', updatedAt: '2026-01-01T00:00:00Z' },
      ]),
      getProject: vi.fn()
        .mockResolvedValueOnce(makeProjectDetail({ projectId: 'p-1', name: 'Project 1', schemaRefs: [{ schemaId: 's-2', type: 'local' }] }))
        .mockResolvedValueOnce(makeProjectDetail({ projectId: 'p-2', name: 'Project 2', schemaRefs: [{ schemaId: 's-2', type: 'local' }] }))
        .mockResolvedValueOnce(makeProjectDetail({ projectId: 'p-3', name: 'Project 3', schemaRefs: [{ schemaId: 's-1', type: 'local' }] })),
    });

    renderPage(adapter);
    await waitFor(() => expect(screen.getAllByTestId('schema-library-card')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    await userEvent.selectOptions(screen.getByTestId('sort-field-select'), 'projectCount:desc');

    await waitFor(() => {
      const rows = screen.getAllByTestId('schema-library-list-row');
      expect(rows[0]).toHaveTextContent('B');
    });
  });

  it('does not render legacy scope/sync/publish terms in toolbar controls', async () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockResolvedValue([makeSchemaMeta({ schemaId: 's-1', name: 'Schema Alpha' })]),
      listProjects: vi.fn().mockResolvedValue([]),
    });

    renderPage(adapter);
    await waitFor(() => expect(screen.getByTestId('schema-library-card')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Global' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Local' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Project-level' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Published' })).not.toBeInTheDocument();
  });
});
