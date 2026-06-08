import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  generateRequestId: vi.fn(),
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
    CDM_RATE_LIMITED: 'CDM_RATE_LIMITED',
    CDM_UNAUTHORIZED_FORBIDDEN: 'CDM_UNAUTHORIZED_FORBIDDEN',
    CDM_NOT_FOUND_PATH_MISMATCH: 'CDM_NOT_FOUND_PATH_MISMATCH',
    CDM_TIMEOUT_TRANSIENT: 'CDM_TIMEOUT_TRANSIENT',
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
    env.CDM_ROOT_PATH = 'JSONSchemas-bundled/CommonDataModels';
    env.PROJECTS_TABLE = 'Projects';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';
    env.CDM_GITHUB_READ_MAX_ATTEMPTS = '3';
    env.CDM_GITHUB_READ_BASE_DELAY_MS = '1';
    env.CDM_GITHUB_READ_MAX_DELAY_MS = '1';
    env.CDM_GITHUB_READ_JITTER_MS = '1';

    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      path: 'Encounter.json',
    });
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-link-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({
      projectId: 'proj-1',
      name: 'Project 1',
      description: '',
      slug: 'project-1',
      linkedSchemaIds: [],
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
      .mockImplementation((code, message, statusCode, retryable, requestId, details, additionalHeaders) => ({
        statusCode,
        headers: {
          ...((additionalHeaders as Record<string, string> | undefined) ?? {}),
        },
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId, ...(details !== undefined ? { details } : {}) } }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'VALIDATION_ERROR',
        message,
        statusCode: 400,
        retryable: false,
        requestId: 'req-validation',
      }));
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'SERVICE_UNAVAILABLE',
        message,
        statusCode: 503,
        retryable: true,
        requestId: 'req-unavailable',
      }));
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
        path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
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
    expect(payload.source.path).toBe('JSONSchemas-bundled/CommonDataModels/Encounter.json');
    expect(payload.source.commitSha).toBe('sha-enc-1');
    expect(payload.sourceRepoId).toBe(1052821334);

    const metadataPut = sharedMocks.putItem.mock.calls[0]?.[0] as { Item?: Record<string, unknown> } | undefined;
    expect(metadataPut?.Item?.origin).toBe('cdm');
    expect(metadataPut?.Item?.sourceRepoId).toBe(1052821334);

    const projectUpdate = sharedMocks.updateItem.mock.calls[0]?.[0] as { ExpressionAttributeValues?: Record<string, unknown> } | undefined;
    const schemaRefs = projectUpdate?.ExpressionAttributeValues?.[':schemaRefs'] as Array<Record<string, unknown>> | undefined;
    const linkedSchemaIds = projectUpdate?.ExpressionAttributeValues?.[':linkedSchemaIds'] as string[] | undefined;
    expect(schemaRefs).toHaveLength(1);
    expect(linkedSchemaIds).toHaveLength(1);
    expect(schemaRefs?.[0]).toEqual({
      schemaId: payload.schemaId,
      type: 'github',
      commitSha: 'sha-enc-1',
    });
  });

  it('normalizes linkedSchemaIds when linking existing CDM schema to project', async () => {
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
          path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
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
      linkedSchemaIds: [' schema-existing ', 'schema-existing', '   '],
      schemaRefs: [],
      tags: [],
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.updateItem).toHaveBeenCalledTimes(1);
    const updateCall = sharedMocks.updateItem.mock.calls[0]?.[0] as {
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    expect(updateCall.ExpressionAttributeValues?.[':linkedSchemaIds']).toEqual(['schema-existing']);
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
          path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
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
      linkedSchemaIds: ['schema-existing'],
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
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas-bundled/CommonDataModels/* is allowed.');
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
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas-bundled/CommonDataModels/* is allowed.');
  });

  it('rejects unsupported file formats before GitHub read', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      path: 'JSONSchemas-bundled/CommonDataModels/README.md',
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('Unsupported CDM file format');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns deterministic not-found-path-mismatch class when requested CDM file is missing', async () => {
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
    const parsed = JSON.parse(result.body) as { error: { code: string; details?: { failureClass?: string; retryCount?: number } } };
    expect(parsed.error.code).toBe('CDM_NOT_FOUND_PATH_MISMATCH');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'not-found-path-mismatch',
      retryCount: 0,
    });
  });

  it('returns rate-limited class with retry-after metadata when GitHub is rate limited', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'retry-after' ? '12' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'Rate limited' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(503);
    const parsed = JSON.parse(result.body) as {
      error: { code: string; details?: { failureClass?: string; retryAfterSeconds?: number; retryCount?: number } };
    };
    expect(parsed.error.code).toBe('CDM_RATE_LIMITED');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'rate-limited',
      retryAfterSeconds: 12,
      retryCount: 2,
    });
    expect((result as { headers?: Record<string, string> }).headers).toMatchObject({
      'retry-after': '12',
    });
  });

  it('retries transient 5xx failures up to max attempts before timeout-transient classification', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue({ message: 'Service unavailable' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' } as never);

    expect(result.statusCode).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const parsed = JSON.parse(result.body) as { error: { code: string; details?: { failureClass?: string; retryCount?: number } } };
    expect(parsed.error.code).toBe('CDM_TIMEOUT_TRANSIENT');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'timeout-transient',
      retryCount: 2,
    });
  });

  it('emits retry attempt + terminal logs including operation/path and lineage IDs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue({ message: 'Service unavailable' }),
    });

    const { handler } = await importHandler();
    await handler({ body: '{}', headers: { 'x-correlation-id': 'corr-link-1' } } as never);

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[cdm-github-read] terminal',
      expect.objectContaining({
        event: 'cdm-github-read-terminal',
        operation: 'link',
        repo: 'KBXT/KBX-Canonicals',
        path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
        requestId: 'req-link-1',
        correlationId: 'corr-link-1',
        outcome: 'failed',
        failureClass: 'timeout-transient',
      }),
    );

    warnSpy.mockRestore();
    errorSpy.mockRestore();
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
          path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-enc-2',
          download_url: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas-bundled/CommonDataModels/Encounter.json',
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
