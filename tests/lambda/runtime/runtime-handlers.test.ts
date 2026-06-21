import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  parsePathParam: vi.fn(),
  generateRequestId: vi.fn(),
  getObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
    SNAPSHOT_INTEGRITY_ERROR: 'SNAPSHOT_INTEGRITY_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
}));

const deploymentsMocks = vi.hoisted(() => ({
  getActiveSnapshot: vi.fn(),
  listDeploymentHistory: vi.fn(),
}));

const valueTablesMocks = vi.hoisted(() => ({
  resolveReference: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const s3ClientMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/deployments.js', () => deploymentsMocks);
vi.mock('../../../src/lib/persistence/value-tables.js', () => ({
  valueTables: valueTablesMocks,
}));
vi.mock('../../../src/engine/index.js', () => engineMocks);
vi.mock('../../../src/lib/persistence/clients.js', () => ({
  s3Client: s3ClientMocks,
}));

async function importExecuteHandler() {
  return import('../../../src/lambda/runtime/execute.js');
}

async function importStatusHandler() {
  return import('../../../src/lambda/runtime/status.js');
}

describe('runtime execute/status handlers', () => {
  beforeEach(() => {
    vi.resetModules();

    sharedMocks.parseBody.mockReset().mockReturnValue({ mappingId: 'map-1', sourceData: { amount: 12 } });
    sharedMocks.parsePathParam.mockReset().mockImplementation((event, name: string) => event.pathParameters?.[name] ?? null);
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-123');
    sharedMocks.getObject.mockReset().mockResolvedValue(
      JSON.stringify({
        mappingConfig: {
          name: 'Map One',
          version: 3,
          engineVersion: '1.0.0',
          config: {},
          rules: [{ target: 'Amount', type: 'number', expression: 'source("amount")' }],
        },
      }),
    );
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId) => ({
      statusCode,
      body: JSON.stringify({
        error: {
          code,
          message,
          statusCode,
          retryable,
          ...(requestId ? { requestId } : {}),
        },
      }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });

    deploymentsMocks.getActiveSnapshot.mockReset().mockResolvedValue({
      mappingId: 'map-1',
      activeSnapshotId: 'snapshot-1',
      snapshotHash: 'abc',
      activatedAt: '2026-06-04T00:00:00.000Z',
      activatedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 3,
    });
    deploymentsMocks.listDeploymentHistory.mockReset().mockResolvedValue([]);

    engineMocks.execute.mockReset().mockReturnValue({
      output: { Amount: 12 },
      diagnostics: [],
      stats: { rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0, durationMs: 1 },
    });

    s3ClientMocks.send.mockReset().mockResolvedValue({});
  });

  it('executes using runtime active snapshot and local snapshot object only', async () => {
    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    expect(deploymentsMocks.getActiveSnapshot).toHaveBeenCalledWith('map-1');
    expect(sharedMocks.getObject).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: 'runtime/snapshots/map-1/snapshot-1.json',
      }),
    );
    expect(engineMocks.execute).toHaveBeenCalledWith(
      expect.any(Object),
      { amount: 12 },
      null,
      null,
      { externalSources: {} },
    );
  });

  it('passes externalSources to engine execution options', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      sourceData: { amount: 12 },
      externalSources: { customerProfile: { customerId: 'c-1' } },
    });

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    expect(engineMocks.execute).toHaveBeenCalledWith(
      expect.any(Object),
      { amount: 12 },
      null,
      null,
      { externalSources: { customerProfile: { customerId: 'c-1' } } },
    );
  });

  it('fails preflight when required enrichment payload is missing', async () => {
    sharedMocks.getObject.mockResolvedValueOnce(
      JSON.stringify({
        mappingConfig: {
          name: 'Map One',
          version: 3,
          engineVersion: '1.0.0',
          enrichmentSources: [{ alias: 'customerProfile', schemaId: 'schema-customer', required: true }],
          config: {},
          rules: [{ target: 'Amount', type: 'number', expression: 'source("amount")' }],
        },
      }),
    );

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(400);
    const parsed = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
    expect(parsed.error.message).toContain('Missing required enrichment payload');
    expect(parsed.error.message).toContain('customerProfile');
    expect(engineMocks.execute).not.toHaveBeenCalled();
  });

  it('returns deterministic not-deployed error when active snapshot is missing', async () => {
    deploymentsMocks.getActiveSnapshot.mockResolvedValueOnce(null);

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('SOURCE_NOT_FOUND');
    expect(sharedMocks.getObject).not.toHaveBeenCalled();
    expect(engineMocks.execute).not.toHaveBeenCalled();
  });

  it('fails with snapshot integrity error when project value-table resolved entries are missing', async () => {
    sharedMocks.getObject.mockResolvedValueOnce(
      JSON.stringify({
        mappingConfig: {
          name: 'Map One',
          version: 3,
          engineVersion: '1.0.0',
          config: {},
          rules: [{
            target: 'Amount',
            type: 'number',
            expression: 'valueMap(source("status"), valueTable("order-status", "code", "label"), "UNKNOWN")',
            valueTableRef: {
              scope: 'project',
              valueTableId: 'vt-1',
              tableKey: 'order-status',
              revision: 2,
              inputSideKey: 'code',
              outputSideKey: 'label',
              inputType: 'string',
              outputType: 'string',
            },
          }],
        },
      }),
    );

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(500);
    const parsed = JSON.parse(result.body) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('SNAPSHOT_INTEGRITY_ERROR');
    expect(parsed.error.message).toContain('missing resolved project value-table entries');
    expect(engineMocks.execute).not.toHaveBeenCalled();
  });

  it('runtime execute never invokes value table persistence lookups', async () => {
    sharedMocks.getObject.mockResolvedValueOnce(
      JSON.stringify({
        mappingConfig: {
          name: 'Map One',
          version: 3,
          engineVersion: '1.0.0',
          config: {},
          rules: [{
            target: 'Amount',
            type: 'number',
            expression: 'valueMap(source("status"), valueTable("order-status", "code", "label"), "UNKNOWN")',
            valueTableRef: {
              scope: 'project',
              valueTableId: 'vt-1',
              tableKey: 'order-status',
              revision: 2,
              inputSideKey: 'code',
              outputSideKey: 'label',
              inputType: 'string',
              outputType: 'string',
              resolvedEntries: [{ in: 'A', out: 'OPEN', rowId: 'r1' }],
            },
          }],
        },
      }),
    );

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    expect(valueTablesMocks.resolveReference).not.toHaveBeenCalled();
  });

  it('returns status not-deployed shape when pointer is missing', async () => {
    deploymentsMocks.getActiveSnapshot.mockResolvedValueOnce(null);
    deploymentsMocks.listDeploymentHistory.mockResolvedValueOnce([
      {
        mappingId: 'map-1',
        eventAt: '2026-06-04T00:00:00.000Z',
        eventType: 'deploy',
        snapshotId: 'snapshot-0',
      },
    ]);

    const { handler } = await importStatusHandler();
    const result = await handler({ body: null, httpMethod: 'GET', pathParameters: { mappingId: 'map-1' } });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(
      expect.objectContaining({
        mappingId: 'map-1',
        status: 'not-deployed',
        activeSnapshot: null,
      }),
    );
  });

  it('returns health readiness payload', async () => {
    const { handler } = await importStatusHandler();
    const result = await handler({ body: null, httpMethod: 'GET', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(
      expect.objectContaining({
        service: 'keyra-runtime',
        status: 'ready',
        readiness: {
          dynamo: true,
          s3: true,
        },
      }),
    );
  });
});
