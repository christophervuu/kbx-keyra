import { beforeEach, describe, expect, it, vi } from 'vitest';

const validateMock = vi.hoisted(() => vi.fn());

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  getItem: vi.fn(),
  getObject: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/engine/index.js', () => ({
  validate: validateMock,
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/mapping/create-mapping.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('create-mapping handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.MAPPINGS_TABLE = 'Mappings';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';

    sharedMocks.parseBody.mockReset().mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      rules: [],
    });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.getItem.mockReset().mockResolvedValue(null);
    sharedMocks.getObject.mockReset().mockResolvedValue('');
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
    validateMock.mockReset().mockReturnValue({ diagnostics: [], coverage: { percentage: 0 } });
  });

  it('valid input returns 201 metadata with version 1', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      businessContext: 'Align invoice source payload to shipment processing shape.',
      engineVersion: '1.0.0',
      rules: [],
    });
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as {
      version: number;
      ruleCount: number;
      status: string;
      mappingId: string;
      businessContext?: string;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.ruleCount).toBe(0);
    expect(parsed.status).toBe('draft');
    expect(parsed.businessContext).toBe('Align invoice source payload to shipment processing shape.');
    expect(parsed.mappingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(sharedMocks.putObject).toHaveBeenCalledTimes(1);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
  });

  it('omitted businessContext remains backward compatible', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { businessContext?: string };
    expect(parsed.businessContext).toBeUndefined();
  });

  it('rejects source schema ref without immutable pin bundle', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      sourceSchemaRef: { schemaId: 'schema-source', type: 'local' },
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
  });

  it('accepts additive editorPreferences in config payload', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      config: {
        editorPreferences: {
          defaultSelectedSampleId: 'sample-1',
        },
      },
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"editorPreferences":{"defaultSelectedSampleId":"sample-1"}'),
    }));
  });

  it('persists canonical enrichmentSources and unions compatibility externalSources', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
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
      config: {
        externalSources: ['legacyAlias'],
      },
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"enrichmentSources":[{"alias":"customerProfile","schemaId":"schema-customer","schemaVersion":1,"schemaVersionId":"sv-customer-1","contentHash":"hash-customer-1","required":true}]'),
    }));
    expect(sharedMocks.putObject).toHaveBeenCalledWith(expect.objectContaining({
      Body: expect.stringContaining('"externalSources":["customerProfile","legacyAlias"]'),
    }));
    expect(sharedMocks.putItem).toHaveBeenCalledWith(expect.objectContaining({
      Item: expect.objectContaining({
        enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', schemaVersion: 1, schemaVersionId: 'sv-customer-1', contentHash: 'hash-customer-1', required: true }],
      }),
    }));
  });

  it('normalizes legacy-only externalSources to schema-less enrichment aliases', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      config: {
        externalSources: ['legacyAlias'],
      },
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    expect(sharedMocks.putItem).toHaveBeenCalledWith(expect.objectContaining({
      Item: expect.objectContaining({
        enrichmentSources: [{ alias: 'legacyAlias', required: false }],
      }),
    }));
  });

  it('rejects duplicate enrichment aliases with validation error', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      enrichmentSources: [
        { alias: 'dup', schemaId: 'schema-a', schemaVersion: 1, schemaVersionId: 'sv-a-1', contentHash: 'hash-a-1' },
        { alias: 'dup', schemaId: 'schema-b', schemaVersion: 1, schemaVersionId: 'sv-b-1', contentHash: 'hash-b-1' },
      ],
      rules: [],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('loads target schema content and passes it to validate for coverage derivation', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
      rules: [{ target: 'Invoice.Id', type: 'string', expression: 'source("id")' }],
    });
    sharedMocks.getItem.mockResolvedValue({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValue('{"type":"object"}');
    validateMock.mockReturnValue({ diagnostics: [], coverage: { percentage: 50 } });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
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

  it('passes project valueTableRef metadata through validation config', async () => {
    sharedMocks.parseBody.mockReturnValue({
      projectId: 'proj-1',
      name: 'Invoice Map',
      engineVersion: '1.0.0',
      targetSchemaRef: {
        schemaId: 'schema-1',
        type: 'local',
        schemaVersion: 1,
        schemaVersionId: 'sv-target-1',
        contentHash: 'hash-target-1',
      },
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
    sharedMocks.getItem.mockResolvedValue({ schemaId: 'schema-1', format: 'json-schema' });
    sharedMocks.getObject.mockResolvedValue('{"type":"object"}');

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
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

  it('missing projectId returns 400', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: projectId', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('missing name returns 400', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: name', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });
});
