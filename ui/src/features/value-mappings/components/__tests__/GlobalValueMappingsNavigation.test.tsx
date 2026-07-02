import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { router } from '@/App';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';

function createAdapter(): ApiAdapter {
  const noop = vi.fn();
  return {
    listSchemas: noop,
    getSchema: noop,
    createSchema: noop,
    updateSchema: noop,
    markSchemaReviewed: noop,
    addSchemaSample: noop,
    deleteSchemaSample: noop,
    getSchemaSamplePayload: noop,
    deleteSchema: noop,
    listMappings: noop,
    getMapping: noop,
    createMapping: noop,
    updateMapping: noop,
    saveMapping: noop,
    deleteMapping: noop,
    duplicateMapping: noop,
    listMappingVersions: noop,
    getMappingVersion: noop,
    listVersions: noop,
    getVersion: noop,
    listMappingRevisions: noop,
    getMappingRevision: noop,
    createMappingVersion: noop,
    listRevisions: noop,
    getRevision: noop,
    createVersion: noop,
    saveMappingVersion: noop,
    listProjects: noop,
    getProject: vi.fn().mockResolvedValue({
      projectId: 'p-1',
      name: 'Project One',
      description: '',
      slug: 'project-one',
      linkedSchemaIds: [],
      schemaRefs: [],
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mappings: [],
    }),
    createProject: noop,
    updateProject: noop,
    deleteProject: noop,
    listTemplates: noop,
    getTemplate: noop,
    getDeploymentContext: noop,
    deploy: noop,
    promote: noop,
    rollback: noop,
    getDeploymentDiff: noop,
    deployMapping: noop,
    promoteDeployment: noop,
    rollbackDeployment: noop,
    listDeployments: noop,
    getCurrentDeployments: noop,
    listCdmSchemas: noop,
    linkCdmSchema: noop,
    syncAllCdmSchemas: noop,
    syncCdmSchema: noop,
    listPublishedSchemas: noop,
    publishSchemaToGitHub: noop,
    linkPublishedSchema: noop,
    autoMap: noop,
    autoMapSection: noop,
    suggestExpression: noop,
    explainRule: noop,
    smartFix: noop,
    validateMappings: noop,
    querySchemaNodes: noop,
    listActivity: noop,
    previewOnServer: noop,
    listProjectValueTables: vi.fn().mockResolvedValue([]),
    getProjectValueTable: noop,
    getProjectValueTableRevision: noop,
    createProjectValueTable: noop,
    createProjectValueTableRevision: noop,
    duplicateProjectValueTable: vi.fn().mockResolvedValue({}),
    archiveProjectValueTable: noop,
    deleteProjectValueTable: noop,
    listProjectValueTableUsage: noop,
    getProjectValueTableRevisionDiff: noop,
    exportProjectValueTableCsv: noop,
    importProjectValueTableCsv: noop,
    resolveProjectValueTableReference: noop,
    listGlobalValueMaps: vi.fn().mockResolvedValue([]),
    createGlobalValueMap: noop,
    getGlobalValueMap: vi.fn().mockResolvedValue({
      id: 'vm-1',
      projectId: 'global',
      key: 'order-status',
      name: 'Order Status',
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      currentRevision: 1,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }),
    listGlobalValueMapRevisions: vi.fn().mockResolvedValue([]),
    createGlobalValueMapRevision: noop,
    getGlobalValueMapRevision: noop,
    archiveGlobalValueMap: noop,
    getGlobalValueMapUsage: vi.fn().mockResolvedValue({
      mappings: [],
      linkedProjects: [],
      counts: { mappings: 0, linkedProjects: 0 },
    }),
  } as unknown as ApiAdapter;
}

describe('Global value mappings navigation wiring', () => {
  it('renders library route and sidebar link', async () => {
    await router.navigate('/value-mappings');
    const adapter = createAdapter();

    render(
      <AdapterProvider adapter={adapter}>
        <RouterProvider router={router} />
      </AdapterProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('page-global-value-mappings-library')).toBeInTheDocument();
    });

    expect(screen.getByTestId('sidebar-link-value mappings')).toBeInTheDocument();
  });
});
