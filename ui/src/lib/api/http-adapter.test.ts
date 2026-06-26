import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureNotEnabledError } from './errors';
import { HttpAdapter } from './http-adapter';
import { httpRequest } from './http-client';
import * as localImport from './local-mapping-import';

import { toAppError } from '@/lib/state/app-error';
import type {
  AutoMapSectionResult,
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  MappingConfig,
  MappingSaveResult,
  MappingVersion,
  MappingVersionEntry,
  UpdateProjectInput,
  UpdateSchemaInput,
} from '@/lib/types';

vi.mock('./http-client', () => ({
  httpRequest: vi.fn(),
}));

vi.mock('./local-mapping-import', () => ({
  importLocalMappingsToBackend: vi.fn(),
}));

const API_URL = 'http://localhost:3001/api';

describe('HttpAdapter (CRUD)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when apiUrl is empty', () => {
    expect(() => new HttpAdapter('')).toThrow('HttpAdapter requires a non-empty apiUrl.');
  });

  it('listSchemas maps to GET /schemas', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([{ schemaId: 's-1' }]);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listSchemas()).resolves.toEqual([{ schemaId: 's-1' }]);
    expect(httpRequest).toHaveBeenCalledWith({ baseUrl: API_URL, path: '/schemas', method: 'GET' });
  });

  it('getSchema maps to GET /schemas/:id', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ metadata: { schemaId: 's-1' }, content: {} });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getSchema('s-1')).resolves.toMatchObject({ metadata: { schemaId: 's-1' } });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/s-1',
      method: 'GET',
    });
  });

  it('createSchema maps to POST /schemas with body', async () => {
    const input: CreateSchemaInput = {
      name: 'Schema A',
      format: 'json-schema',
      origin: 'local',
      content: { type: 'object' },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce({ schemaId: 's-1', name: 'Schema A' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.createSchema(input)).resolves.toMatchObject({ schemaId: 's-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas',
      method: 'POST',
      body: input,
    });
  });

  it('updateSchema maps to PUT /schemas/:id with body', async () => {
    const input: UpdateSchemaInput = { name: 'Schema B' };
    vi.mocked(httpRequest).mockResolvedValueOnce({ schemaId: 's-1', name: 'Schema B' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.updateSchema('s-1', input)).resolves.toMatchObject({ schemaId: 's-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/s-1',
      method: 'PUT',
      body: input,
    });
  });

  it('deleteSchema maps to DELETE /schemas/:id and handles void', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(undefined);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.deleteSchema('s-1')).resolves.toBeUndefined();
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/s-1',
      method: 'DELETE',
    });
  });

  it('listMappings maps to GET /projects/:projectId/mappings', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([{ mappingId: 'm-1' }]);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listMappings('p-1')).resolves.toEqual([{ mappingId: 'm-1' }]);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/mappings',
      method: 'GET',
    });
  });

  it('getMapping maps to GET /mappings/:id', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ id: 'm-1', name: 'Map', version: 1, engineVersion: '2.0.0', config: {}, rules: [] });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getMapping('m-1')).resolves.toMatchObject({ id: 'm-1' });
    expect(httpRequest).toHaveBeenCalledWith({ baseUrl: API_URL, path: '/mappings/m-1', method: 'GET' });
  });

  it('createMapping maps to POST /mappings with body', async () => {
    const input: CreateMappingInput = {
      projectId: 'p-1',
      name: 'Map A',
      businessContext: 'Transform invoice payload into shipment orchestration output.',
      enrichmentSources: [
        { alias: 'customerProfile', schemaId: 'schema-customer', required: true },
      ],
      config: {
        externalSources: ['legacyAlias'],
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce({ mappingId: 'm-1', name: 'Map A' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.createMapping(input)).resolves.toMatchObject({ mappingId: 'm-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings',
      method: 'POST',
      body: input,
    });
  });

  it('updateMapping maps to PUT /mappings/:id with body', async () => {
    const config: MappingConfig = {
      id: 'm-1',
      projectId: 'p-1',
      name: 'Map B',
      version: 2,
      engineVersion: '2.0.0',
      config: {},
      rules: [],
    };
    vi.mocked(httpRequest).mockResolvedValueOnce({ mappingId: 'm-1', name: 'Map B' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.updateMapping('m-1', config)).resolves.toMatchObject({ mappingId: 'm-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1',
      method: 'PUT',
      body: config,
    });
  });

  it('saveMapping maps to PUT /mappings/:id with expectedRevision', async () => {
    const config: MappingConfig = {
      id: 'm-1',
      projectId: 'p-1',
      name: 'Map Save',
      version: 2,
      engineVersion: '2.0.0',
      config: {},
      rules: [],
    };
    const saveResult: MappingSaveResult = { revision: 3, noChange: false };
    vi.mocked(httpRequest).mockResolvedValueOnce(saveResult);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.saveMapping('m-1', config)).resolves.toEqual(saveResult);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1',
      method: 'PUT',
      body: {
        ...config,
        expectedRevision: 2,
      },
    });
  });

  it('deleteMapping maps to DELETE /mappings/:id and handles void', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(undefined);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.deleteMapping('m-1')).resolves.toBeUndefined();
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1',
      method: 'DELETE',
    });
  });

  it('duplicateMapping maps to POST /mappings/:id/duplicate with name body', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ mappingId: 'm-2', name: 'Duplicated' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.duplicateMapping('m-1', 'Duplicated')).resolves.toMatchObject({ mappingId: 'm-2' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/duplicate',
      method: 'POST',
      body: { name: 'Duplicated' },
    });
  });

  it('importLocalMappings delegates to explicit local import utility', async () => {
    vi.mocked(localImport.importLocalMappingsToBackend).mockResolvedValueOnce({
      imported: 1,
      skipped: 0,
      failed: 0,
      issues: [],
    });

    const adapter = new HttpAdapter(API_URL);
    await expect(adapter.importLocalMappings('proj-1')).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 0,
      issues: [],
    });

    expect(localImport.importLocalMappingsToBackend).toHaveBeenCalledWith(adapter, 'proj-1');
  });

  it('listMappingVersions maps to GET /mappings/:id/versions', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([{ version: 1 }]);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listMappingVersions('m-1')).resolves.toEqual([{ version: 1 }]);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions',
      method: 'GET',
    });
  });

  it('getMappingVersion maps to GET /mappings/:id/versions/:version', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ version: 2 });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getMappingVersion('m-1', 2)).resolves.toMatchObject({ version: 2 });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions/2',
      method: 'GET',
    });
  });

  it('listVersions maps to GET /mappings/:id/versions with milestone shape', async () => {
    const versions: MappingVersion[] = [
      { version: 2, revisionNumber: 5, createdAt: '2026-06-01T00:00:00.000Z', createdBy: 'system' },
    ];
    vi.mocked(httpRequest).mockResolvedValueOnce(versions);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listVersions('m-1')).resolves.toEqual(versions);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions',
      method: 'GET',
    });
  });

  it('getVersion maps to GET /mappings/:id/versions/:version with milestone shape', async () => {
    const version: MappingVersion = {
      version: 2,
      revisionNumber: 5,
      createdAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'system',
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(version);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getVersion('m-1', 2)).resolves.toEqual(version);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions/2',
      method: 'GET',
    });
  });

  it('saveMappingVersion maps to POST /mappings/:id/versions and handles void', async () => {
    const entry: MappingVersionEntry = {
      version: 3,
      savedAt: '2026-05-01T00:00:00.000Z',
      savedBy: 'You',
      ruleCount: 0,
      config: {
        name: 'Map',
        version: 3,
        engineVersion: '2.0.0',
        config: {},
        rules: [],
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(undefined);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.saveMappingVersion('m-1', entry)).resolves.toBeUndefined();
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions',
      method: 'POST',
      body: {},
    });
  });

  it('listRevisions maps to GET /mappings/:id/revisions', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([{ revision: 2 }]);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listRevisions('m-1')).resolves.toEqual([{ revision: 2 }]);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/revisions',
      method: 'GET',
    });
  });

  it('getRevision maps to GET /mappings/:id/revisions/:revision', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ revision: 2, mappingId: 'm-1' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getRevision('m-1', 2)).resolves.toMatchObject({ revision: 2, mappingId: 'm-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/revisions/2',
      method: 'GET',
    });
  });

  it('createVersion maps to POST /mappings/:id/versions', async () => {
    const version: MappingVersion = {
      version: 3,
      revisionNumber: 5,
      createdAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'system',
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(version);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.createVersion('m-1')).resolves.toEqual(version);
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/versions',
      method: 'POST',
      body: {},
    });
  });

  it('listProjects maps to GET /projects', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([{ projectId: 'p-1' }]);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listProjects()).resolves.toEqual([{ projectId: 'p-1' }]);
    expect(httpRequest).toHaveBeenCalledWith({ baseUrl: API_URL, path: '/projects', method: 'GET' });
  });

  it('getProject maps to GET /projects/:id', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ projectId: 'p-1', mappings: [] });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getProject('p-1')).resolves.toMatchObject({ projectId: 'p-1' });
    expect(httpRequest).toHaveBeenCalledWith({ baseUrl: API_URL, path: '/projects/p-1', method: 'GET' });
  });

  it('createProject maps to POST /projects with body', async () => {
    const input: CreateProjectInput = {
      name: 'Project A',
      description: 'desc',
      slug: 'project-a',
    };
    vi.mocked(httpRequest).mockResolvedValueOnce({ projectId: 'p-1', name: 'Project A' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.createProject(input)).resolves.toMatchObject({ projectId: 'p-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects',
      method: 'POST',
      body: input,
    });
  });

  it('updateProject maps to PUT /projects/:id with body', async () => {
    const input: UpdateProjectInput = { name: 'Project B' };
    vi.mocked(httpRequest).mockResolvedValueOnce({ projectId: 'p-1', name: 'Project B' });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.updateProject('p-1', input)).resolves.toMatchObject({ projectId: 'p-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1',
      method: 'PUT',
      body: input,
    });
  });

  it('deleteProject maps to DELETE /projects/:id and handles void', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(undefined);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.deleteProject('p-1')).resolves.toBeUndefined();
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1',
      method: 'DELETE',
    });
  });

  it('listProjectValueTables maps to GET /projects/:id/value-tables with query options', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.listProjectValueTables('p-1', {
      query: 'status',
      status: 'active',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/value-tables?query=status&status=active&sortBy=updatedAt&sortDirection=desc',
      method: 'GET',
    });
  });

  it('getProjectValueTable maps to GET /value-tables/:id', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ id: 'vt-1' });
    const adapter = new HttpAdapter(API_URL);

    await adapter.getProjectValueTable('vt-1');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1',
      method: 'GET',
    });
  });

  it('getProjectValueTableRevision maps to GET /value-tables/:id/revisions/:revision', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ valueTableId: 'vt-1', revision: 2 });
    const adapter = new HttpAdapter(API_URL);

    await adapter.getProjectValueTableRevision('vt-1', 2);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/revisions/2',
      method: 'GET',
    });
  });

  it('createProjectValueTable maps to POST /projects/:id/value-tables', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ id: 'vt-1' });
    const adapter = new HttpAdapter(API_URL);

    const input = {
      projectId: 'p-1',
      key: 'order-status',
      name: 'Order Status Codes',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' as const },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' as const },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    };

    await adapter.createProjectValueTable(input);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/value-tables',
      method: 'POST',
      body: input,
    });
  });

  it('createProjectValueTableRevision maps to POST /value-tables/:id/revisions', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ valueTableId: 'vt-1', revision: 2 });
    const adapter = new HttpAdapter(API_URL);

    const input = {
      valueTableId: 'vt-1',
      sideA: { key: 'oms-status', label: 'OMS Status', type: 'string' as const },
      sideB: { key: 'cdm-status', label: 'CDM Status', type: 'string' as const },
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'COMPLETED' }],
    };

    await adapter.createProjectValueTableRevision('vt-1', input);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/revisions',
      method: 'POST',
      body: input,
    });
  });

  it('duplicateProjectValueTable maps to POST /value-tables/:id/duplicate', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ id: 'vt-2' });
    const adapter = new HttpAdapter(API_URL);

    const input = {
      projectId: 'p-1',
      valueTableId: 'vt-1',
      name: 'Order Status Codes Copy',
      key: 'order-status-copy',
    };

    await adapter.duplicateProjectValueTable(input);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/duplicate',
      method: 'POST',
      body: input,
    });
  });

  it('archiveProjectValueTable maps to POST /value-tables/:id/archive', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ id: 'vt-1', status: 'archived' });
    const adapter = new HttpAdapter(API_URL);

    await adapter.archiveProjectValueTable('vt-1');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/archive',
      method: 'POST',
      body: {},
    });
  });

  it('deleteProjectValueTable maps to DELETE /value-tables/:id', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce(undefined);
    const adapter = new HttpAdapter(API_URL);

    await adapter.deleteProjectValueTable('vt-1');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1',
      method: 'DELETE',
    });
  });

  it('listProjectValueTableUsage maps to GET /value-tables/:id/usage', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.listProjectValueTableUsage('vt-1');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/usage',
      method: 'GET',
    });
  });

  it('exportProjectValueTableCsv maps to GET /value-tables/:id/export.csv with revision query', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce('csv-content');
    const adapter = new HttpAdapter(API_URL);

    await adapter.exportProjectValueTableCsv('vt-1', 2);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/export.csv?revision=2',
      method: 'GET',
    });
  });

  it('importProjectValueTableCsv maps to POST /projects/:id/value-tables/import-csv', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ valueTableId: 'vt-1', revision: 1 });
    const adapter = new HttpAdapter(API_URL);

    await adapter.importProjectValueTableCsv('p-1', '"A","B"\n"x","y"', {
      name: 'Imported table',
      key: 'imported-table',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/value-tables/import-csv',
      method: 'POST',
      body: {
        csv: '"A","B"\n"x","y"',
        name: 'Imported table',
        key: 'imported-table',
      },
    });
  });

  it('resolveProjectValueTableReference maps to POST /projects/:id/value-tables/resolve', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      ref: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'row-1' }],
      },
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.resolveProjectValueTableReference({
      projectId: 'p-1',
      valueTableId: 'vt-1',
      tableKey: 'order-status',
      revision: 2,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/value-tables/resolve',
      method: 'POST',
      body: {
        projectId: 'p-1',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
      },
    });
  });

  it('resolveProjectValueTableReference omits optional valueTableId when not provided', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      ref: {
        scope: 'project',
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [{ in: 'confirmed', out: 'OPEN', rowId: 'row-1' }],
      },
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.resolveProjectValueTableReference({
      projectId: 'p-1',
      tableKey: 'order-status',
      revision: 2,
      inputSideKey: 'oms-status',
      outputSideKey: 'cdm-status',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/projects/p-1/value-tables/resolve',
      method: 'POST',
      body: {
        projectId: 'p-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'oms-status',
        outputSideKey: 'cdm-status',
      },
    });
  });

  it('getProjectValueTableRevisionDiff maps to GET /value-tables/:id/diff with pagination', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      summary: {
        valueTableId: 'vt-1',
        tableKey: 'order-status',
        fromRevision: 1,
        toRevision: 2,
        counts: { added: 1, removed: 0, changed: 2, unchanged: 10 },
        directionImpact: {
          previous: { aToB: true, bToA: true },
          next: { aToB: true, bToA: false },
        },
      },
      changes: [],
      pageSize: 100,
      nextCursor: '100',
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.getProjectValueTableRevisionDiff('vt-1', 1, 2, { cursor: '0', pageSize: 100 });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/value-tables/vt-1/diff?fromRevision=1&toRevision=2&cursor=0&pageSize=100',
      method: 'GET',
    });
  });

  it('deployMapping maps to POST /mappings/:id/deploy', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      mappingId: 'm-1',
      environmentDeployedAt: 'DEV#2026-06-01T00:00:00.000Z',
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 2,
      configS3Key: 'deployments/m-1/DEV/2026-06-01T00:00:00.000Z.json',
      configHash: 'abc',
      deployedAt: '2026-06-01T00:00:00.000Z',
      deployedBy: 'system',
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.deployMapping('m-1', {
      environment: 'DEV',
      sourceType: 'revision',
      sourceNumber: 2,
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/deploy',
      method: 'POST',
      body: {
        environment: 'DEV',
        sourceType: 'revision',
        sourceNumber: 2,
      },
    });
  });

  it('promoteDeployment maps to POST /mappings/:id/promote', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      mappingId: 'm-1',
      environmentDeployedAt: 'PREPROD#2026-06-01T00:00:00.000Z',
      environment: 'PREPROD',
      sourceType: 'version',
      sourceNumber: 3,
      configS3Key: 'deployments/m-1/PREPROD/2026-06-01T00:00:00.000Z.json',
      configHash: 'abc',
      deployedAt: '2026-06-01T00:00:00.000Z',
      deployedBy: 'system',
      promotedFrom: 'DEV',
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.promoteDeployment('m-1', {
      fromEnvironment: 'DEV',
      toEnvironment: 'PREPROD',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/promote',
      method: 'POST',
      body: {
        fromEnvironment: 'DEV',
        toEnvironment: 'PREPROD',
      },
    });
  });

  it('rollbackDeployment maps to POST /mappings/:id/rollback', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      mappingId: 'm-1',
      environmentDeployedAt: 'PROD#2026-06-01T00:00:00.000Z',
      environment: 'PROD',
      sourceType: 'version',
      sourceNumber: 2,
      configS3Key: 'deployments/m-1/PROD/2026-06-01T00:00:00.000Z.json',
      configHash: 'abc',
      deployedAt: '2026-06-01T00:00:00.000Z',
      deployedBy: 'system',
      rollbackOf: 'PROD#2026-05-31T00:00:00.000Z',
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.rollbackDeployment('m-1', {
      environment: 'PROD',
      deploymentSK: 'PROD#2026-05-31T00:00:00.000Z',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/rollback',
      method: 'POST',
      body: {
        environment: 'PROD',
        deploymentSK: 'PROD#2026-05-31T00:00:00.000Z',
      },
    });
  });

  it('listDeployments maps to GET /mappings/:id/deployments with environment query', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.listDeployments('m-1', { environment: 'PREPROD' });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/deployments?environment=PREPROD',
      method: 'GET',
    });
  });

  it('getCurrentDeployments maps to current endpoint and computes staleness', async () => {
    vi.mocked(httpRequest)
      .mockResolvedValueOnce({
        DEV: {
          mappingIdEnvironment: 'm-1#DEV',
          mappingId: 'm-1',
          environment: 'DEV',
          deployedAt: '2026-06-01T00:00:00.000Z',
          sourceType: 'revision',
          sourceNumber: 1,
          configHash: 'dev-hash',
          configS3Key: 'deployments/m-1/DEV/2026-06-01T00:00:00.000Z.json',
        },
        PREPROD: {
          mappingIdEnvironment: 'm-1#PREPROD',
          mappingId: 'm-1',
          environment: 'PREPROD',
          deployedAt: '2026-06-01T00:00:00.000Z',
          sourceType: 'version',
          sourceNumber: 1,
          configHash: 'preprod-hash',
          configS3Key: 'deployments/m-1/PREPROD/2026-06-01T00:00:00.000Z.json',
        },
        PROD: null,
      })
      .mockResolvedValueOnce({
        id: 'm-1',
        projectId: 'p-1',
        name: 'Map',
        version: 2,
        engineVersion: '2.0.0',
        config: {},
        rules: [],
      })
      .mockResolvedValueOnce([
        {
          version: 2,
          revisionNumber: 2,
          createdAt: '2026-06-01T00:00:00.000Z',
          createdBy: 'system',
        },
      ]);

    const adapter = new HttpAdapter(API_URL);
    const result = await adapter.getCurrentDeployments('m-1');

    expect(httpRequest).toHaveBeenNthCalledWith(1, {
      baseUrl: API_URL,
      path: '/mappings/m-1/deployments/current',
      method: 'GET',
    });

    expect(result.DEV.status).toBe('stale');
    expect(result.PREPROD.status).toBe('stale');
    expect(result.QA.status).toBe('stale');
    expect(result.PROD.status).toBe('not-deployed');
  });

  it('listCdmSchemas maps to GET /schemas/cdm', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.listCdmSchemas();

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/cdm',
      method: 'GET',
    });
  });

  it('listCdmSchemas maps optional path as encoded query parameter', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.listCdmSchemas('JSONSchemas/CommonDataModels/Patient Folder');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/cdm?path=JSONSchemas%2FCommonDataModels%2FPatient%20Folder',
      method: 'GET',
    });
  });

  it('linkCdmSchema maps to POST /schemas/cdm/link with projectId + path payload', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ schemaId: 'schema-cdm-1' });
    const adapter = new HttpAdapter(API_URL);

    await adapter.linkCdmSchema({
      projectId: 'project-1',
      repo: 'KBXT/KBX-Canonicals',
      branch: 'main',
      path: 'JSONSchemas/CommonDataModels/Encounter.json',
      name: 'Encounter',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/cdm/link',
      method: 'POST',
      body: {
        projectId: 'project-1',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        branch: 'main',
        name: 'Encounter',
      },
    });
  });

  it('syncAllCdmSchemas maps to POST /schemas/cdm/sync', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      rootPath: 'JSONSchemas-bundled/CommonDataModels',
      scannedFiles: 14,
      imported: 14,
      skipped: 0,
      failed: 0,
      excludedSchemaIds: [],
      errors: [],
      message: 'CDM sync completed.',
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.syncAllCdmSchemas();

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/cdm/sync',
      method: 'POST',
      body: {},
    });
  });

  it('syncCdmSchema maps to POST /schemas/:id/sync-cdm', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ schemaId: 'schema-cdm-1', synced: true });
    const adapter = new HttpAdapter(API_URL);

    await adapter.syncCdmSchema('schema-cdm-1');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/schema-cdm-1/sync-cdm',
      method: 'POST',
      body: {},
    });
  });

  it('syncCdmSchema maps statusOnly=true to GET /schemas/:id/sync-cdm', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ schemaId: 'schema-cdm-1', synced: false, message: 'Update available from CDM source.' });
    const adapter = new HttpAdapter(API_URL);

    await adapter.syncCdmSchema('schema-cdm-1', { statusOnly: true });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/schema-cdm-1/sync-cdm',
      method: 'GET',
    });
  });

  it('propagates errors from httpRequest unchanged', async () => {
    const error = new Error('boom');
    vi.mocked(httpRequest).mockRejectedValueOnce(error);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listProjects()).rejects.toBe(error);
  });

  it('previewOnServer maps to POST /mappings/:id/preview', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      output: { ok: true },
      diagnostics: [],
      metadata: {
        environment: 'DEV',
        artifactId: 'artifact-dev-1',
        artifactHash: 'hash-dev-1',
        deployedAt: '2026-06-04T00:00:00.000Z',
        sourceType: 'version',
        sourceNumber: 1,
        engineVersion: '1.0.0',
      },
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.previewOnServer('m-1', {
      environment: 'DEV',
      sourceData: { a: 1 },
      externalSources: { customerProfile: { customerId: 'c-1' } },
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/preview',
      method: 'POST',
      body: {
        environment: 'DEV',
        sourceData: { a: 1 },
        externalSources: { customerProfile: { customerId: 'c-1' } },
      },
    });
  });

  it('getDeploymentContext maps to GET /mappings/:id/deploy-context', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      mappingId: 'm-1',
      mappingName: 'Map 1',
      projectId: 'p-1',
      projectName: 'Project 1',
      environments: [],
    });
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.getDeploymentContext('m-1')).resolves.toMatchObject({ mappingId: 'm-1' });
    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/deploy-context',
      method: 'GET',
    });
  });

  it.each([
    ['listTemplates', (a: HttpAdapter) => a.listTemplates()],
    ['getTemplate', (a: HttpAdapter) => a.getTemplate('t-1')],
    ['deploy', (a: HttpAdapter) => a.deploy('m-1', 'DEV')],
    ['promote', (a: HttpAdapter) => a.promote('m-1', 'DEV', 'PREPROD')],
    ['rollback', (a: HttpAdapter) => a.rollback('m-1', 'DEV', 1)],
    ['getDeploymentDiff', (a: HttpAdapter) => a.getDeploymentDiff('m-1', 1, 2)],
    ['listPublishedSchemas', (a: HttpAdapter) => a.listPublishedSchemas()],
    [
      'publishSchemaToGitHub',
      (a: HttpAdapter) => a.publishSchemaToGitHub('s-1', { repo: 'r', branch: 'b', path: '/a.xsd' }),
    ],
    [
      'linkPublishedSchema',
      (a: HttpAdapter) => a.linkPublishedSchema({ repo: 'r', branch: 'b', path: '/a.xsd' }),
    ],
    ['listActivity', (a: HttpAdapter) => a.listActivity()],
  ])('%s throws FeatureNotEnabledError', async (_methodName, invoke) => {
    const adapter = new HttpAdapter(API_URL);

    await expect(invoke(adapter)).rejects.toBeInstanceOf(FeatureNotEnabledError);
    await expect(invoke(adapter)).rejects.toMatchObject({
      code: 'FEATURE_NOT_ENABLED',
      retryable: false,
    });
  });

  it('toAppError compatibility for FeatureNotEnabledError', () => {
    const appError = toAppError(new FeatureNotEnabledError('deploy'));

    expect(appError).toMatchObject({
      message: '"deploy" is not enabled in this mode.',
      code: 'FEATURE_NOT_ENABLED',
      retryable: false,
    });
  });

  it('autoMap maps to POST /ai/auto-map', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ rules: [], diagnostics: [] });
    const adapter = new HttpAdapter(API_URL);

    await adapter.autoMap({ projectId: 'p-1', mappingId: 'm-1' });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/auto-map',
      method: 'POST',
      body: { projectId: 'p-1', mappingId: 'm-1' },
    });
  });

  it('autoMap forwards additive scoped fields (visibleTargetPaths/sourceSchemaId/businessContext)', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ rules: [], diagnostics: [] });
    const adapter = new HttpAdapter(API_URL);

    await adapter.autoMap({
      projectId: 'p-1',
      mappingId: 'm-1',
      mode: 'section',
      sectionPath: 'Order.Header',
      sourceSchemaId: 'schema-source-1',
      businessContext: 'Invoice to order mapping',
      visibleTargetPaths: ['Order.Header.DocumentType', 'Order.Header.CurrencyCode'],
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/auto-map',
      method: 'POST',
      body: {
        projectId: 'p-1',
        mappingId: 'm-1',
        mode: 'section',
        sectionPath: 'Order.Header',
        sourceSchemaId: 'schema-source-1',
        businessContext: 'Invoice to order mapping',
        visibleTargetPaths: ['Order.Header.DocumentType', 'Order.Header.CurrencyCode'],
      },
    });
  });

  it('autoMap preserves optional diagnostics/warnings/retrievalMeta', async () => {
    const payload = {
      rules: [],
      diagnostics: [],
      warnings: ['Low confidence coverage'],
      retrievalMeta: { source: 'opensearch', degraded: false },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(payload);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.autoMap({ projectId: 'p-1', mappingId: 'm-1' })).resolves.toEqual(payload);
  });

  it('autoMapSection maps to POST /ai/auto-map', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ suggestions: [] });
    const adapter = new HttpAdapter(API_URL);

    await adapter.autoMapSection({
      projectId: 'p-1',
      mappingId: 'm-1',
      sectionPath: 'Order.Header',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/auto-map',
      method: 'POST',
      body: {
        projectId: 'p-1',
        mappingId: 'm-1',
        sectionPath: 'Order.Header',
      },
    });
  });

  it('autoMapSection forwards mode and preserves retrieval/validation metadata', async () => {
    const payload: AutoMapSectionResult = {
      suggestions: [],
      retrievalMeta: {
        mode: 'whole',
        noContext: true,
        noContextReason: 'No relevant source context found for target scope',
      },
      validationMeta: {
        validationPassCount: 0,
        validationFailCount: 0,
      },
      dedupMeta: {
        duplicatesCollapsed: 0,
      },
      scopeMeta: {
        mode: 'whole',
        visibleTargetPaths: ['Order.Header.DocumentType'],
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(payload);

    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.autoMapSection({
        projectId: 'p-1',
        mappingId: 'm-1',
        mode: 'whole',
      }),
    ).resolves.toEqual(payload);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/auto-map',
      method: 'POST',
      body: {
        projectId: 'p-1',
        mappingId: 'm-1',
        mode: 'whole',
      },
    });
  });

  it('suggestExpression maps to POST /ai/suggest-expression', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      expression: 'source("x")',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      context: {
        sourceNodeCount: 8,
        includedNodeCount: 8,
        truncated: false,
        approxTokenCount: 42,
        byteLength: 240,
      },
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.suggestExpression({
      mappingId: 'm-1',
      instruction: 'copy',
      targetPath: 'Order.Total',
      targetType: 'string',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/suggest-expression',
      method: 'POST',
      body: {
        mappingId: 'm-1',
        instruction: 'copy',
        targetPath: 'Order.Total',
        targetType: 'string',
      },
    });
  });

  it('suggestExpression preserves invalid validation payloads for review gating', async () => {
    const payload = {
      expression: 'concat(source("Invoice.Total"), source("Invoice.CurrencyCode"))',
      explanation: 'Combines total and currency for display',
      validation: {
        valid: false,
        diagnostics: [
          {
            code: 'TYPE_MISMATCH',
            severity: 'error',
            message: 'Expression returns string but target type is number',
            path: 'Order.Total',
          },
        ],
      },
      readyToApply: false,
      context: {
        sourceNodeCount: 130,
        includedNodeCount: 100,
        truncated: true,
        approxTokenCount: 7700,
        byteLength: 64000,
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(payload);

    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.suggestExpression({
        mappingId: 'm-1',
        instruction: 'format total with currency',
        targetPath: 'Order.Total',
        targetType: 'number',
      }),
    ).resolves.toEqual(payload);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/suggest-expression',
      method: 'POST',
      body: {
        mappingId: 'm-1',
        instruction: 'format total with currency',
        targetPath: 'Order.Total',
        targetType: 'number',
      },
    });
  });

  it('suggestExpression preserves normalized app errors from httpRequest', async () => {
    const normalizedError = Object.assign(new Error('Invalid request body'), {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      retryable: false,
    });
    vi.mocked(httpRequest).mockRejectedValueOnce(normalizedError);

    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.suggestExpression({
        mappingId: 'm-1',
        instruction: 'copy amount',
        targetPath: 'Order.Total',
        targetType: 'number',
      }),
    ).rejects.toBe(normalizedError);
  });

  it('AE-01/AE-05: explainRule maps to POST /ai/explain-rule and preserves structured response', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      explanation: 'Maps source x to Order.Total.',
      confidence: 'medium',
      limitations: ['Assumes source field x exists.'],
    });
    const adapter = new HttpAdapter(API_URL);

    const input = { targetPath: 'Order.Total', expression: 'source("x")' };
    const result = await adapter.explainRule(input);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/explain-rule',
      method: 'POST',
      body: { targetPath: 'Order.Total', expression: 'source("x")' },
    });
    expect(result).toEqual({
      explanation: 'Maps source x to Order.Total.',
      confidence: 'medium',
      limitations: ['Assumes source field x exists.'],
    });
  });

  it('AE-03: explainRule call does not mutate caller input object', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ explanation: 'ok' });
    const adapter = new HttpAdapter(API_URL);

    const input = { targetPath: 'Order.Total', expression: 'source("x")' };
    const before = JSON.parse(JSON.stringify(input)) as typeof input;

    await adapter.explainRule(input);

    expect(input).toEqual(before);
  });

  it('smartFix maps to POST /ai/smart-fix with rule-scoped request payload', async () => {
    const payload = {
      originalExpression: 'source("Invoice.Total")',
      suggestedExpression: 'default(source("Invoice.Total"), 0)',
      explanation: 'Defaults missing Invoice.Total to 0 to prevent null propagation.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      diagnosticsScopeApplied: 'all' as const,
      context: {
        truncated: false,
        approxTokenCount: 312,
        byteLength: 2012,
        totalDiagnosticCount: 2,
        includedDiagnosticCount: 2,
        sourceNodeCount: 120,
        includedSourceNodeCount: 56,
        targetNodeCount: 80,
        includedTargetNodeCount: 37,
      },
      applyGuard: {
        ruleVersion: 12,
        ruleHash: 'fnv1a-91e713ad',
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(payload);
    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.smartFix({
        mappingId: 'm-1',
        ruleIndex: 0,
        targetPath: 'Order.Total',
        targetType: 'number',
        failingExpression: 'source("Invoice.Total")',
        diagnostics: [
          { code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch', path: 'Order.Total' },
          { code: 'KEYRA-W003', severity: 'warning', message: 'Null propagated', path: 'Order.Total' },
        ],
        diagnosticScope: 'all',
        ruleVersion: 12,
        ruleHash: 'fnv1a-91e713ad',
      }),
    ).resolves.toEqual(payload);

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/smart-fix',
      method: 'POST',
      body: {
        mappingId: 'm-1',
        ruleIndex: 0,
        targetPath: 'Order.Total',
        targetType: 'number',
        failingExpression: 'source("Invoice.Total")',
        diagnostics: [
          { code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch', path: 'Order.Total' },
          { code: 'KEYRA-W003', severity: 'warning', message: 'Null propagated', path: 'Order.Total' },
        ],
        diagnosticScope: 'all',
        ruleVersion: 12,
        ruleHash: 'fnv1a-91e713ad',
      },
    });
  });

  it('smartFix preserves invalid suggestion responses for edit-to-valid gating', async () => {
    const payload = {
      originalExpression: 'source("Invoice.Total")',
      suggestedExpression: 'concat(source("Invoice.Total"), "USD")',
      explanation: 'Converts amount to a formatted currency string.',
      validation: {
        valid: false,
        diagnostics: [
          {
            code: 'TYPE_MISMATCH',
            severity: 'error',
            message: 'Expression returns string but target type is number',
            path: 'Order.Total',
          },
        ],
      },
      readyToApply: false,
      diagnosticsScopeApplied: 'single' as const,
      context: {
        truncated: true,
        approxTokenCount: 7900,
        byteLength: 64000,
        totalDiagnosticCount: 14,
        includedDiagnosticCount: 8,
        sourceNodeCount: 450,
        includedSourceNodeCount: 120,
        targetNodeCount: 310,
        includedTargetNodeCount: 88,
      },
      applyGuard: {
        ruleVersion: 12,
        ruleHash: 'fnv1a-91e713ad',
      },
    };
    vi.mocked(httpRequest).mockResolvedValueOnce(payload);
    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.smartFix({
        mappingId: 'm-1',
        ruleIndex: 0,
        targetPath: 'Order.Total',
        targetType: 'number',
        failingExpression: 'source("Invoice.Total")',
        diagnostics: [
          { code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch', path: 'Order.Total' },
          { code: 'KEYRA-W003', severity: 'warning', message: 'Null propagated', path: 'Order.Total' },
        ],
        diagnosticScope: 'single',
        selectedDiagnosticIndex: 0,
        ruleVersion: 12,
        ruleHash: 'fnv1a-91e713ad',
      }),
    ).resolves.toEqual(payload);
  });

  it('smartFix preserves stale mismatch errors for re-run gating', async () => {
    const normalizedError = Object.assign(new Error('Rule snapshot is stale. Re-run fix on latest rule before applying.'), {
      code: 'CONFLICT',
      statusCode: 409,
      retryable: false,
    });
    vi.mocked(httpRequest).mockRejectedValueOnce(normalizedError);
    const adapter = new HttpAdapter(API_URL);

    await expect(
      adapter.smartFix({
        mappingId: 'm-1',
        ruleIndex: 0,
        targetPath: 'Order.Total',
        failingExpression: 'source("Invoice.Total")',
        diagnostics: [{ code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch' }],
      }),
    ).rejects.toBe(normalizedError);
  });

  it.each([
    [
      'smartFix',
      (adapter: HttpAdapter) =>
        adapter.smartFix({
          mappingId: 'm-1',
          ruleIndex: 0,
          targetPath: 'Order.Total',
          failingExpression: 'source("Invoice.Total")',
          diagnostics: [{ code: 'KEYRA-E005', severity: 'error', message: 'Type mismatch' }],
        }),
    ],
    ['validateMappings', (adapter: HttpAdapter) => adapter.validateMappings({ mappingId: 'm-1' })],
  ])('%s surfaces FEATURE_NOT_ENABLED when backend capability is gated', async (_method, invoke) => {
    const featureGated = new FeatureNotEnabledError('gated');
    vi.mocked(httpRequest).mockRejectedValueOnce(featureGated);
    const adapter = new HttpAdapter(API_URL);

    await expect(invoke(adapter)).rejects.toMatchObject({
      code: 'FEATURE_NOT_ENABLED',
      retryable: false,
    });
  });

  it('validateMappings maps to POST /ai/validate-mappings', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      summary: {
        totalIssues: 0,
        bySeverity: { info: 0, warning: 0, error: 0 },
        byCategory: { correctness: 0, completeness: 0, maintainability: 0, risk: 0 },
      },
      issues: [],
    });
    const adapter = new HttpAdapter(API_URL);

    await adapter.validateMappings({ mappingId: 'm-1' });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/validate-mappings',
      method: 'POST',
      body: { mappingId: 'm-1' },
    });
  });

  it('validateMappings passes optional sampleData payload', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({
      summary: {
        totalIssues: 1,
        bySeverity: { info: 0, warning: 1, error: 0 },
        byCategory: { correctness: 0, completeness: 1, maintainability: 0, risk: 0 },
      },
      issues: [
        {
          id: 'issue-1',
          category: 'completeness',
          severity: 'warning',
          affectedRules: [{ ruleIndex: 0, targetPath: 'Order.Header.CurrencyCode' }],
          description: 'Missing fallback behavior.',
          recommendation: 'Add explicit fallback.',
        },
      ],
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.validateMappings({
      mappingId: 'm-1',
      sampleData: {
        contentType: 'application/json',
        content: '{"InvoiceCurrency":null}',
      },
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/validate-mappings',
      method: 'POST',
      body: {
        mappingId: 'm-1',
        sampleData: {
          contentType: 'application/json',
          content: '{"InvoiceCurrency":null}',
        },
      },
    });
  });

  it('querySchemaNodes maps to POST /schemas/:id/query', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce([]);
    const adapter = new HttpAdapter(API_URL);

    await adapter.querySchemaNodes('s-1', 'postal');

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/schemas/s-1/query',
      method: 'POST',
      body: { query: 'postal' },
    });
  });
});
