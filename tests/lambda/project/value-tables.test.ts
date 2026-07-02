import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseQueryParam: vi.fn(),
  parseBody: vi.fn(),
  generateRequestId: vi.fn(),
  query: vi.fn(),
  scan: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  notFound: vi.fn(),
  conflict: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
  DynamoServiceError: class MockDynamoServiceError extends Error {
    appError = {
      code: 'SERVICE_UNAVAILABLE',
      message: 'Dynamo unavailable',
      statusCode: 503,
      retryable: true,
      requestId: 'req-dynamo',
    } as const;
  },
  S3ServiceError: class MockS3ServiceError extends Error {
    appError = {
      code: 'SERVICE_UNAVAILABLE',
      message: 'S3 unavailable',
      statusCode: 503,
      retryable: true,
      requestId: 'req-s3',
    } as const;
  },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandlers() {
  return import('../../../src/lambda/project/value-tables.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('project value-table handlers', () => {
  beforeEach(() => {
    vi.resetModules();

    const env = getEnvStore();
    env.VALUE_TABLES_TABLE = 'ValueTables';
    env.VALUE_TABLE_REVISIONS_TABLE = 'ValueTableRevisions';
    env.MAPPINGS_TABLE = 'Mappings';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-123');
    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name) => event.pathParameters?.[name] ?? null);
    sharedMocks.parseQueryParam.mockReset().mockImplementation((event, name) => event.queryStringParameters?.[name] ?? null);
    sharedMocks.parseBody.mockReset().mockImplementation((event) => {
      if (!event.body) return null;
      return JSON.parse(event.body) as Record<string, unknown>;
    });
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.scan.mockReset().mockResolvedValue([]);
    sharedMocks.getItem.mockReset().mockResolvedValue(null);
    sharedMocks.getObject.mockReset().mockResolvedValue(JSON.stringify({ rows: [] }));
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.deleteItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.validationError.mockReset().mockImplementation((message, requestId) => ({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      retryable: false,
      requestId,
    }));
    sharedMocks.notFound.mockReset().mockImplementation((resource, id, requestId) => ({
      code: 'RESOURCE_NOT_FOUND',
      message: `${resource} with id '${id}' not found`,
      statusCode: 404,
      retryable: false,
      requestId,
    }));
    sharedMocks.conflict.mockReset().mockImplementation((message, requestId) => ({
      code: 'CONFLICT',
      message,
      statusCode: 409,
      retryable: false,
      requestId,
    }));
    sharedMocks.internalError.mockReset().mockImplementation((message, requestId) => ({
      code: 'INTERNAL_ERROR',
      message: message ?? 'An unexpected error occurred',
      statusCode: 500,
      retryable: true,
      requestId,
    }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({
      statusCode,
      body: JSON.stringify(body),
    }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
      statusCode,
      body: JSON.stringify({
        error: {
          code,
          message,
          statusCode,
          retryable,
          requestId,
          ...(details !== undefined ? { details } : {}),
        },
      }),
    }));

    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('vt-1'),
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });
  });

  it('creates project value table and revision 1', async () => {
    sharedMocks.query.mockResolvedValueOnce([]);
    const { createProjectValueTableHandler } = await importHandlers();

    const result = await createProjectValueTableHandler({
      body: JSON.stringify({
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        ],
      }),
      pathParameters: { id: 'p-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(2);
    expect(JSON.parse(result.body)).toEqual(expect.objectContaining({
      id: 'vt-1',
      key: 'order-status',
      status: 'active',
      currentRevision: 1,
    }));
  });

  it('create revision is append-only and updates current revision', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 1,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-1/revisions/r2.json',
        contentHash: 'abc',
        createdAt: '2026-06-20T01:00:00.000Z',
      });

    const { createProjectValueTableRevisionHandler } = await importHandlers();
    const result = await createProjectValueTableRevisionHandler({
      body: JSON.stringify({
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rows: [{ id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' }],
      }),
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putItem).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'ValueTableRevisions',
      Item: expect.objectContaining({
        valueTableId: 'vt-1',
        revision: 2,
      }),
    }));
    expect(sharedMocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      ConditionExpression: '#currentRevision = :expectedRevision',
      ExpressionAttributeValues: expect.objectContaining({
        ':expectedRevision': 1,
        ':currentRevision': 2,
      }),
    }));
  });

  it('delete referenced value table returns conflict with usage details', async () => {
    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      projectId: 'p-1',
      key: 'order-status',
      name: 'Order Status',
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      currentRevision: 1,
      currentRowCount: 1,
      status: 'active',
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    });
    sharedMocks.scan.mockResolvedValueOnce([
      {
        mappingId: 'm-1',
        name: 'Map 1',
        revision: 3,
        configS3Key: 'mappings/m-1/config.json',
        updatedAt: '2026-06-20T01:00:00.000Z',
      },
    ]);
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rules: [
        {
          valueTableRef: {
            scope: 'project',
            valueTableId: 'vt-1',
            revision: 1,
            inputSideKey: 'oms',
            outputSideKey: 'cdm',
          },
        },
      ],
    }));
    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      revision: 1,
      directionSupport: { aToB: true, bToA: true },
    });

    const { deleteProjectValueTableHandler } = await importHandlers();
    const result = await deleteProjectValueTableHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(409);
    const payload = JSON.parse(result.body) as { error: { details: { usageCount: number; usage: unknown[] } } };
    expect(payload.error.details.usageCount).toBe(1);
    expect(Array.isArray(payload.error.details.usage)).toBe(true);
    expect(sharedMocks.deleteItem).not.toHaveBeenCalled();
  });

  it('resolve endpoint returns pinned reference with resolved entries', async () => {
    sharedMocks.query.mockResolvedValueOnce([
      {
        valueTableId: 'vt-1',
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ]);
    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      revision: 2,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rowCount: 2,
      directionSupport: { aToB: true, bToA: true },
      rowsS3Key: 'value-tables/vt-1/revisions/r2.json',
      contentHash: 'hash',
      createdAt: '2026-06-20T01:00:00.000Z',
    });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
      ],
    }));

    const { resolveProjectValueTableReferenceHandler } = await importHandlers();
    const result = await resolveProjectValueTableReferenceHandler({
      body: JSON.stringify({
        projectId: 'p-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'oms',
        outputSideKey: 'cdm',
      }),
      pathParameters: { id: 'p-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as { ref: { valueTableId: string; revision: number; resolvedEntries: unknown[] } };
    expect(payload.ref.valueTableId).toBe('vt-1');
    expect(payload.ref.revision).toBe(2);
    expect(payload.ref.resolvedEntries).toHaveLength(2);
  });

  it('resolve endpoint rejects unsupported direction with validation error', async () => {
    sharedMocks.query.mockResolvedValueOnce([
      {
        valueTableId: 'vt-1',
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ]);
    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      revision: 2,
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      rowCount: 2,
      directionSupport: { aToB: true, bToA: false },
      rowsS3Key: 'value-tables/vt-1/revisions/r2.json',
      contentHash: 'hash',
      createdAt: '2026-06-20T01:00:00.000Z',
    });

    const { resolveProjectValueTableReferenceHandler } = await importHandlers();
    const result = await resolveProjectValueTableReferenceHandler({
      body: JSON.stringify({
        projectId: 'p-1',
        tableKey: 'order-status',
        revision: 2,
        inputSideKey: 'cdm',
        outputSideKey: 'oms',
      }),
      pathParameters: { id: 'p-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(400);
    const payload = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.message).toContain('direction is not supported');
  });

  it('archive then create new table with same key is allowed', async () => {
    sharedMocks.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      projectId: 'p-1',
      key: 'order-status',
      name: 'Order Status',
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      currentRevision: 1,
      currentRowCount: 1,
      status: 'active',
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    });

    const { createProjectValueTableHandler, archiveProjectValueTableHandler } = await importHandlers();

    const archiveResult = await archiveProjectValueTableHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {},
    });

    expect(archiveResult.statusCode).toBe(200);

    const createResult = await createProjectValueTableHandler({
      body: JSON.stringify({
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status New',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
      }),
      pathParameters: { id: 'p-1' },
      queryStringParameters: {},
    });

    expect(createResult.statusCode).toBe(201);
    expect(sharedMocks.putItem).toHaveBeenCalled();
  });

  it('lists global value maps from canonical preferred route behavior', async () => {
    sharedMocks.scan.mockResolvedValueOnce([
      {
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        valueTableId: 'vt-project-1',
        projectId: 'p-1',
        scope: 'project',
        key: 'project-only',
        name: 'Project Only',
        sideA: { key: 'a', label: 'A', type: 'string' },
        sideB: { key: 'b', label: 'B', type: 'string' },
        currentRevision: 1,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const { listGlobalValueMapsHandler } = await importHandlers();
    const result = await listGlobalValueMapsHandler({
      body: null,
      pathParameters: {},
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as Array<{ id: string; key: string }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(expect.objectContaining({
      id: 'vt-global-1',
      key: 'order-status',
    }));
  });

  it('creates global value map with immutable revision 1', async () => {
    sharedMocks.scan.mockResolvedValueOnce([]);
    const { createGlobalValueMapHandler } = await importHandlers();

    const result = await createGlobalValueMapHandler({
      body: JSON.stringify({
        key: 'global-order-status',
        name: 'Global Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        ],
      }),
      pathParameters: {},
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(result.body) as { key: string; status: string; currentRevision: number };
    expect(payload).toEqual(expect.objectContaining({
      key: 'global-order-status',
      status: 'active',
      currentRevision: 1,
    }));
  });

  it('lists global value map revisions in descending order', async () => {
    sharedMocks.getItem.mockResolvedValueOnce({
      valueTableId: 'vt-1',
      scope: 'global',
      key: 'global-order-status',
      name: 'Global Order Status',
      sideA: { key: 'oms', label: 'OMS', type: 'string' },
      sideB: { key: 'cdm', label: 'CDM', type: 'string' },
      currentRevision: 2,
      currentRowCount: 2,
      status: 'active',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    sharedMocks.query.mockResolvedValueOnce([
      {
        valueTableId: 'vt-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T01:00:00.000Z',
      },
      {
        valueTableId: 'vt-1',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-1/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const { listValueTableRevisionsHandler } = await importHandlers();
    const result = await listValueTableRevisionsHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as Array<{ revision: number }>;
    expect(payload.map((entry) => entry.revision)).toEqual([2, 1]);
  });

  it('global usage response includes linkedProjects and mappings summary shape', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        scope: 'global',
        key: 'global-order-status',
        name: 'Global Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        revision: 2,
        directionSupport: { aToB: true, bToA: true },
      });
    sharedMocks.scan.mockResolvedValueOnce([
      {
        mappingId: 'm-1',
        name: 'Map 1',
        revision: 3,
        configS3Key: 'mappings/m-1/config.json',
        updatedAt: '2026-07-01T01:00:00.000Z',
      },
    ]);
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rules: [
        {
          valueTableRef: {
            scope: 'project',
            valueTableId: 'vt-1',
            revision: 1,
            inputSideKey: 'oms',
            outputSideKey: 'cdm',
          },
        },
      ],
    }));

    const { listProjectValueTableUsageHandler } = await importHandlers();
    const result = await listProjectValueTableUsageHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as {
      mappings: unknown[];
      linkedProjects: unknown[];
      counts: { mappings: number; linkedProjects: number };
    };
    expect(Array.isArray(payload.mappings)).toBe(true);
    expect(Array.isArray(payload.linkedProjects)).toBe(true);
    expect(payload.counts).toEqual({ mappings: 1, linkedProjects: 0 });
  });

  it('diff endpoint returns full summary and paginated changes', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        projectId: 'p-1',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-1/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-06-20T01:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-06-20T02:00:00.000Z',
      });
    sharedMocks.getObject
      .mockResolvedValueOnce(JSON.stringify({ rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }] }))
      .mockResolvedValueOnce(JSON.stringify({ rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETED' },
      ] }));

    const { getProjectValueTableRevisionDiffHandler } = await importHandlers();
    const result = await getProjectValueTableRevisionDiffHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-1' },
      queryStringParameters: {
        fromRevision: '1',
        toRevision: '2',
        cursor: '0',
        pageSize: '1',
      },
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as {
      summary: { counts: { added: number; removed: number; changed: number; unchanged: number } };
      changes: unknown[];
      pageSize: number;
      nextCursor?: string;
    };
    expect(payload.summary.counts).toEqual({ added: 1, removed: 0, changed: 0, unchanged: 1 });
    expect(payload.pageSize).toBe(1);
    expect(payload.changes).toHaveLength(1);
    expect(payload.nextCursor).toBe('1');
  });

  it('links project to global value map and returns detail', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 2,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      });

    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
      ],
    }));
    sharedMocks.query.mockResolvedValueOnce([]);

    const { linkProjectValueMapHandler } = await importHandlers();
    const result = await linkProjectValueMapHandler({
      body: JSON.stringify({
        valueMapId: 'vt-global-1',
        revision: 2,
      }),
      pathParameters: { projectId: 'p-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as { projectId: string; valueMapId: string; pinnedRevision: number };
    expect(payload).toEqual(expect.objectContaining({
      projectId: 'p-1',
      valueMapId: 'vt-global-1',
      pinnedRevision: 2,
    }));
  });

  it('review-update returns orphan conflicts for removed rows', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 1,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      });

    sharedMocks.getObject
      .mockResolvedValueOnce(JSON.stringify({
        rows: [{ id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
          { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
        ],
      }));

    const { reviewProjectValueMapUpdateHandler } = await importHandlers();
    const result = await reviewProjectValueMapUpdateHandler({
      body: JSON.stringify({ candidateRevision: 2 }),
      pathParameters: { projectId: 'p-1', valueTableId: 'vt-global-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as { canAccept: boolean; orphanedRowIds: string[] };
    expect(payload.canAccept).toBe(false);
    expect(payload.orphanedRowIds).toContain('r1');
  });

  it('overlay update advances overlay revision and marks dependency needs-review', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 1,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 1,
        overlayRevision: 1,
        dependencyState: 'needs-review',
        updateAvailable: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 1,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      });
    sharedMocks.query.mockResolvedValueOnce([
      {
        valueTableId: 'link#p-1#vt-global-1',
        revision: 1,
        entityType: 'value-map-overlay-revision',
        operationCount: 1,
        operations: [
          { operationId: 'op-1', type: 'exclude', targetRowId: 'r1' },
        ],
        contentHash: 'overlay-hash',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
      ],
    }));

    const { updateProjectValueMapOverlayHandler } = await importHandlers();
    const result = await updateProjectValueMapOverlayHandler({
      body: JSON.stringify({
        operations: [
          { operationId: 'op-1', type: 'exclude', targetRowId: 'r1' },
        ],
        expectedOverlayRevision: 0,
      }),
      pathParameters: { projectId: 'p-1', valueTableId: 'vt-global-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({
        ':overlayRevision': 1,
        ':dependencyState': 'needs-review',
      }),
    }));
    const payload = JSON.parse(result.body) as { dependencyState: string; overlayRevision: number };
    expect(payload.dependencyState).toBe('needs-review');
    expect(payload.overlayRevision).toBe(1);
  });

  it('portable import choose-global links selected global revision when behavior-equivalent', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valueTableId: 'vm-selected',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vm-selected',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vm-selected/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valueTableId: 'link#p-2#vm-selected',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-2',
        globalValueMapId: 'vm-selected',
        pinnedRevision: 1,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vm-selected',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vm-selected',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vm-selected/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
    }));
    sharedMocks.query.mockResolvedValueOnce([]);

    const { importProjectValueTableCsvHandler } = await importHandlers();
    const result = await importProjectValueTableCsvHandler({
      body: JSON.stringify({
        portablePayload: {
          format: 'value-map-portable-v1',
          exportedAt: '2026-07-02T00:00:00.000Z',
          valueMap: {
            valueMapId: 'vm-source',
            key: 'order-status',
            name: 'Order Status',
            sideA: { key: 'oms', label: 'OMS', type: 'string' },
            sideB: { key: 'cdm', label: 'CDM', type: 'string' },
            scope: 'global',
            pinnedGlobal: {
              valueMapId: 'vm-missing',
              revision: 7,
              key: 'order-status',
              name: 'Order Status',
            },
            overlayRevision: 0,
            overlayOperations: [],
            effectiveRows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
          },
          usageBindings: [],
        },
        resolution: {
          action: 'choose-global',
          selectedValueMapId: 'vm-selected',
          selectedRevision: 1,
        },
      }),
      pathParameters: { id: 'p-2' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as { importStatus: string; detail?: { pinnedRevision: number } };
    expect(payload.importStatus).toBe('linked-via-resolution');
    expect(payload.detail?.pinnedRevision).toBe(1);
  });

  it('accept-update blocks unresolved orphan conflicts', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 1,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 1,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 1,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r1.json',
        contentHash: 'h1',
        createdAt: '2026-07-01T00:00:00.000Z',
      });

    sharedMocks.getObject
      .mockResolvedValueOnce(JSON.stringify({
        rows: [{ id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' }],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
          { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
        ],
      }));

    const { acceptProjectValueMapUpdateHandler } = await importHandlers();
    const result = await acceptProjectValueMapUpdateHandler({
      body: JSON.stringify({ candidateRevision: 2 }),
      pathParameters: { projectId: 'p-1', valueTableId: 'vt-global-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(409);
    const payload = JSON.parse(result.body) as { error: { message: string; details: { unresolvedOrphans: string[] } } };
    expect(payload.error.message).toContain('unresolved conflicts/orphans');
    expect(payload.error.details.unresolvedOrphans).toContain('r1');
  });

  it('promote project value map creates global revision 1', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-project-1',
        projectId: 'p-1',
        scope: 'project',
        key: 'order-status-project',
        name: 'Order Status (Project)',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 2,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-project-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-project-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
      ],
    }));
    sharedMocks.scan.mockResolvedValueOnce([]);

    const { promoteProjectValueMapHandler } = await importHandlers();
    const result = await promoteProjectValueMapHandler({
      body: JSON.stringify({
        key: 'order-status-global',
        name: 'Order Status Global',
        relink: false,
      }),
      pathParameters: { projectId: 'p-1', valueTableId: 'vt-project-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as { promoted: { key: string; currentRevision: number } };
    expect(payload.promoted).toEqual(expect.objectContaining({
      key: 'order-status-global',
      currentRevision: 1,
    }));
  });

  it('portable export includes pinned global revision and overlay metadata', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 2,
        overlayRevision: 1,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 2,
        overlayRevision: 1,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        defaultMatchMode: 'exact',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        defaultMatchMode: 'exact',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rows: [
        { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
        { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
      ],
    }));
    sharedMocks.query.mockResolvedValueOnce([
      {
        valueTableId: 'link#p-1#vt-global-1',
        revision: 1,
        entityType: 'value-map-overlay-revision',
        operationCount: 1,
        operations: [
          { operationId: 'op-1', type: 'exclude', targetRowId: 'r2' },
        ],
        contentHash: 'overlay-hash',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    sharedMocks.scan.mockResolvedValueOnce([]);

    const { exportProjectValueTableCsvHandler } = await importHandlers();
    const result = await exportProjectValueTableCsvHandler({
      body: null,
      pathParameters: { valueTableId: 'vt-global-1' },
      queryStringParameters: { portable: 'true', projectId: 'p-1' },
    });

    expect(result.statusCode).toBe(200);
    const payload = JSON.parse(result.body) as {
      format: string;
      valueMap: { pinnedGlobal?: { valueMapId: string; revision: number }; overlayRevision: number };
    };
    expect(payload.format).toBe('value-map-portable-v1');
    expect(payload.valueMap.pinnedGlobal).toEqual(expect.objectContaining({
      valueMapId: 'vt-global-1',
      revision: 2,
    }));
    expect(payload.valueMap.overlayRevision).toBe(1);
  });

  it('portable import requires explicit resolution when pinned global revision is unavailable', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { importProjectValueTableCsvHandler } = await importHandlers();
    const result = await importProjectValueTableCsvHandler({
      body: JSON.stringify({
        portablePayload: {
          format: 'value-map-portable-v1',
          exportedAt: '2026-07-02T00:00:00.000Z',
          valueMap: {
            valueMapId: 'vm-source',
            key: 'order-status',
            name: 'Order Status',
            sideA: { key: 'oms', label: 'OMS', type: 'string' },
            sideB: { key: 'cdm', label: 'CDM', type: 'string' },
            scope: 'global',
            pinnedGlobal: {
              valueMapId: 'vm-missing',
              revision: 7,
              key: 'order-status',
              name: 'Order Status',
            },
            overlayRevision: 0,
            overlayOperations: [],
            effectiveRows: [{ id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' }],
          },
          usageBindings: [],
        },
      }),
      pathParameters: { id: 'p-2' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(409);
    const payload = JSON.parse(result.body) as { error: { details: { importStatus: string; options: string[] } } };
    expect(payload.error.details.importStatus).toBe('requires-resolution');
    expect(payload.error.details.options).toEqual(['project-copy', 'choose-global', 'cancel']);
  });

  it('portable import with project-copy creates detached project map from effective rows', async () => {
    sharedMocks.query.mockResolvedValueOnce([]);

    const { importProjectValueTableCsvHandler } = await importHandlers();
    const result = await importProjectValueTableCsvHandler({
      body: JSON.stringify({
        portablePayload: {
          format: 'value-map-portable-v1',
          exportedAt: '2026-07-02T00:00:00.000Z',
          valueMap: {
            valueMapId: 'vm-source',
            key: 'order-status',
            name: 'Order Status',
            sideA: { key: 'oms', label: 'OMS', type: 'string' },
            sideB: { key: 'cdm', label: 'CDM', type: 'string' },
            scope: 'project',
            sourceProjectId: 'p-1',
            overlayRevision: 0,
            overlayOperations: [],
            effectiveRows: [
              { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
              { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
            ],
          },
          usageBindings: [],
        },
        resolution: { action: 'project-copy' },
      }),
      pathParameters: { id: 'p-2' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as { importStatus: string; table: { key: string } };
    expect(payload.importStatus).toBe('detached-project-copy');
    expect(payload.table.key).toContain('order-status');
  });

  it('duplicate preserve-link mode keeps pinned revision and overlay metadata', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        projectId: 'p-1',
        key: 'order-status-global',
        name: 'Order Status Global',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 2,
        overlayRevision: 1,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 2,
        overlayRevision: 1,
        dependencyState: 'current',
        updateAvailable: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 3,
        currentRowCount: 2,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 2,
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        rowCount: 2,
        directionSupport: { aToB: true, bToA: true },
        rowsS3Key: 'value-tables/vt-global-1/revisions/r2.json',
        contentHash: 'h2',
        createdAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce(null);
    sharedMocks.getObject
      .mockResolvedValueOnce(JSON.stringify({
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
          { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
        ],
      }))
      .mockResolvedValueOnce(JSON.stringify({
        rows: [
          { id: 'r1', sideAValue: 'confirmed', sideBValue: 'OPEN' },
          { id: 'r2', sideAValue: 'shipped', sideBValue: 'COMPLETE' },
        ],
      }));
    sharedMocks.query
      .mockResolvedValueOnce([
        {
          valueTableId: 'link#p-1#vt-global-1',
          revision: 1,
          entityType: 'value-map-overlay-revision',
          operationCount: 1,
          operations: [
            { operationId: 'op-1', type: 'exclude', targetRowId: 'r2' },
          ],
          contentHash: 'overlay-hash',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          valueTableId: 'link#p-1#vt-global-1',
          revision: 1,
          entityType: 'value-map-overlay-revision',
          operationCount: 1,
          operations: [
            { operationId: 'op-1', type: 'exclude', targetRowId: 'r2' },
          ],
          contentHash: 'overlay-hash',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);

    const { duplicateProjectValueTableHandler } = await importHandlers();
    const result = await duplicateProjectValueTableHandler({
      body: JSON.stringify({
        projectId: 'p-2',
        name: 'Linked Copy',
        mode: 'preserve-link',
      }),
      pathParameters: { valueTableId: 'vt-global-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(201);
    const payload = JSON.parse(result.body) as { mode: string };
    expect(payload.mode).toBe('preserve-link');
    expect(sharedMocks.putItem).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'ValueTableRevisions',
      Item: expect.objectContaining({
        entityType: 'value-map-project-link',
        pinnedRevision: 2,
        overlayRevision: 1,
      }),
    }));
  });

  it('unlink blocks when mappings reference linked value map', async () => {
    sharedMocks.getItem
      .mockResolvedValueOnce({
        valueTableId: 'link#p-1#vt-global-1',
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: 'p-1',
        globalValueMapId: 'vt-global-1',
        pinnedRevision: 1,
        overlayRevision: 0,
        dependencyState: 'current',
        updateAvailable: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        scope: 'global',
        key: 'order-status',
        name: 'Order Status',
        sideA: { key: 'oms', label: 'OMS', type: 'string' },
        sideB: { key: 'cdm', label: 'CDM', type: 'string' },
        currentRevision: 1,
        currentRowCount: 1,
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        valueTableId: 'vt-global-1',
        revision: 1,
        directionSupport: { aToB: true, bToA: true },
      });

    sharedMocks.scan.mockResolvedValueOnce([
      {
        mappingId: 'm-1',
        name: 'Map 1',
        revision: 3,
        configS3Key: 'mappings/m-1/config.json',
        updatedAt: '2026-07-01T01:00:00.000Z',
      },
    ]);
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      rules: [
        {
          valueTableRef: {
            scope: 'project',
            valueTableId: 'vt-global-1',
            revision: 1,
            inputSideKey: 'oms',
            outputSideKey: 'cdm',
          },
        },
      ],
    }));

    const { unlinkProjectValueMapHandler } = await importHandlers();
    const result = await unlinkProjectValueMapHandler({
      body: null,
      pathParameters: { projectId: 'p-1', valueTableId: 'vt-global-1' },
      queryStringParameters: {},
    });

    expect(result.statusCode).toBe(409);
    const payload = JSON.parse(result.body) as { error: { details: { usageCount: number } } };
    expect(payload.error.details.usageCount).toBe(1);
    expect(sharedMocks.deleteItem).not.toHaveBeenCalled();
  });
});
