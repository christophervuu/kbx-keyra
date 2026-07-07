import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validateMock = vi.hoisted(() => vi.fn());

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  query: vi.fn(),
  putObject: vi.fn(),
  updateItem: vi.fn(),
  conflict: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  notFound: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/engine/index.js', () => ({
  validate: validateMock,
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/update-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('update-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      },
    });

    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.MAPPING_REVISIONS_TABLE = 'MappingRevisions';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parsePathParam.mockReset().mockReturnValue('map-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.getItem.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 1,
      revision: 1,
      status: 'draft',
      ruleCount: 0,
      coverage: 0,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.getObject.mockReset().mockResolvedValue('');
    sharedMocks.query.mockReset().mockResolvedValue([]);
    sharedMocks.updateItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.conflict.mockReset().mockImplementation((message) => ({ code: 'CONFLICT', message, statusCode: 409, retryable: false }));
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.notFound.mockReset().mockReturnValue({ code: 'RESOURCE_NOT_FOUND', message: "Mapping with id 'map-1' not found", statusCode: 404, retryable: false });
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    validateMock.mockReset().mockReturnValue({ diagnostics: [], coverage: { percentage: 50 } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matching expectedRevision returns 200 with incremented revision and noChange=false', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { revision: number; noChange: boolean; ruleCount: number; status: string; coverage: number };
    expect(parsed.revision).toBe(2);
    expect(parsed.noChange).toBe(false);
    expect(parsed.ruleCount).toBe(1);
    expect(parsed.status).toBe('ready');
    expect(parsed.coverage).toBe(50);
  });

  it('persists optional businessContext and additive editorPreferences on update payload', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      businessContext: 'Map invoice totals and currency into order payload.',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      config: {
        editorPreferences: {
          defaultSelectedSampleId: 'sample-2',
        },
      },
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"editorPreferences":{"defaultSelectedSampleId":"sample-2"}'),
    }));

    expect(sharedMocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({
        ':businessContext': 'Map invoice totals and currency into order payload.',
      }),
    }));
  });

  it('loads target schema content and passes it to validate for coverage derivation', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: {},
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 1,
        revision: 1,
        status: 'draft',
        ruleCount: 0,
        coverage: 0,
        configS3Key: 'mappings/map-1/config.json',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValue('{"type":"object"}');

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.getItem).toHaveBeenCalledWith({
      TableName: 'Schemas',
      Key: { schemaId: 'schema-1' },
    });
    expect(sharedMocks.getObject).toHaveBeenCalledWith({
      Bucket: 'Content',
      Key: 'schemas/schema-1/content.json',
    });
    expect(validateMock).toHaveBeenCalledTimes(1);
    expect(validateMock.mock.calls[0]?.[2]).toEqual({ type: 'object' });
  });

  it('normalizes sample-shaped target schema content to json-schema before validation', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: {},
      rules: [{ target: 'financial.totalAmount', type: 'number', expression: 'cast(source("payment.total"), "number")' }],
    });
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 1,
        revision: 1,
        status: 'has-errors',
        ruleCount: 0,
        coverage: 0,
        configS3Key: 'mappings/map-1/config.json',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject
      .mockResolvedValueOnce(JSON.stringify({
        financial: {
          totalAmount: 148.47,
        },
      }))
      .mockResolvedValueOnce(JSON.stringify({
        financial: {
          totalAmount: 148.47,
        },
      }));
    validateMock.mockReturnValue({ diagnostics: [], coverage: { percentage: 100 } });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(validateMock).toHaveBeenCalledTimes(1);
    expect(validateMock.mock.calls[0]?.[2]).toEqual({
      type: 'object',
      properties: {
        financial: {
          type: 'object',
          properties: {
            totalAmount: { type: 'number' },
          },
        },
      },
    });
  });

  it('normalizes incoming rule types against inferred target payload shape before persistence', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: {},
      rules: [
        { target: 'financial.totalAmount', type: 'string', expression: 'cast(source("payment.total"), "number")' },
      ],
    });
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 1,
        revision: 1,
        status: 'draft',
        ruleCount: 0,
        coverage: 0,
        configS3Key: 'mappings/map-1/config.json',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      financial: {
        totalAmount: 148.47,
      },
    }));

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"target":"financial.totalAmount","type":"number"'),
    }));
  });

  it('normalizes rule type when target path casing differs from schema payload casing', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: {},
      rules: [
        { target: 'financial.TotalAmount', type: 'string', expression: 'cast(source("payment.total"), "number")' },
      ],
    });
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 1,
        revision: 1,
        status: 'draft',
        ruleCount: 0,
        coverage: 0,
        configS3Key: 'mappings/map-1/config.json',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({
      financial: {
        totalAmount: 148.47,
      },
    }));

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"target":"financial.TotalAmount","type":"number"'),
    }));
  });

  it('missing mapping returns 404', async () => {
    sharedMocks.getItem.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(404);
  });

  it('stale expectedRevision returns 409 conflict', async () => {
    sharedMocks.parseBody.mockReturnValue({ projectId: 'proj-1', name: 'Invoice Map Updated', expectedRevision: 0, rules: [] });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(409);
    const parsed = JSON.parse(result.body) as { error: { message: string } };
    expect(parsed.error.message).toContain('Revision mismatch: expected 1, got 0. Reload and retry.');
  });

  it('unchanged config hash returns noChange=true without writes', async () => {
    sharedMocks.query.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        revision: 1,
        configHash: '0'.repeat(64),
      },
    ]);
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      config: {},
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { noChange: boolean; revision: number };
    expect(parsed.noChange).toBe(true);
    expect(parsed.revision).toBe(1);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
  });

  it('unchanged config hash refreshes stale derived status metadata', async () => {
    sharedMocks.getItem.mockResolvedValueOnce({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Invoice Map',
      version: 1,
      revision: 1,
      status: 'has-errors',
      ruleCount: 99,
      coverage: 0,
      configHash: 'old-hash',
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
    sharedMocks.query.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        revision: 1,
        configHash: '0'.repeat(64),
      },
    ]);
    validateMock.mockReturnValue({
      diagnostics: [
        {
          code: 'KEYRA-W002',
          severity: 'warning',
          message: 'Source path resolved to null at runtime',
        },
      ],
      coverage: { percentage: 100 },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as { noChange: boolean; revision: number };
    expect(parsed.noChange).toBe(true);
    expect(parsed.revision).toBe(1);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();

    expect(sharedMocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      TableName: 'Mappings',
      Key: { mappingId: 'map-1' },
      ExpressionAttributeValues: expect.objectContaining({
        ':status': 'ready',
        ':ruleCount': 1,
        ':coverage': 100,
      }),
    }));
  });

  it('persists enrichmentSources and compatibility externalSources on update', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      config: {
        externalSources: ['legacyAlias'],
      },
      enrichmentSources: [
        {
          alias: 'customerProfile',
          schemaId: 'schema-customer',
          schemaVersion: 1,
          schemaVersionId: 'sv-customer-1',
          contentHash: 'hash-customer-1',
          required: true,
        },
      ],
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"externalSources":["customerProfile","legacyAlias"]'),
    }));
    expect(sharedMocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({
        ':enrichmentSources': [{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1, schemaVersionId: 'sv-customer-1', contentHash: 'hash-customer-1', required: true }],
      }),
    }));
  });

  it('rejects enrichmentSources entries missing schemaId', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1 }],
      config: {},
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(400);
  });

  it('passes project valueTableRef metadata through validation config to avoid false KEYRA-E062', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      config: {},
      rules: [
        {
          target: 'transaction.status',
          type: 'string',
          expression: 'valueMap(source("status"), valueTable("exercise-1-table", "side-a", "side-b"), "")',
          valueTableRef: {
            scope: 'project',
            valueTableId: 'table-1',
            tableKey: 'exercise-1-table',
            revision: 1,
            inputSideKey: 'side-a',
            outputSideKey: 'side-b',
            inputType: 'string',
            outputType: 'string',
            resolvedEntries: [
              { in: 'confirmed', out: 'OPEN', rowId: 'row-1' },
            ],
          },
          noMatchBehavior: {
            mode: 'fallback_value',
            fallbackValue: '',
          },
        },
      ],
    });
    sharedMocks.getItem
      .mockResolvedValueOnce({
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Invoice Map',
        version: 1,
        revision: 1,
        status: 'has-errors',
        ruleCount: 0,
        coverage: 0,
        configS3Key: 'mappings/map-1/config.json',
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValueOnce('{"type":"object"}');

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(validateMock).toHaveBeenCalledTimes(1);
    const engineConfig = validateMock.mock.calls[0]?.[0] as {
      rules: Array<{
        valueTableRef?: { tableKey?: string; revision?: number; resolvedEntries?: unknown[] };
        noMatchBehavior?: { mode?: string; fallbackValue?: string };
      }>;
    };
    expect(engineConfig.rules[0]?.valueTableRef).toEqual(expect.objectContaining({
      tableKey: 'exercise-1-table',
      revision: 1,
    }));
    expect(engineConfig.rules[0]?.valueTableRef?.resolvedEntries).toEqual([
      { in: 'confirmed', out: 'OPEN', rowId: 'row-1' },
    ]);
    expect(engineConfig.rules[0]?.noMatchBehavior).toEqual({
      mode: 'fallback_value',
      fallbackValue: '',
    });
  });

  it('rejects source schema ref updates without immutable pin bundle', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map Updated',
      expectedRevision: 1,
      sourceSchemaRef: { schemaId: 'schema-source', type: 'local' },
      config: {},
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}', pathParameters: { id: 'map-1' } });

    expect(result.statusCode).toBe(400);
    expect(sharedMocks.putObject).not.toHaveBeenCalled();
  });
});
