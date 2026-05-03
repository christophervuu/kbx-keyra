import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types';

import type { UsageMapping } from '../../hooks/use-schema-usage';
import { SchemaActions } from '../SchemaActions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema(overrides: Partial<SchemaDetail['metadata']> = {}): SchemaDetail {
  return {
    metadata: {
      schemaId: 'schema-1',
      name: 'Test Schema',
      format: 'json-schema',
      fieldCount: 5,
      origin: 'local',
      status: 'ready',
      scope: 'project',
      syncStatus: 'not-synced',
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

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockResolvedValue({}),
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

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderActions(
  schema: SchemaDetail,
  adapter: ApiAdapter,
  props: Partial<{
    usageMappings: UsageMapping[];
    isEditing: boolean;
    onEdit: () => void;
    onScopePromoted: () => void;
  }> = {},
) {
  const onEdit = props.onEdit ?? vi.fn();
  const onReplace = vi.fn();
  const onViewRaw = vi.fn();
  const onScopePromoted = props.onScopePromoted ?? vi.fn();

  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter>
        <SchemaActions
          schema={schema}
          onEdit={onEdit}
          onReplace={onReplace}
          onViewRaw={onViewRaw}
          usageMappings={props.usageMappings ?? NO_USAGE}
          isEditing={props.isEditing ?? false}
          onScopePromoted={onScopePromoted}
        />
      </MemoryRouter>
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaActions', () => {
  describe('CDM schema', () => {
    it('shows Re-sync placeholder and View Raw, hides non-CDM buttons', () => {
      const schema = makeSchema({ origin: 'cdm', scope: 'global' });
      renderActions(schema, createMockAdapter());

      expect(screen.getByTestId('action-resync')).toBeInTheDocument();
      expect(screen.getByTestId('action-view-raw')).toBeInTheDocument();
      expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-remove')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-promote')).not.toBeInTheDocument();
    });
  });

  describe('local json-schema (project-scoped)', () => {
    it('shows Edit, Auto-describe, Sync, Replace, Promote, Remove, View Raw', () => {
      const schema = makeSchema({ origin: 'local', scope: 'project', format: 'json-schema' });
      renderActions(schema, createMockAdapter());

      expect(screen.getByTestId('action-edit')).toBeInTheDocument();
      expect(screen.getByTestId('action-auto-describe')).toBeInTheDocument();
      expect(screen.getByTestId('action-sync-github')).toBeInTheDocument();
      expect(screen.getByTestId('action-replace')).toBeInTheDocument();
      expect(screen.getByTestId('action-promote')).toBeInTheDocument();
      expect(screen.getByTestId('action-remove')).toBeInTheDocument();
      expect(screen.getByTestId('action-view-raw')).toBeInTheDocument();
    });
  });

  describe('local xsd (global-scoped)', () => {
    it('hides Edit and Promote for non-json-schema and global scope', () => {
      const schema = makeSchema({ origin: 'local', scope: 'global', format: 'xsd' });
      renderActions(schema, createMockAdapter());

      expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-promote')).not.toBeInTheDocument();
      expect(screen.getByTestId('action-remove')).toBeInTheDocument();
    });
  });

  describe('Edit button', () => {
    it('calls onEdit when clicked', async () => {
      const onEdit = vi.fn();
      const schema = makeSchema({ origin: 'local', format: 'json-schema' });
      renderActions(schema, createMockAdapter(), { onEdit });

      await userEvent.click(screen.getByTestId('action-edit'));
      expect(onEdit).toHaveBeenCalledOnce();
    });

    it('is hidden when isEditing is true', () => {
      const schema = makeSchema({ origin: 'local', format: 'json-schema' });
      renderActions(schema, createMockAdapter(), { isEditing: true });

      expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
    });
  });

  describe('placeholder buttons', () => {
    it('auto-describe shows tooltip text', () => {
      const schema = makeSchema({ origin: 'local' });
      renderActions(schema, createMockAdapter());

      const btn = screen.getByTestId('action-auto-describe');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'AI-generated field descriptions available in a future release');
    });

    it('sync-github shows tooltip text', () => {
      const schema = makeSchema({ origin: 'local' });
      renderActions(schema, createMockAdapter());

      const btn = screen.getByTestId('action-sync-github');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'GitHub sync available when backend is connected');
    });

    it('re-sync shows tooltip text for CDM', () => {
      const schema = makeSchema({ origin: 'cdm', scope: 'global' });
      renderActions(schema, createMockAdapter());

      const btn = screen.getByTestId('action-resync');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'Re-sync available when backend is connected');
    });
  });

  describe('Promote to Global', () => {
    it('opens confirmation dialog on click', async () => {
      const schema = makeSchema({ origin: 'local', scope: 'project' });
      renderActions(schema, createMockAdapter());

      await userEvent.click(screen.getByTestId('action-promote'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Promote schema to Global/i)).toBeInTheDocument();
    });

    it('calls updateSchema with scope global on confirm', async () => {
      const updateSchema = vi.fn().mockResolvedValue({});
      const onScopePromoted = vi.fn();
      const schema = makeSchema({ origin: 'local', scope: 'project', schemaId: 'schema-1' });
      renderActions(schema, createMockAdapter({ updateSchema }), { onScopePromoted });

      await userEvent.click(screen.getByTestId('action-promote'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => {
        expect(updateSchema).toHaveBeenCalledWith('schema-1', { scope: 'global' });
        expect(onScopePromoted).toHaveBeenCalled();
      });
    });

    it('closes dialog on cancel', async () => {
      const schema = makeSchema({ origin: 'local', scope: 'project' });
      renderActions(schema, createMockAdapter());

      await userEvent.click(screen.getByTestId('action-promote'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('confirm-dialog-cancel'));
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Remove', () => {
    it('shows blocked dialog when mappings reference the schema', async () => {
      const schema = makeSchema({ origin: 'local' });
      renderActions(schema, createMockAdapter(), { usageMappings: WITH_USAGE });

      await userEvent.click(screen.getByTestId('action-remove'));
      expect(screen.getByText(/Cannot remove this schema/i)).toBeInTheDocument();
      expect(screen.getByTestId('remove-blocked-mappings')).toHaveTextContent('Order Mapping');
    });

    it('shows confirmation dialog when no mappings reference the schema', async () => {
      const schema = makeSchema({ origin: 'local' });
      renderActions(schema, createMockAdapter(), { usageMappings: NO_USAGE });

      await userEvent.click(screen.getByTestId('action-remove'));
      expect(screen.getByText(/Are you sure you want to remove/i)).toBeInTheDocument();
    });

    it('calls deleteSchema on confirm and navigates away', async () => {
      const deleteSchema = vi.fn().mockResolvedValue(undefined);
      const schema = makeSchema({ origin: 'local', schemaId: 'schema-1' });
      renderActions(schema, createMockAdapter({ deleteSchema }), { usageMappings: NO_USAGE });

      await userEvent.click(screen.getByTestId('action-remove'));
      await userEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => {
        expect(deleteSchema).toHaveBeenCalledWith('schema-1');
      });
    });
  });
});
