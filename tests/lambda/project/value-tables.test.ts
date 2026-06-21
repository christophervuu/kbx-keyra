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
});
