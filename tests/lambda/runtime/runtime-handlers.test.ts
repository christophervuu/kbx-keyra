import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execute as executeEngine } from '../../../src/engine/execute.js';
import { registerAllFunctions } from '../../../src/engine/functions/index.js';
import { defaultRegistry, hasFunction } from '../../../src/engine/registry/function-registry.js';

const OBJECT_FIELDS_PRIMARY_EXPRESSION =
  'map(filter(map(array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"), {"day": item(""), "value": get(source("DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day"), "isOpen": item("value.IsOpen"), "beginTime": item("value.BeginTime")})';

const OBJECT_FIELDS_ENRICHMENT_EXPRESSION =
  'map(filter(map(array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"), {"day": item(""), "value": get(get(external("hours"), "DeliveryWeeklyOperation"), item(""))}), not(isNull(item("value")))), {"operationDayValue": item("day"), "isOpen": item("value.IsOpen"), "beginTime": item("value.BeginTime")})';

const WEEKLY_OBJECT = {
  Sunday: { BeginTime: '09:00', IsOpen: true },
  Monday: { BeginTime: '10:00', IsOpen: false },
  Tuesday: { BeginTime: '11:00', IsOpen: true },
  Wednesday: { BeginTime: '12:00', IsOpen: true },
  Thursday: { BeginTime: '13:00', IsOpen: true },
  Friday: { BeginTime: '14:00', IsOpen: true },
  Saturday: { BeginTime: '15:00', IsOpen: true },
};

