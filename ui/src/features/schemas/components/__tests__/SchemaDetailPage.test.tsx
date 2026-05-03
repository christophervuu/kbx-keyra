import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types/domain';

import { SchemaDetailPage } from '../SchemaDetailPage';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CDM_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'schema-cdm-1',
    name: 'CDM Customer',
    format: 'json-schema',
    fieldCount: 12,
    origin: 'cdm',
    status: 'ready',
    scope: 'global',
    description: 'CDM customer object',
    updatedBy: 'system',
    inferred: false,
    syncStatus: 'synced',
    source: { type: 'upload' },
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
};

const LOCAL_SCHEMA: SchemaDetail = {
  metadata: {
    schemaId: 'schema-local-1',
    name: 'My Local Schema',
    format: 'json-schema',
    fieldCount: 5,
    origin: 'local',
    status: 'ready',
    scope: 'project',
    description: 'A local schema',
    updatedBy: 'local-user',
    inferred: false,
    syncStatus: 'not-synced',
    source: { type: 'upload' },
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-10T00:00:00Z',
  },
  content: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
  },
};

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockResolvedValue(LOCAL_SCHEMA),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockImplementation((_id, input) =>
      Promise.resolve({ ...LOCAL_SCHEMA.metadata, ...input }),
    ),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
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

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(adapter: ApiAdapter, schemaId = 'schema-local-1') {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter initialEntries={[`/schemas/${schemaId}`]}>
        <Routes>
          <Route
            path="/schemas/:schemaId"
            element={<SchemaDetailPage schemaId={schemaId} />}
          />
          <Route path="/schemas" element={<div data-testid="schema-library-page">Library</div>} />
        </Routes>
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaDetailPage', () => {
  let adapter: ApiAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it('has data-testid on root element', async () => {
    renderPage(adapter);
    expect(screen.getByTestId('page-schema-detail')).toBeInTheDocument();
  });

  it('shows skeleton while loading', () => {
    adapter = createMockAdapter({ getSchema: vi.fn(() => new Promise(() => {})) });
    renderPage(adapter);
    expect(screen.getByTestId('schema-detail-skeleton')).toBeInTheDocument();
  });

  it('renders CDM schema metadata in read-only mode', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(CDM_SCHEMA) });
    renderPage(adapter, 'schema-cdm-1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'CDM Customer' })).toBeInTheDocument();
    });

    // CDM badge
    expect(screen.getByText('CDM')).toBeInTheDocument();
    // Global scope badge
    expect(screen.getByText('Global')).toBeInTheDocument();
    // Field count
    expect(screen.getByText(/12 fields/i)).toBeInTheDocument();
    // Format
    expect(screen.getByText('JSON Schema')).toBeInTheDocument();
    // Description (read-only plain text)
    expect(screen.getByText('CDM customer object')).toBeInTheDocument();

    // Name heading should NOT be a button (read-only for CDM)
    const heading = screen.getByRole('heading', { level: 1, name: 'CDM Customer' });
    expect(heading.tagName).toBe('H1');
    expect(heading).not.toHaveAttribute('role', 'button');
  });

  it('renders local schema metadata with editable name and description', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-metadata')).toBeInTheDocument();
    });

    // Local badge
    expect(screen.getByText('Local')).toBeInTheDocument();
    // Project-Level scope badge
    expect(screen.getByText('Project-Level')).toBeInTheDocument();
    // Name is rendered as an editable button
    const nameButton = screen.getByRole('button', { name: /edit schema name/i });
    expect(nameButton).toBeInTheDocument();
  });

  it('inline name edit calls updateSchema on blur', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit schema name/i })).toBeInTheDocument();
    });

    // Click to enter edit mode
    await user.click(screen.getByRole('button', { name: /edit schema name/i }));

    const input = screen.getByRole('textbox', { name: /edit schema name/i });
    await user.clear(input);
    await user.type(input, 'Updated Name');
    await user.tab(); // trigger blur

    await waitFor(() => {
      expect(adapter.updateSchema).toHaveBeenCalledWith(
        'schema-local-1',
        expect.objectContaining({ name: 'Updated Name' }),
      );
    });
  });

  it('error state shows retry button', async () => {
    adapter = createMockAdapter({
      getSchema: vi.fn().mockRejectedValue(new Error('Network failure')),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    expect(screen.getByText(/failed to load schema/i)).toBeInTheDocument();
  });

  it('retry button re-fetches data', async () => {
    const user = userEvent.setup();
    const getSchema = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(LOCAL_SCHEMA);
    adapter = createMockAdapter({ getSchema });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-metadata')).toBeInTheDocument();
    });

    expect(getSchema).toHaveBeenCalledTimes(2);
  });

  it('not-found state shows message and link back to library', async () => {
    const notFoundErr = Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
    adapter = createMockAdapter({
      getSchema: vi.fn().mockRejectedValue(notFoundErr),
    });
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-not-found')).toBeInTheDocument();
    });

    expect(screen.getByText(/schema not found/i)).toBeInTheDocument();
    expect(screen.getByTestId('back-to-library-link')).toBeInTheDocument();
  });

  it('renders all placeholder section slots', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-metadata')).toBeInTheDocument();
    });

    expect(screen.getByTestId('schema-detail-git-status')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-usage')).toBeInTheDocument();
    expect(screen.getByTestId('schema-detail-actions')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // T-04: Tree section and edit mode
  // -------------------------------------------------------------------------

  it('tree section renders for a local json-schema schema', async () => {
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    // Edit button visible for local json-schema
    expect(screen.getByTestId('edit-schema-button')).toBeInTheDocument();
    // Save/cancel not visible yet
    expect(screen.queryByTestId('editing-banner')).not.toBeInTheDocument();
  });

  it('entering edit mode shows save and cancel buttons', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('edit-schema-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('edit-schema-button'));

    expect(screen.getByTestId('editing-banner')).toBeInTheDocument();
    expect(screen.getByTestId('save-edit-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-edit-button')).toBeInTheDocument();
    // Edit button disappears in edit mode
    expect(screen.queryByTestId('edit-schema-button')).not.toBeInTheDocument();
  });

  it('cancel exits edit mode and returns to read-only', async () => {
    const user = userEvent.setup();
    renderPage(adapter);

    await waitFor(() => {
      expect(screen.getByTestId('edit-schema-button')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('edit-schema-button'));
    expect(screen.getByTestId('editing-banner')).toBeInTheDocument();

    await user.click(screen.getByTestId('cancel-edit-button'));

    expect(screen.queryByTestId('editing-banner')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-edit-button')).not.toBeInTheDocument();
    // Edit button reappears
    expect(screen.getByTestId('edit-schema-button')).toBeInTheDocument();
  });

  it('CDM schema does not show edit mode controls', async () => {
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(CDM_SCHEMA) });
    renderPage(adapter, 'schema-cdm-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('edit-schema-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editing-banner')).not.toBeInTheDocument();
  });

  it('XSD format schema does not show edit mode controls', async () => {
    const XSD_SCHEMA: SchemaDetail = {
      metadata: {
        ...LOCAL_SCHEMA.metadata,
        schemaId: 'schema-xsd-1',
        format: 'xsd',
        name: 'XSD Schema',
      },
      content: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema>',
    };
    adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(XSD_SCHEMA) });
    renderPage(adapter, 'schema-xsd-1');

    await waitFor(() => {
      expect(screen.getByTestId('schema-detail-tree')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('edit-schema-button')).not.toBeInTheDocument();
  });
});
