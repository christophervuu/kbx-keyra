import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  getItem: vi.fn(),
  scan: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/link-cdm-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('link-cdm-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_ID = '1052821334';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas/CommonDataModels';
    env.PROJECTS_TABLE = 'Projects';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      path: 'Encounter.json',
    });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      projectId: 'proj-1',
      name: 'Project 1',
      description: '',
      slug: 'project-1',
      schemaRefs: [],
      tags: [],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    sharedMocks.scan.mockReset().mockResolvedValue([]);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse
      .mockReset()
      .mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId) => ({
        statusCode,
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId } }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockReturnValue({
        code: 'VALIDATION_ERROR',
        message: 'Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.',
        statusCode: 400,
        retryable: false,
        requestId: 'req-validation',
      });
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockReturnValue({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        statusCode: 503,
        retryable: true,
        requestId: 'req-unavailable',
      });
    sharedMocks.internalError
      .mockReset()
      .mockReturnValue({
        code: 'INTERNAL_ERROR',
        message: 'Internal failure',
        statusCode: 500,
        retryable: true,
        requestId: 'req-internal',
      });

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('creates CDM schema metadata with repoId and attaches to project (AE-02)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { encounterId: { type: 'string' } } });

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-enc-1',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as {
      schemaId: string;
      origin: string;
      sourceRepoId?: number;
      source: { type: string; repo: string; repoId?: number; branch: string; path: string; commitSha?: string };
    };
    expect(payload.origin).toBe('cdm');
    expect(payload.source.repo).toBe('KBXT/KBX-Canonicals');
    expect(payload.source.repoId).toBe(1052821334);
    expect(payload.source.branch).toBe('main');
    expect(payload.source.path).toBe('JSONSchemas/CommonDataModels/Encounter.json');
    expect(payload.source.commitSha).toBe('sha-enc-1');
    expect(payload.sourceRepoId).toBe(1052821334);

    const metadataPut = sharedMocks.putItem.mock.calls[0]?.[0] as { Item?: Record<string, unknown> } | undefined;
    expect(metadataPut?.Item?.origin).toBe('cdm');
    expect(metadataPut?.Item?.sourceRepoId).toBe(1052821334);

    const projectUpdate = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> } | undefined;
    const schemaRefs = projectUpdate?.ExpressionAttributeValues?.[':schemaRefs'] as Array<Record<string, unknown>> | undefined;
    expect(schemaRefs).toHaveLength(1);
    expect(schemaRefs?.[0]).toEqual({
      schemaId: payload.schemaId,
      type: 'github',
      commitSha: 'sha-enc-1',
    });
  });

  it('returns idempotent success for duplicate link in same project', async () => {
    sharedMocks.scan.mockResolvedValue([
      {
        schemaId: 'schema-existing',
        name: 'Encounter',
        format: 'json-schema',
        fieldCount: 1,
        origin: 'cdm',
        status: 'ready',
        scope: 'project',
        syncStatus: 'synced',
        source: {
          type: 'github',
          repo: 'KBXT/KBX-Canonicals',
          repoId: 1052821334,
          branch: 'main',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          commitSha: 'sha-enc-existing',
        },
        sourceRepoId: 1052821334,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
      },
    ]);
    sharedMocks.getItem.mockResolvedValue({
      projectId: 'proj-1',
      name: 'Project 1',
      description: '',
      slug: 'project-1',
      schemaRefs: [{ schemaId: 'schema-existing', type: 'github', commitSha: 'sha-enc-existing' }],
      tags: [],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as { schemaId: string };
    expect(payload.schemaId).toBe('schema-existing');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).not.toHaveBeenCalled();
  });

  it('rejects out-of-root paths deterministically', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      path: '../outside.json',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('rejects nested traversal patterns that attempt to escape CDM root', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      path: 'Patient/../../outside.json',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('rejects unsupported file formats before GitHub read', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      path: 'JSONSchemas/CommonDataModels/README.md',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('Unsupported CDM file format');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns SOURCE_NOT_FOUND when requested CDM file is missing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue({ message: 'Not Found' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(404);
    const parsed = JSON.parse(result.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('uses read-only GitHub APIs only (AE-09)', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
        json: vi.fn().mockResolvedValue({
          name: 'Encounter.json',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-enc-2',
          download_url: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"type":"object"}'),
      });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      const method = (call[1] as { method?: string } | undefined)?.method;
      expect(method).toBe('GET');
      expect(url).not.toContain('/git/refs');
      expect(url).not.toContain('/git/trees');
      expect(url).not.toContain('message=');
    }
  });
});