function objectFieldsMappingConfig(expression: string): Parameters<typeof executeEngine>[0] {
  return {
    name: 'ObjectFieldsParity',
    version: 1,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'schema-source',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'schema-target',
      type: 'local',
    },
    config: {
      unmappedTargets: 'omit',
      nullSubtrees: [],
      constants: {},
      externalSources: [],
    },
    rules: [{ target: 'WeeklyOperations', type: 'array', expression }],
  };
}

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
    if (!hasFunction('source')) {
      registerAllFunctions(defaultRegistry);
    }
    vi.resetModules();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

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
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable, requestId, details) => ({
      statusCode,
      body: JSON.stringify({
        error: {
          code,
          message,
          statusCode,
          retryable,
          ...(requestId ? { requestId } : {}),
          ...(details !== undefined ? { details } : {}),
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
      { externalSources: {}, trace: false },
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
      { externalSources: { customerProfile: { customerId: 'c-1' } }, trace: false },
    );
  });

  it('accepts canonical enrichmentInputs alias and executionContext trace in execute options', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      sourceData: { amount: 12 },
      enrichmentInputs: { customerProfile: { customerId: 'c-1' } },
      executionContext: { correlationId: 'corr-1', trace: true },
      responseMode: 'canonical',
    });

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    expect(engineMocks.execute).toHaveBeenCalledWith(
      expect.any(Object),
      { amount: 12 },
      null,
      null,
      { externalSources: { customerProfile: { customerId: 'c-1' } }, trace: true },
    );

    const parsed = JSON.parse(result.body) as {
      outputFormat: string;
      metadata: { correlationId: string | null; traceEnabled: boolean };
    };
    expect(parsed.outputFormat).toBe('json');
    expect(parsed.metadata.correlationId).toBe('corr-1');
    expect(parsed.metadata.traceEnabled).toBe(true);
  });

  it('returns explicit legacy compatibility wrapper by default', async () => {
    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      mappingId: string;
      snapshotId: string;
      compatibility?: { mode: string; canonical: { outputFormat: string; metadata: { mappingId: string } } };
    };
    expect(parsed.mappingId).toBe('map-1');
    expect(parsed.snapshotId).toBe('snapshot-1');
    expect(parsed.compatibility).toBeDefined();
    expect(parsed.compatibility?.mode).toBe('legacy');
    expect(parsed.compatibility?.canonical.outputFormat).toBe('json');
    expect(parsed.compatibility?.canonical.metadata.mappingId).toBe('map-1');
  });

  it('rejects unsupported responseMode values to enforce explicit compatibility behavior', async () => {
    sharedMocks.parseBody.mockReturnValue({
      mappingId: 'map-1',
      sourceData: { amount: 12 },
      responseMode: 'auto',
    });

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
    expect(engineMocks.execute).not.toHaveBeenCalled();
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
    expect((parsed.error as { details?: { runtimeErrorCode?: string } }).details?.runtimeErrorCode).toBe('MissingEnrichmentInput');
    expect(engineMocks.execute).not.toHaveBeenCalled();
  });

  it('returns deterministic not-deployed error when active snapshot is missing', async () => {
    deploymentsMocks.getActiveSnapshot.mockResolvedValueOnce(null);

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('SOURCE_NOT_FOUND');
    expect(JSON.parse(result.body).error.details.runtimeErrorCode).toBe('MappingNotDeployed');
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
    expect((parsed.error as { details?: { runtimeErrorCode?: string } }).details?.runtimeErrorCode).toBe('ArtifactCorrupt');
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

  it('logs structured execute error details on unexpected runtime failure', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    engineMocks.execute.mockImplementationOnce(() => {
      throw new Error('engine exploded');
    });

    const { handler } = await importExecuteHandler();
    const result = await handler({ body: '{}', pathParameters: {} });

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error.code).toBe('INTERNAL_ERROR');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"eventType":"execute-error"'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"phase":"execute-runtime-snapshot"'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"engine exploded"'));
  });

  describe('canonical objectFields browser/lambda parity', () => {
    it('matches browser engine output for full weekly input (7 ordered outputs, IsOpen:false retained)', async () => {
      const mappingConfig = objectFieldsMappingConfig(OBJECT_FIELDS_PRIMARY_EXPRESSION);
      const sourceData = {
        DeliveryWeeklyOperation: WEEKLY_OBJECT,
      };

      sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({ mappingConfig }));
      sharedMocks.parseBody.mockReturnValue({
        mappingId: 'map-1',
        sourceData,
      });
      engineMocks.execute.mockImplementation((...args) => executeEngine(...(args as Parameters<typeof executeEngine>)));

      const expected = executeEngine(mappingConfig, sourceData, null, null, {
        externalSources: {},
        trace: false,
      });

      const { handler } = await importExecuteHandler();
      const result = await handler({ body: '{}', pathParameters: {} });

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { output: unknown };
      expect(parsed.output).toEqual(expected.output);
      expect(parsed.output).toEqual({
        WeeklyOperations: [
          { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
          { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
          { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
          { operationDayValue: 'Wednesday', isOpen: true, beginTime: '12:00' },
          { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
          { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
          { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
        ],
      });
    });

    it('matches browser engine output when one configured child key is null/missing (6 outputs)', async () => {
      const mappingConfig = objectFieldsMappingConfig(OBJECT_FIELDS_PRIMARY_EXPRESSION);
      const sourceData = {
        DeliveryWeeklyOperation: {
          ...WEEKLY_OBJECT,
          Wednesday: null,
        },
      };

      sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({ mappingConfig }));
      sharedMocks.parseBody.mockReturnValue({
        mappingId: 'map-1',
        sourceData,
      });
      engineMocks.execute.mockImplementation((...args) => executeEngine(...(args as Parameters<typeof executeEngine>)));

      const expected = executeEngine(mappingConfig, sourceData, null, null, {
        externalSources: {},
        trace: false,
      });

      const { handler } = await importExecuteHandler();
      const result = await handler({ body: '{}', pathParameters: {} });

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { output: unknown };
      expect(parsed.output).toEqual(expected.output);
      expect(parsed.output).toEqual({
        WeeklyOperations: [
          { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
          { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
          { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
          { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
          { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
          { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
        ],
      });
    });

    it('matches browser engine output when parent object is missing/null (empty array)', async () => {
      const mappingConfig = objectFieldsMappingConfig(OBJECT_FIELDS_PRIMARY_EXPRESSION);
      sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({ mappingConfig }));
      sharedMocks.parseBody.mockReturnValue({
        mappingId: 'map-1',
        sourceData: {},
      });
      engineMocks.execute.mockImplementation((...args) => executeEngine(...(args as Parameters<typeof executeEngine>)));

      const expected = executeEngine(mappingConfig, {}, null, null, {
        externalSources: {},
        trace: false,
      });

      const { handler } = await importExecuteHandler();
      const result = await handler({ body: '{}', pathParameters: {} });

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { output: unknown };
      expect(parsed.output).toEqual(expected.output);
      expect(parsed.output).toEqual({ WeeklyOperations: [] });

      sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({ mappingConfig }));
      sharedMocks.parseBody.mockReturnValue({
        mappingId: 'map-1',
        sourceData: { DeliveryWeeklyOperation: null },
      });

      const expectedNullParent = executeEngine(
        mappingConfig,
        { DeliveryWeeklyOperation: null },
        null,
        null,
        { externalSources: {}, trace: false },
      );
      const nullResult = await handler({ body: '{}', pathParameters: {} });

      expect(nullResult.statusCode).toBe(200);
      const parsedNull = JSON.parse(nullResult.body) as { output: unknown };
      expect(parsedNull.output).toEqual(expectedNullParent.output);
      expect(parsedNull.output).toEqual({ WeeklyOperations: [] });
    });

    it('matches browser engine output for enrichment-backed canonical objectFields expression', async () => {
      const mappingConfig = objectFieldsMappingConfig(OBJECT_FIELDS_ENRICHMENT_EXPRESSION);
      const sourceData = {};
      const enrichmentInputs = {
        hours: {
          DeliveryWeeklyOperation: WEEKLY_OBJECT,
        },
      };

      sharedMocks.getObject.mockResolvedValueOnce(JSON.stringify({ mappingConfig }));
      sharedMocks.parseBody.mockReturnValue({
        mappingId: 'map-1',
        sourceData,
        enrichmentInputs,
      });
      engineMocks.execute.mockImplementation((...args) => executeEngine(...(args as Parameters<typeof executeEngine>)));

      const expected = executeEngine(mappingConfig, sourceData, null, null, {
        externalSources: enrichmentInputs,
        trace: false,
      });

      const { handler } = await importExecuteHandler();
      const result = await handler({ body: '{}', pathParameters: {} });

      expect(result.statusCode).toBe(200);
      const parsed = JSON.parse(result.body) as { output: unknown };
      expect(parsed.output).toEqual(expected.output);
      expect(parsed.output).toEqual({
        WeeklyOperations: [
          { operationDayValue: 'Sunday', isOpen: true, beginTime: '09:00' },
          { operationDayValue: 'Monday', isOpen: false, beginTime: '10:00' },
          { operationDayValue: 'Tuesday', isOpen: true, beginTime: '11:00' },
          { operationDayValue: 'Wednesday', isOpen: true, beginTime: '12:00' },
          { operationDayValue: 'Thursday', isOpen: true, beginTime: '13:00' },
          { operationDayValue: 'Friday', isOpen: true, beginTime: '14:00' },
          { operationDayValue: 'Saturday', isOpen: true, beginTime: '15:00' },
        ],
      });
    });
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
