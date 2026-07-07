import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UsageMapping } from '../../hooks/use-schema-usage';
import { SchemaActions } from '../SchemaActions';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types';

function makeSchema(overrides: Partial<SchemaDetail['metadata']> = {}): SchemaDetail {
  return {
    metadata: {
      schemaId: 'schema-1',
      name: 'Test Schema',
      format: 'json-schema',
      fieldCount: 5,
      origin: 'uploaded',
      status: 'ready',
      syncStatus: 'sync-failed',
      source: { type: 'upload' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      ...overrides,
    },
    content: { type: 'object', properties: {} },
  };
}

const NO_USAGE: UsageMapping[] = [];
const WITH_USAGE: UsageMapping[] = [
  { mappingId: 'map-1', projectId: 'proj-1', name: 'Order Mapping', role: 'source' },
];

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockResolvedValue({}),
    markSchemaReviewed: vi.fn().mockResolvedValue({}),
    addSchemaSample: vi.fn(),
    deleteSchema: vi.fn().mockResolvedValue(undefined),
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

function renderActions(
  schema: SchemaDetail,
  adapter: ApiAdapter,
  props: Partial<{
    usageMappings: UsageMapping[];
    isEditing: boolean;
    showEditButton: boolean;
    onEdit: () => void;
    onViewRaw: () => void;
  }> = {},
) {
  const onEdit = props.onEdit ?? vi.fn();
  const onViewRaw = props.onViewRaw ?? vi.fn();

  render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter>
        <SchemaActions
          schema={schema}
          onEdit={onEdit}
          onViewRaw={onViewRaw}
          usageMappings={props.usageMappings ?? NO_USAGE}
          isEditing={props.isEditing ?? false}
          showEditButton={props.showEditButton}
        />
      </MemoryRouter>
    </AdapterProvider>,
  );

  return { onEdit, onViewRaw };
}

async function openOverflowMenu() {
  await userEvent.click(screen.getByTestId('action-overflow-trigger'));
  expect(screen.getByTestId('action-overflow-menu')).toBeInTheDocument();
}

describe('SchemaActions', () => {
  it('supports hiding top-level Edit Schema button while keeping overflow trigger', () => {
    const schema = makeSchema({ origin: 'uploaded', format: 'json-schema' });
    renderActions(schema, createMockAdapter(), { showEditButton: false });

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();
  });

  it('renders user-schema action model: top-level Edit Schema + overflow trigger', () => {
    const schema = makeSchema({ origin: 'uploaded', format: 'json-schema' });
    renderActions(schema, createMockAdapter());

    expect(screen.getByTestId('action-edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Schema' })).toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();

    expect(screen.queryByTestId('action-resync')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-sync-github')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
  });

  it('overflow for user schema contains View raw and Delete schema', async () => {
    const schema = makeSchema({ origin: 'uploaded' });
    renderActions(schema, createMockAdapter());

    await openOverflowMenu();

    expect(screen.getByTestId('action-view-raw')).toHaveTextContent('View raw');
    expect(screen.getByTestId('action-remove')).toHaveTextContent('Delete schema');
    expect(screen.queryByRole('menuitem', { name: /publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /sync/i })).not.toBeInTheDocument();
  });

  it('CDM schema renders overflow only with View raw', async () => {
    const schema = makeSchema({ origin: 'cdm', ownership: 'cdm', readonly: true });
    renderActions(schema, createMockAdapter());

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();

    await openOverflowMenu();

    expect(screen.getByTestId('action-view-raw')).toBeInTheDocument();
    expect(screen.queryByTestId('action-replace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-remove')).not.toBeInTheDocument();
    expect(screen.queryByText(/re-sync/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sync to github/i)).not.toBeInTheDocument();
  });

  it('hides Edit Schema while currently editing', () => {
    const schema = makeSchema({ origin: 'uploaded', format: 'json-schema' });
    renderActions(schema, createMockAdapter(), { isEditing: true });

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();
  });

  it('hides Edit Schema for non-json-schema formats', () => {
    const schema = makeSchema({ origin: 'uploaded', format: 'xsd' });
    renderActions(schema, createMockAdapter());

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit Schema is clicked', async () => {
    const onEdit = vi.fn();
    const schema = makeSchema({ origin: 'uploaded', format: 'json-schema' });
    renderActions(schema, createMockAdapter(), { onEdit });

    await userEvent.click(screen.getByTestId('action-edit'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onViewRaw from overflow', async () => {
    const onViewRaw = vi.fn();
    const schema = makeSchema({ origin: 'uploaded' });
    renderActions(schema, createMockAdapter(), { onViewRaw });

    await openOverflowMenu();
    await userEvent.click(screen.getByTestId('action-view-raw'));

    expect(onViewRaw).toHaveBeenCalledOnce();
  });

  describe('Delete schema', () => {
    it('shows blocked dialog when mappings reference schema', async () => {
      const schema = makeSchema({ origin: 'uploaded' });
      renderActions(schema, createMockAdapter(), { usageMappings: WITH_USAGE });

      await openOverflowMenu();
      await userEvent.click(screen.getByTestId('action-remove'));

      expect(screen.getByText(/Cannot remove this schema/i)).toBeInTheDocument();
      expect(screen.getByTestId('remove-blocked-mappings')).toHaveTextContent('Order Mapping');
    });

    it('shows confirmation dialog when schema has no usage', async () => {
      const schema = makeSchema({ origin: 'uploaded' });
      renderActions(schema, createMockAdapter(), { usageMappings: NO_USAGE });

      await openOverflowMenu();
      await userEvent.click(screen.getByTestId('action-remove'));

      expect(screen.getByText(/Remove schema\?/i)).toBeInTheDocument();
    });

    it('calls deleteSchema on confirm', async () => {
      const deleteSchema = vi.fn().mockResolvedValue(undefined);
      const schema = makeSchema({ origin: 'uploaded', schemaId: 'schema-1' });
      renderActions(schema, createMockAdapter({ deleteSchema }), { usageMappings: NO_USAGE });

      await openOverflowMenu();
      await userEvent.click(screen.getByTestId('action-remove'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => {
        expect(deleteSchema).toHaveBeenCalledWith('schema-1');
      });
    });
  });
});
