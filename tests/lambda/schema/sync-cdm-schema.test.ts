import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  generateRequestId: vi.fn(),
  getItem: vi.fn(),
  updateItem: vi.fn(),
  putObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    CDM_RATE_LIMITED: 'CDM_RATE_LIMITED',
    CDM_UNAUTHORIZED_FORBIDDEN: 'CDM_UNAUTHORIZED_FORBIDDEN',
    CDM_NOT_FOUND_PATH_MISMATCH: 'CDM_NOT_FOUND_PATH_MISMATCH',
    CDM_TIMEOUT_TRANSIENT: 'CDM_TIMEOUT_TRANSIENT',
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

const persistenceMock = vi.hoisted(() => ({
  logSyncActivity: vi.fn().mockResolvedValue(undefined),
  SyncActivityError: class SyncActivityError extends Error {
    constructor(code: string, message: string) {
      super(message);
      this.name = 'SyncActivityError';
    }
  },
  type: { LogSyncActivityInput: Object },
}));

const schemaMock = vi.hoisted(() => ({
  updateSyncMetadata: vi.fn().mockResolvedValue(undefined),
  updateSchemaStatus: vi.fn().mockResolvedValue(undefined),
  batchWriteSchemaNodes: vi.fn().mockResolvedValue({ written: 1, failed: 0 }),
  ensureIndexExists: vi.fn().mockResolvedValue(undefined),
  bulkIndexSchemaNodes: vi.fn().mockResolvedValue({ indexed: 1, failed: 0 }),
  storeProcessedContent: vi.fn().mockResolvedValue('processed-key'),
  storeOriginalSchema: vi.fn().mockResolvedValue('original-key'),
  getInlineFieldThreshold: vi.fn().mockReturnValue(500),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

vi.mock('../../../src/lib/persistence/index.js', () => ({
  logSyncActivity: persistenceMock.logSyncActivity,
}));

vi.mock('../../../src/lib/schema/index.js', async () => {
  const actual = await vi.importActual<{
    parseJsonSchema: (content: string, schemaId: string) => { nodes: unknown[]; fieldCount: number; errors?: string[] };
    parseXsd: (...args: unknown[]) => unknown;
  }>('../../../src/lib/schema/index.js');
  return {
    ...actual,
    ...schemaMock,
  };
});

async function importHandler() {
  return import('../../../src/lambda/schema/sync-cdm-schema.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('sync-cdm-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas/CommonDataModels';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';
    env.CDM_GITHUB_READ_MAX_ATTEMPTS = '3';
    env.CDM_GITHUB_READ_BASE_DELAY_MS = '1';
    env.CDM_GITHUB_READ_MAX_DELAY_MS = '1';
    env.CDM_GITHUB_READ_JITTER_MS = '1';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-sync-1');
    sharedMocks.getItem.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      format: 'json-schema',
      origin: 'cdm',
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: 'KBXT/KBX-Canonicals',
        branch: 'main',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        commitSha: 'sha-old',
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    });
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
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

    schemaMock.updateSyncMetadata.mockReset().mockResolvedValue(undefined);
    schemaMock.updateSchemaStatus.mockReset().mockResolvedValue(undefined);
    schemaMock.batchWriteSchemaNodes.mockReset().mockResolvedValue({ written: 1, failed: 0 });
    schemaMock.ensureIndexExists.mockReset().mockResolvedValue(undefined);
    schemaMock.bulkIndexSchemaNodes.mockReset().mockResolvedValue({ indexed: 1, failed: 0 });
    schemaMock.storeProcessedContent.mockReset().mockResolvedValue('processed-key');
    schemaMock.storeOriginalSchema.mockReset().mockResolvedValue('original-key');
    schemaMock.getInlineFieldThreshold.mockReset().mockReturnValue(500);
    persistenceMock.logSyncActivity.mockReset().mockResolvedValue(undefined);
  });

  it('re-sync triggers full re-ingestion pipeline on upstream change (AE-01)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);

    // AE-01: Full re-ingestion pipeline is invoked
    expect(schemaMock.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(schemaMock.ensureIndexExists).toHaveBeenCalledTimes(1);
    expect(schemaMock.bulkIndexSchemaNodes).toHaveBeenCalledTimes(1);
    expect(schemaMock.storeProcessedContent).toHaveBeenCalledTimes(1);
    expect(schemaMock.updateSchemaStatus).toHaveBeenCalledTimes(1);

    // AE-01: commit SHA is persisted after successful ingestion
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledTimes(1);
    const updateCall = schemaMock.updateSyncMetadata.mock.calls[0] as [string, Record<string, unknown>];
    expect(updateCall[1].syncStatus).toBe('synced');
    expect(updateCall[1].lastSyncResult).toBe('updated');
    expect(updateCall[1].commitSha).toBe('sha-new');
    expect(updateCall[1].lastSyncCommitSha).toBe('sha-new');

    // AE-01: activity log records the outcome
    expect(persistenceMock.logSyncActivity).toHaveBeenCalledTimes(1);
    const activityCall = persistenceMock.logSyncActivity.mock.calls[0] as [Record<string, unknown>];
    expect(activityCall[0].outcome).toBe('updated');
    expect(activityCall[0].previousCommitSha).toBe('sha-old');
    expect(activityCall[0].currentCommitSha).toBe('sha-new');
  });

  it('re-sync keeps commit SHA unchanged when upstream unchanged (AE-04)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-old',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledTimes(1);

    const updateCall = schemaMock.updateSyncMetadata.mock.calls[0] as [string, Record<string, unknown>];
    expect(updateCall[1].syncStatus).toBe('synced');
    expect(updateCall[1].lastSyncResult).toBe('no-op');
    expect(updateCall[1].commitSha).toBeUndefined();

    expect(persistenceMock.logSyncActivity).toHaveBeenCalledTimes(1);
    const activityCall = persistenceMock.logSyncActivity.mock.calls[0] as [Record<string, unknown>];
    expect(activityCall[0].outcome).toBe('no-op');
  });

  it('status-refresh sets update-available without mutating content or commit (AE-05)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'GET' } as never);

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledTimes(1);

    const updateCall = schemaMock.updateSyncMetadata.mock.calls[0] as [string, Record<string, unknown>];
    expect(updateCall[1].syncStatus).toBe('update-available');
    expect(updateCall[1].lastSyncResult).toBe('no-op');
    expect(updateCall[1].commitSha).toBeUndefined();

    expect(persistenceMock.logSyncActivity).toHaveBeenCalledTimes(1);
    const activityCall = persistenceMock.logSyncActivity.mock.calls[0] as [Record<string, unknown>];
    expect(activityCall[0].outcome).toBe('no-op');
  });

  it('sync read failures return canonical rate-limited class and persist sync-failed (AE-06)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'API rate limit exceeded' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(503);
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledTimes(1);
    const updateCall = schemaMock.updateSyncMetadata.mock.calls[0] as [string, Record<string, unknown>];
    expect(updateCall[1].syncStatus).toBe('sync-failed');
    expect(updateCall[1].lastSyncResult).toBe('failed');
    expect(updateCall[1].lastSyncReason).toBe('GitHub API rate limit');
    const parsed = JSON.parse(result.body) as {
      error: { message: string; code: string; details?: { failureClass?: string; retryCount?: number } };
    };
    expect(parsed.error.code).toBe('CDM_RATE_LIMITED');
    expect(parsed.error.message).toBe('GitHub rate limit reached. Please retry shortly.');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'rate-limited',
      retryCount: 2,
    });

    expect(persistenceMock.logSyncActivity).toHaveBeenCalledTimes(1);
    const activityCall = persistenceMock.logSyncActivity.mock.calls[0] as [Record<string, unknown>];
    expect(activityCall[0].outcome).toBe('failed');
    expect(activityCall[0].reason).toBe('GitHub API rate limit');
  });

  it('rejects malformed CDM source metadata without mutation', async () => {
    sharedMocks.getItem.mockResolvedValue({
      schemaId: 'schema-1',
      format: 'json-schema',
      origin: 'cdm',
      syncStatus: 'synced',
      source: { type: 'upload' },
      updatedAt: '2026-06-03T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
    expect(sharedMocks.updateItem).not.toHaveBeenCalled();
  });

  it('uses read-only GitHub API calls only (AE-09)', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({
          name: 'Encounter.json',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-new',
          download_url: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"type":"object"}'),
      });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      const method = (call[1] as { method?: string } | undefined)?.method;
      expect(method).toBe('GET');
      expect(url).not.toContain('/git/refs');
      expect(url).not.toContain('/git/trees');
      expect(url).not.toContain('message=');
    }
  });

  it('re-sync response includes diffSummary for changed schemas (AE-05)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as Record<string, unknown>;

    expect(parsed.status).toBe('updated');
    expect(parsed.diffSummary).toBeDefined();
    expect(parsed.diffSummary).toHaveProperty('added');
    expect(parsed.diffSummary).toHaveProperty('removed');
    expect(parsed.diffSummary).toHaveProperty('modified');

    // Prior nodes read returns [] (env not configured → caught by getPriorNodes),
    // so all parsed fields appear as "added".
    const summary = parsed.diffSummary as { added: string[]; removed: string[]; modified: string[] };
    expect(Array.isArray(summary.added)).toBe(true);
    expect(summary.removed).toEqual([]);
    expect(summary.modified).toEqual([]);

    expect(schemaMock.updateSyncMetadata).toHaveBeenCalled();
    expect(persistenceMock.logSyncActivity).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'updated', previousCommitSha: 'sha-old', currentCommitSha: 'sha-new' }),
    );
  });

  it('status-refresh read failures also persist sync-failed and return canonical rate-limited class', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'API rate limit exceeded' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'GET' } as never);

    expect(result.statusCode).toBe(503);
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledTimes(1);
    const updateCall = schemaMock.updateSyncMetadata.mock.calls[0] as [string, Record<string, unknown>];
    expect(updateCall[1].syncStatus).toBe('sync-failed');
    expect(updateCall[1].lastSyncResult).toBe('failed');
    expect(updateCall[1].lastSyncReason).toBe('GitHub API rate limit');
    const parsed = JSON.parse(result.body) as {
      error: { code: string; message: string; details?: { failureClass?: string; retryCount?: number } };
    };
    expect(parsed.error.code).toBe('CDM_RATE_LIMITED');
    expect(parsed.error.message).toBe('GitHub rate limit reached. Please retry shortly.');
    expect(parsed.error.details).toMatchObject({
      failureClass: 'rate-limited',
      retryCount: 2,
    });

    expect(persistenceMock.logSyncActivity).toHaveBeenCalledTimes(1);
    const activityCall = persistenceMock.logSyncActivity.mock.calls[0] as [Record<string, unknown>];
    expect(activityCall[0].outcome).toBe('failed');
    expect(activityCall[0].reason).toBe('GitHub API rate limit');
  });

  it('emits terminal sync failure log with class + lineage identifiers for unexpected failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sharedMocks.getItem.mockRejectedValueOnce(new Error('boom'));

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST', headers: { 'x-correlation-id': 'corr-sync-1' } } as never);

    expect(result.statusCode).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(
      '[sync-cdm-schema] terminal-sync-failure',
      expect.objectContaining({
        event: 'cdm-sync-terminal-failure',
        operation: 'sync',
        repo: 'KBXT/KBX-Canonicals',
        path: 'schema-1',
        requestId: 'req-sync-1',
        correlationId: 'corr-sync-1',
        failureClass: 'timeout-transient',
      }),
    );

    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // AE-06 — Dependency resolution / ingestion failure is explicit and safe
  // -----------------------------------------------------------------------

  it('node write failure returns status=failed without persisting commit (AE-06)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    schemaMock.batchWriteSchemaNodes.mockResolvedValueOnce({ written: 1, failed: 5 });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { status: string; reason?: string };

    expect(parsed.status).toBe('failed');
    expect(parsed.reason).toContain('5 nodes failed to write');

    // Commit SHA must NOT be advanced on failure (AE-06: no partial state corruption)
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledWith(
      'schema-1',
      expect.objectContaining({ syncStatus: 'sync-failed', lastSyncResult: 'failed' }),
    );
    expect(schemaMock.updateSchemaStatus).toHaveBeenCalledWith('schema-1', 'error');
    expect(persistenceMock.logSyncActivity).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  it('ingestion exception returns status=failed without persisting commit (AE-06)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    schemaMock.batchWriteSchemaNodes.mockRejectedValueOnce(new Error('DynamoDB write timeout'));

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { status: string; reason?: string };

    expect(parsed.status).toBe('failed');
    expect(parsed.reason).toBe('DynamoDB write timeout');
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledWith(
      'schema-1',
      expect.objectContaining({ syncStatus: 'sync-failed', lastSyncResult: 'failed' }),
    );
    expect(schemaMock.updateSchemaStatus).toHaveBeenCalledWith('schema-1', 'error');
  });

  it('missing state machine ARN for large schema returns status=failed (AE-06)', async () => {
    // Inline threshold is 500, so a schema with 500+ fields routes to SFn.
    schemaMock.getInlineFieldThreshold.mockReturnValueOnce(1);
    delete getEnvStore().INGESTION_STATE_MACHINE_ARN;

    const content = JSON.stringify({
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 2 }, (_, i) => [`field${i}`, { type: 'string' }]),
      ),
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { status: string; reason?: string };
    expect(parsed.status).toBe('failed');
    expect(parsed.reason).toContain('INGESTION_STATE_MACHINE_ARN');
    expect(schemaMock.updateSyncMetadata).toHaveBeenCalledWith(
      'schema-1',
      expect.objectContaining({ syncStatus: 'sync-failed' }),
    );
  });

  // -----------------------------------------------------------------------
  // AE-04/AE-05 — Response payload shape: diffSummary absent from no-op/failed
  // -----------------------------------------------------------------------

  it('no-op response omits diffSummary (AE-04)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-old',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);
    const parsed = JSON.parse(result.body) as { status: string; diffSummary?: unknown };
    expect(parsed.status).toBe('no-op');
    expect(parsed.diffSummary).toBeUndefined();
  });

  it('failed response omits diffSummary (AE-05)', async () => {
    const content = JSON.stringify({ type: 'object', properties: { x: { type: 'string' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    // Parsing will succeed (nodes > 0) but write fails
    schemaMock.batchWriteSchemaNodes.mockReset().mockResolvedValue({ written: 0, failed: 10 });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);
    const parsed = JSON.parse(result.body) as { status: string; diffSummary?: unknown };
    expect(parsed.status).toBe('failed');
    expect(parsed.diffSummary).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // AE-07 — AI retrieval uses refreshed schema nodes after success
  // -----------------------------------------------------------------------

  it('successful re-sync writes refreshed nodes to DynamoDB + OpenSearch (AE-07)', async () => {
    const content = JSON.stringify({
      type: 'object',
      properties: {
        id: { type: 'string' },
        amount: { type: 'number' },
      },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: vi.fn().mockResolvedValue({
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-new',
        content: Buffer.from(content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' }, httpMethod: 'POST' } as never);

    expect(result.statusCode).toBe(200);

    // AE-07: Parsed nodes are written to DynamoDB and indexed in OpenSearch
    expect(schemaMock.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    const writtenNodes = schemaMock.batchWriteSchemaNodes.mock.calls[0]![0] as Array<{ path: string }>;
    const paths = writtenNodes.map((n: { path: string }) => n.path).sort();
    expect(paths).toEqual(['amount', 'id']);

    expect(schemaMock.bulkIndexSchemaNodes).toHaveBeenCalledTimes(1);
    const indexedNodes = schemaMock.bulkIndexSchemaNodes.mock.calls[0]![0] as Array<{ path: string }>;
    const indexedPaths = indexedNodes.map((n: { path: string }) => n.path).sort();
    expect(indexedPaths).toEqual(['amount', 'id']);

    // Processed content is persisted for future diff baseline
    expect(schemaMock.storeProcessedContent).toHaveBeenCalledWith(
      'schema-1',
      expect.objectContaining({ fieldCount: 2 }),
    );

    // Schema status is marked ready
    expect(schemaMock.updateSchemaStatus).toHaveBeenCalledWith(
      'schema-1',
      'ready',
      expect.objectContaining({ fieldCount: 2 }),
    );
  });
});
