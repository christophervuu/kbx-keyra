import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SchemaLinkPicker } from '../SchemaLinkPicker';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaMetadata } from '@/lib/types/domain';

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

const CDM_FILE_A = {
  path: 'JSONSchemas/CommonDataModels/Encounter.json',
  name: 'Encounter.json',
  type: 'file' as const,
  sha: 'sha-enc',
};

const CDM_FILE_B = {
  path: 'JSONSchemas/CommonDataModels/Patient.json',
  name: 'Patient.json',
  type: 'file' as const,
  sha: 'sha-pat',
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
    listCdmSchemas: vi.fn().mockResolvedValue([CDM_FILE_A, CDM_FILE_B]),
    linkCdmSchema: vi.fn().mockResolvedValue({
      ...SCHEMA_A,
      schemaId: 'schema-cdm-encounter',
      name: 'Encounter',
      origin: 'cdm',
      source: {
        type: 'github' as const,
        repo: 'KBXT/KBX-Canonicals',
        branch: 'main',
        path: CDM_FILE_A.path,
        commitSha: 'sha-enc',
      },
    }),
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
      listCdmSchemas: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    });
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    expect(screen.getByText('Loading CDM library…')).toBeInTheDocument();
  });

  it('shows available CDM schemas after load', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    expect(screen.getByText('Patient.json')).toBeInTheDocument();
    expect(screen.getByText(/KBXT\/KBX-Canonicals/i)).toBeInTheDocument();
  });

  it('loads only from CDM list endpoint', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={['schema-a']} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    expect(adapter.listCdmSchemas).toHaveBeenCalled();
    expect(adapter.listSchemas).not.toHaveBeenCalled();
  });

  it('shows empty message when no CDM files available', async () => {
    const adapter = createMockAdapter();
    vi.mocked(adapter.listCdmSchemas).mockResolvedValueOnce([]);
    wrap(adapter, (
      <SchemaLinkPicker
        projectId="project-1"
        attachedSchemaIds={['schema-a', 'schema-b']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    ));
    await waitFor(() =>
      expect(screen.getByText('No CDM schemas available to link from this directory.')).toBeInTheDocument(),
    );
  });

  it('calls onConfirm with linked schema ref when user selects and confirms', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={onConfirm} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    await user.click(screen.getByText('Encounter.json'));
    await user.click(screen.getByTestId('schema-link-confirm'));
    expect(adapter.linkCdmSchema).toHaveBeenCalledWith({
      projectId: 'project-1',
      path: 'JSONSchemas/CommonDataModels/Encounter.json',
    });
    expect(onConfirm).toHaveBeenCalledWith({
      schemaId: 'schema-cdm-encounter',
      type: 'github',
      commitSha: 'sha-enc',
    });
  });

  it('Link Schema button is disabled when nothing selected', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));
    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    expect(screen.getByTestId('schema-link-confirm')).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={onClose} />
    ));
    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders actionable non-technical error and retry for list failures', async () => {
    const user = userEvent.setup();
    const adapter = createMockAdapter();
    vi.mocked(adapter.listCdmSchemas)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([CDM_FILE_A]);

    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={vi.fn()} onClose={vi.fn()} />
    ));

    await waitFor(() => {
      expect(screen.getByText('Unable to load CDM Library right now. Please retry in a moment.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Encounter.json')).toBeInTheDocument();
    });
  });

  it('renders actionable non-technical error when link fails', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const adapter = createMockAdapter();
    vi.mocked(adapter.linkCdmSchema).mockRejectedValueOnce(new Error('rate limit'));

    wrap(adapter, (
      <SchemaLinkPicker projectId="project-1" attachedSchemaIds={[]} onConfirm={onConfirm} onClose={vi.fn()} />
    ));

    await waitFor(() => expect(screen.getByText('Encounter.json')).toBeInTheDocument());
    await user.click(screen.getByText('Encounter.json'));
    await user.click(screen.getByTestId('schema-link-confirm'));

    await waitFor(() => {
      expect(screen.getByText('Unable to link this CDM schema right now. Please check access and try again.')).toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
