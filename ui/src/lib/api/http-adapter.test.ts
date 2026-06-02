import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureNotEnabledError } from './errors';
import { HttpAdapter } from './http-adapter';
import { httpRequest } from './http-client';

import { toAppError } from '@/lib/state/app-error';
import type {
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
    const input: CreateMappingInput = { projectId: 'p-1', name: 'Map A' };
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
      environmentDeployedAt: 'QA#2026-06-01T00:00:00.000Z',
      environment: 'QA',
      sourceType: 'version',
      sourceNumber: 3,
      configS3Key: 'deployments/m-1/QA/2026-06-01T00:00:00.000Z.json',
      configHash: 'abc',
      deployedAt: '2026-06-01T00:00:00.000Z',
      deployedBy: 'system',
      promotedFrom: 'DEV',
    });

    const adapter = new HttpAdapter(API_URL);

    await adapter.promoteDeployment('m-1', {
      fromEnvironment: 'DEV',
      toEnvironment: 'QA',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/promote',
      method: 'POST',
      body: {
        fromEnvironment: 'DEV',
        toEnvironment: 'QA',
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

    await adapter.listDeployments('m-1', { environment: 'QA' });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/mappings/m-1/deployments?environment=QA',
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
        QA: {
          mappingIdEnvironment: 'm-1#QA',
          mappingId: 'm-1',
          environment: 'QA',
          deployedAt: '2026-06-01T00:00:00.000Z',
          sourceType: 'version',
          sourceNumber: 1,
          configHash: 'qa-hash',
          configS3Key: 'deployments/m-1/QA/2026-06-01T00:00:00.000Z.json',
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
    expect(result.QA.status).toBe('stale');
    expect(result.PROD.status).toBe('not-deployed');
  });

  it('propagates errors from httpRequest unchanged', async () => {
    const error = new Error('boom');
    vi.mocked(httpRequest).mockRejectedValueOnce(error);
    const adapter = new HttpAdapter(API_URL);

    await expect(adapter.listProjects()).rejects.toBe(error);
  });

  it.each([
    ['listTemplates', (a: HttpAdapter) => a.listTemplates()],
    ['getTemplate', (a: HttpAdapter) => a.getTemplate('t-1')],
    ['getDeploymentContext', (a: HttpAdapter) => a.getDeploymentContext('m-1')],
    ['deploy', (a: HttpAdapter) => a.deploy('m-1', 'DEV')],
    ['promote', (a: HttpAdapter) => a.promote('m-1', 'DEV', 'QA')],
    ['rollback', (a: HttpAdapter) => a.rollback('m-1', 'DEV', 1)],
    ['getDeploymentDiff', (a: HttpAdapter) => a.getDeploymentDiff('m-1', 1, 2)],
    ['listCdmSchemas', (a: HttpAdapter) => a.listCdmSchemas()],
    ['linkCdmSchema', (a: HttpAdapter) => a.linkCdmSchema({ repo: 'r', branch: 'b', path: '/a.xsd' })],
    ['syncCdmSchema', (a: HttpAdapter) => a.syncCdmSchema('s-1')],
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
    [
      'previewOnServer',
      (a: HttpAdapter) => a.previewOnServer('m-1', { environment: 'DEV', sourceData: {} }),
    ],
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

  it('suggestExpression maps to POST /ai/suggest-expression', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ expression: 'source("x")' });
    const adapter = new HttpAdapter(API_URL);

    await adapter.suggestExpression({
      instruction: 'copy',
      targetPath: 'Order.Total',
      targetType: 'string',
      sourceContext: '- Invoice.Total (number)',
    });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/suggest-expression',
      method: 'POST',
      body: {
        instruction: 'copy',
        targetPath: 'Order.Total',
        targetType: 'string',
        sourceContext: '- Invoice.Total (number)',
      },
    });
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

  it('smartFix maps to POST /ai/smart-fix', async () => {
    vi.mocked(httpRequest).mockResolvedValueOnce({ updatedRules: [] });
    const adapter = new HttpAdapter(API_URL);

    await adapter.smartFix({ mappingId: 'm-1', diagnostics: [] });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/smart-fix',
      method: 'POST',
      body: { mappingId: 'm-1', diagnostics: [] },
    });
  });

  it.each([
    ['smartFix', (adapter: HttpAdapter) => adapter.smartFix({ mappingId: 'm-1', diagnostics: [] })],
    ['validateMappings', (adapter: HttpAdapter) => adapter.validateMappings({ mappingIds: ['m-1'] })],
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
    vi.mocked(httpRequest).mockResolvedValueOnce({ valid: true, diagnostics: [] });
    const adapter = new HttpAdapter(API_URL);

    await adapter.validateMappings({ mappingIds: ['m-1'] });

    expect(httpRequest).toHaveBeenCalledWith({
      baseUrl: API_URL,
      path: '/ai/validate-mappings',
      method: 'POST',
      body: { mappingIds: ['m-1'] },
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
