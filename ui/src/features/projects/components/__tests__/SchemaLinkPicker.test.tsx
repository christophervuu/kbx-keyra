import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaMetadata } from '@/lib/types/domain';
import { SchemaLinkPicker } from '../SchemaLinkPicker';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA_A: SchemaMetadata = {
  schemaId: 'schema-a',
  name: 'Schema A',
  format: 'json-schema',
  fieldCount: 5,
  origin: 'local',
  status: 'ready',
  source: { type: 'upload' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const SCHEMA_B: SchemaMetadata = {
  ...SCHEMA_A,
  schemaId: 'schema-b',
  name: 'Schema B',
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn().mockResolvedValue([SCHEMA_A, SCHEMA_B]),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
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
  } as ApiAdapter;
}

function wrap(adapter: ApiAdapter, ui: React.ReactElement) {
  return render(
    React.createElement(AdapterProvider, { adapter }, ui),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaLinkPicker', () => {
  it('shows loading state initially', () => {
    const adapter = createMockAdapter({
      listSchemas: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    expect(screen.getByText('Loading schemas…')).toBeInTheDocument();
  });

  it('shows available schemas after load', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Schema A')).toBeInTheDocument());
    expect(screen.getByText('Schema B')).toBeInTheDocument();
  });

  it('filters out already-attached schemas', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={['schema-a']} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.queryByText('Schema A')).not.toBeInTheDocument());
    expect(screen.getByText('Schema B')).toBeInTheDocument();
  });

  it('shows empty message when no unattached schemas', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker
        attachedSchemaIds={['schema-a', 'schema-b']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    ));
    await waitFor(() =>
      expect(screen.getByText('No unattached schemas available.')).toBeInTheDocument(),
    );
  });

  it('calls onConfirm with schema ref when user selects and confirms', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={[]} onConfirm={onConfirm} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Schema A')).toBeInTheDocument());
    await user.click(screen.getByText('Schema A'));
    await user.click(screen.getByTestId('schema-link-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ schemaId: 'schema-a', type: 'local' });
  });

  it('Link Schema button is disabled when nothing selected', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Schema A')).toBeInTheDocument());
    expect(screen.getByTestId('schema-link-confirm')).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={onClose} />
    ));
    await waitFor(() => expect(screen.getByText('Schema A')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
