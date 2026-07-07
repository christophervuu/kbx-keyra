import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ActiveSnapshotItem,
  DeploymentHistoryItem,
  CreateDeploymentInput,
  DeploymentCurrentItem,
  DeploymentItem,
  MappingConfig,
} from '../../../src/lib/persistence/types.js';
import { normalizeRuntimeDeploymentEnvironment } from '../../../src/lib/persistence/types.js';

const { dynamoSendMock, putSnapshotMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
  putSnapshotMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

vi.mock('../../../src/lib/persistence/s3/deployment-snapshot.js', () => ({
  put: putSnapshotMock,
}));

async function importModule() {
  return import('../../../src/lib/persistence/deployments.js');
}

function makeConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Mapping 1',
    version: 1,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'source-1',
      type: 'local',
    },
    targetSchemaRef: {
      schemaId: 'target-1',
      type: 'local',
    },
    config: {},
    rules: [{ target: 'a', type: 'string', expression: 'source("a")' }],
    ...overrides,
  };
}

function makeCreateInput(overrides: Partial<CreateDeploymentInput> = {}): CreateDeploymentInput {
  return {
    mappingId: 'mapping-1',
    environment: 'DEV',
    sourceType: 'revision',
    sourceNumber: 5,
    deployedBy: 'user-1',
    config: makeConfig(),
    ...overrides,
  };
}

function makeCurrentItem(overrides: Partial<DeploymentCurrentItem> = {}): DeploymentCurrentItem {
  return {
    mappingIdEnvironment: 'mapping-1#DEV',
    mappingId: 'mapping-1',
    environment: 'DEV',
    deployedAt: '2026-06-01T00:00:00.000Z',
    sourceType: 'revision',
    sourceNumber: 5,
    configHash: 'a'.repeat(64),
    configS3Key: 'deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json',
    ...overrides,
  };
}

function makeHistoryItem(overrides: Partial<DeploymentItem> = {}): DeploymentItem {
  return {
    mappingId: 'mapping-1',
    environmentDeployedAt: 'DEV#2026-06-01T00:00:00.000Z',
    environment: 'DEV',
    sourceType: 'revision',
    sourceNumber: 5,
    configS3Key: 'deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json',
    configHash: 'a'.repeat(64),
    deployedAt: '2026-06-01T00:00:00.000Z',
    deployedBy: 'user-1',
    ...overrides,
  };
}

function makeRuntimeActiveSnapshot(overrides: Partial<ActiveSnapshotItem> = {}): ActiveSnapshotItem {
  return {
    mappingId: 'mapping-1',
    activeSnapshotId: 'snapshot-1',
    snapshotHash: 'hash-1',
    activatedAt: '2026-06-01T00:00:00.000Z',
    activatedBy: 'control-plane',
    sourceType: 'revision',
    sourceNumber: 5,
    ...overrides,
  };
}

function makeRuntimeHistoryItem(overrides: Partial<DeploymentHistoryItem> = {}): DeploymentHistoryItem {
  return {
    mappingId: 'mapping-1',
    eventAt: '2026-06-01T00:00:00.000Z',
    eventType: 'deploy',
    snapshotId: 'snapshot-1',
    snapshotHash: 'hash-1',
    requestedBy: 'control-plane',
    sourceType: 'revision',
    sourceNumber: 5,
    requestId: 'req-1',
    ...overrides,
  };
}

describe('persistence deployments', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
    putSnapshotMock.mockReset();
  });

  it('create writes deployment record and updates current pointer', async () => {
    putSnapshotMock.mockResolvedValue('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const result = await mod.create(makeCreateInput());

    expect(result.mappingId).toBe('mapping-1');
    expect(result.environment).toBe('DEV');
    expect(result.sourceType).toBe('revision');
    expect(result.sourceNumber).toBe(5);
    expect(result.configS3Key).toBe('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    expect(result.environmentDeployedAt.startsWith('DEV#')).toBe(true);
    expect(result.cdmSchemaTraceability).toBeUndefined();

    expect(putSnapshotMock).toHaveBeenCalledWith(
      'mapping-1',
      'DEV',
      expect.any(String),
      expect.any(Object),
      { schemaRefs: [] },
    );

    const deploymentPut = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: DeploymentItem };
    };
    expect(deploymentPut.input.TableName).toBe('keyra-deployments');
    expect(deploymentPut.input.Item.environment).toBe('DEV');

    const currentPut = dynamoSendMock.mock.calls[1]?.[0] as {
      input: { TableName: string; Item: DeploymentCurrentItem };
    };
    expect(currentPut.input.TableName).toBe('keyra-deployment-current');
    expect(currentPut.input.Item.mappingIdEnvironment).toBe('mapping-1#DEV');
  });

  it('create rejects when provided artifactHash does not match computed config hash', async () => {
    putSnapshotMock.mockResolvedValue('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();

    await expect(
      mod.create(
        makeCreateInput({
          artifactHash: 'not-the-computed-hash',
        }),
      ),
    ).rejects.toMatchObject({
      name: 'DeploymentArtifactIntegrityError',
    });

    expect(putSnapshotMock).not.toHaveBeenCalled();
    expect(dynamoSendMock).not.toHaveBeenCalled();
  });

  it('create persists value-table resolved entries exactly in deployment snapshot payload', async () => {
    putSnapshotMock.mockResolvedValue('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const configWithProjectValueTable = makeConfig({
      rules: [
        {
          target: 'statusLabel',
          type: 'string',
          expression: 'valueMap(source("status"), valueTable("order-status", "code", "label"), "UNKNOWN")',
          valueTableRef: {
            scope: 'project',
            valueTableId: 'vt-1',
            tableKey: 'order-status',
            revision: 3,
            inputSideKey: 'code',
            outputSideKey: 'label',
            inputType: 'string',
            outputType: 'string',
            resolvedEntries: [
              { in: 'A', out: 'OPEN', rowId: 'r1' },
              { in: 'B', out: 'CLOSED', rowId: 'r2' },
            ],
          },
          noMatchBehavior: {
            mode: 'fallback_value',
            fallbackValue: 'UNKNOWN',
          },
        },
      ],
    });

    await mod.create(makeCreateInput({ config: configWithProjectValueTable }));

    expect(putSnapshotMock).toHaveBeenCalledWith(
      'mapping-1',
      'DEV',
      expect.any(String),
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            valueTableRef: expect.objectContaining({
              scope: 'project',
              valueTableId: 'vt-1',
              revision: 3,
              resolvedEntries: [
                { in: 'A', out: 'OPEN', rowId: 'r1' },
                { in: 'B', out: 'CLOSED', rowId: 'r2' },
              ],
            }),
          }),
        ],
      }),
      { schemaRefs: [] },
    );
  });

  it('createRollback appends rollback event and repoints current without writing snapshot', async () => {
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const result = await mod.createRollback({
      mappingId: 'mapping-1',
      environment: 'PROD',
      sourceType: 'version',
      sourceNumber: 2,
      deployedBy: 'system',
      artifactId: 'artifact-2',
      artifactHash: 'hash-2',
      configHash: 'cfg-2',
      configS3Key: 'deployments/mapping-1/PROD/artifact-2.json',
      rollbackOf: 'PROD#2026-06-01T00:00:00.000Z',
    });

    expect(putSnapshotMock).not.toHaveBeenCalled();
    expect(result.rollbackOf).toBe('PROD#2026-06-01T00:00:00.000Z');
    expect(result.artifactId).toBe('artifact-2');
    expect(result.configS3Key).toBe('deployments/mapping-1/PROD/artifact-2.json');

    const deploymentPut = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: DeploymentItem };
    };
    expect(deploymentPut.input.TableName).toBe('keyra-deployments');
    expect(deploymentPut.input.Item.rollbackOf).toBe('PROD#2026-06-01T00:00:00.000Z');
    expect(deploymentPut.input.Item.artifactId).toBe('artifact-2');

    const currentPut = dynamoSendMock.mock.calls[1]?.[0] as {
      input: { TableName: string; Item: DeploymentCurrentItem };
    };
    expect(currentPut.input.TableName).toBe('keyra-deployment-current');
    expect(currentPut.input.Item.mappingIdEnvironment).toBe('mapping-1#PROD');
    expect(currentPut.input.Item.artifactId).toBe('artifact-2');
  });

  it('create persists cdmSchemaTraceability in both deployment item and snapshot metadata', async () => {
    putSnapshotMock.mockResolvedValue('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const traceability = [
      {
        schemaId: 'schema-1',
        schemaName: 'CDM Source',
        referenceRole: 'source' as const,
        repo: 'KBXT/KBX-Canonicals',
        path: 'JSONSchemas/CommonDataModels/Order.json',
        commitSha: 'abc123',
      },
      {
        schemaId: 'schema-2',
        schemaName: 'CDM Target',
        referenceRole: 'target' as const,
        repo: 'KBXT/KBX-Canonicals',
        path: 'JSONSchemas/CommonDataModels/Invoice.json',
        commitSha: 'def456',
      },
    ];

    const result = await mod.create(
      makeCreateInput({
        cdmSchemaTraceability: traceability,
      }),
    );

    expect(putSnapshotMock).toHaveBeenCalledWith(
      'mapping-1',
      'DEV',
      expect.any(String),
      expect.any(Object),
      { schemaRefs: [], cdmSchemaTraceability: traceability },
    );

    const deploymentPut = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { Item: DeploymentItem };
    };
    expect(deploymentPut.input.Item.cdmSchemaTraceability).toEqual(traceability);
    expect(result.cdmSchemaTraceability).toEqual(traceability);
  });

  it('create writes immutable schema reference bundle into deployment snapshot metadata', async () => {
    putSnapshotMock.mockResolvedValue('deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json');
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    await mod.create(
      makeCreateInput({
        config: makeConfig({
          sourceSchemaRef: {
            schemaId: 'source-1',
            type: 'local',
            schemaVersion: 3,
            schemaVersionId: 'sv-source-3',
            contentHash: 'hash-source-3',
          },
          targetSchemaRef: {
            schemaId: 'target-1',
            type: 'local',
            schemaVersion: 5,
            schemaVersionId: 'sv-target-5',
            contentHash: 'hash-target-5',
          },
          enrichmentSources: [
            {
              alias: 'customerProfile',
              schemaId: 'enrich-1',
              schemaVersion: 2,
              schemaVersionId: 'sv-enrich-2',
              contentHash: 'hash-enrich-2',
              required: true,
            },
          ],
        }),
      }),
    );

    expect(putSnapshotMock).toHaveBeenCalledWith(
      'mapping-1',
      'DEV',
      expect.any(String),
      expect.any(Object),
      {
        schemaRefs: [
          {
            role: 'source',
            schemaId: 'source-1',
            schemaVersion: 3,
            schemaVersionId: 'sv-source-3',
            contentHash: 'hash-source-3',
            contentS3Key: 'schemas/source-1/versions/v3.json',
          },
          {
            role: 'target',
            schemaId: 'target-1',
            schemaVersion: 5,
            schemaVersionId: 'sv-target-5',
            contentHash: 'hash-target-5',
            contentS3Key: 'schemas/target-1/versions/v5.json',
          },
          {
            role: 'enrichment',
            alias: 'customerProfile',
            schemaId: 'enrich-1',
            schemaVersion: 2,
            schemaVersionId: 'sv-enrich-2',
            contentHash: 'hash-enrich-2',
            contentS3Key: 'schemas/enrich-1/versions/v2.json',
          },
        ],
      },
    );
  });

  it('getCurrent returns current item or null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeCurrentItem() });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.getCurrent('mapping-1', 'DEV');
    const missing = await mod.getCurrent('mapping-1', 'PREPROD');

    expect(found?.mappingIdEnvironment).toBe('mapping-1#DEV');
    expect(missing).toBeNull();
  });

  it('getCurrentAll fetches DEV/PREPROD/PROD', async () => {
    const mod = await importModule();

    dynamoSendMock
      .mockResolvedValueOnce({ Item: makeCurrentItem({ environment: 'DEV', mappingIdEnvironment: 'mapping-1#DEV' }) })
      .mockResolvedValueOnce({ Item: makeCurrentItem({ environment: 'PREPROD', mappingIdEnvironment: 'mapping-1#PREPROD' }) })
      .mockResolvedValueOnce({ Item: undefined });

    const result = await mod.getCurrentAll('mapping-1');

    expect(result.DEV?.environment).toBe('DEV');
    expect(result.PREPROD?.environment).toBe('PREPROD');
    expect(result.PROD).toBeNull();
  });

  it('listHistory returns descending history and supports environment filter + limit', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        makeHistoryItem({ environmentDeployedAt: 'DEV#2026-06-03T00:00:00.000Z', sourceNumber: 7 }),
        makeHistoryItem({ environmentDeployedAt: 'DEV#2026-06-02T00:00:00.000Z', sourceNumber: 6 }),
        makeHistoryItem({ environmentDeployedAt: 'DEV#2026-06-01T00:00:00.000Z', sourceNumber: 5 }),
      ],
    });

    const result = await mod.listHistory('mapping-1', 'DEV', 2);

    expect(result.map((item) => item.sourceNumber)).toEqual([7, 6]);

    const queryCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ScanIndexForward: boolean;
      };
    };

    expect(queryCommand.input.KeyConditionExpression).toContain('begins_with(environmentDeployedAt, :environmentPrefix)');
    expect(queryCommand.input.ExpressionAttributeValues[':environmentPrefix']).toBe('DEV#');
    expect(queryCommand.input.ScanIndexForward).toBe(false);
  });

  it('exports deployments object with expected operations', async () => {
    const mod = await importModule();

    expect(mod.deployments.create).toBe(mod.create);
    expect(mod.deployments.createRollback).toBe(mod.createRollback);
    expect(mod.deployments.getCurrent).toBe(mod.getCurrent);
    expect(mod.deployments.getCurrentAll).toBe(mod.getCurrentAll);
    expect(mod.deployments.listHistory).toBe(mod.listHistory);
    expect(mod.deployments.upsertActiveSnapshot).toBe(mod.upsertActiveSnapshot);
    expect(mod.deployments.getActiveSnapshot).toBe(mod.getActiveSnapshot);
    expect(mod.deployments.appendDeploymentHistory).toBe(mod.appendDeploymentHistory);
    expect(mod.deployments.listDeploymentHistory).toBe(mod.listDeploymentHistory);
  });

  it('upsertActiveSnapshot writes runtime active pointer item', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({});

    const written = await mod.upsertActiveSnapshot({
      mappingId: 'mapping-1',
      activeSnapshotId: 'snapshot-1',
      snapshotHash: 'hash-1',
      activatedBy: 'control-plane',
      sourceType: 'revision',
      sourceNumber: 5,
    });

    expect(written.mappingId).toBe('mapping-1');
    expect(written.activeSnapshotId).toBe('snapshot-1');

    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: ActiveSnapshotItem };
    };
    expect(putCommand.input.TableName).toBe('keyra-active-snapshots');
    expect(putCommand.input.Item.activeSnapshotId).toBe('snapshot-1');
  });

  it('upsertActiveSnapshot enforces conditional update when expectedCurrentSnapshotId is provided', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({});

    await mod.upsertActiveSnapshot({
      mappingId: 'mapping-1',
      activeSnapshotId: 'snapshot-2',
      snapshotHash: 'hash-2',
      activatedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 6,
      expectedCurrentSnapshotId: 'snapshot-1',
    });

    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        ConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
    };
    expect(putCommand.input.ConditionExpression).toBe('activeSnapshotId = :expectedSnapshotId');
    expect(putCommand.input.ExpressionAttributeValues).toEqual({
      ':expectedSnapshotId': 'snapshot-1',
    });
  });

  it('upsertActiveSnapshot enforces create-only condition when expectedCurrentSnapshotId is null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({});

    await mod.upsertActiveSnapshot({
      mappingId: 'mapping-1',
      activeSnapshotId: 'snapshot-1',
      snapshotHash: 'hash-1',
      activatedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 6,
      expectedCurrentSnapshotId: null,
    });

    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        ConditionExpression?: string;
      };
    };
    expect(putCommand.input.ConditionExpression).toBe('attribute_not_exists(mappingId)');
  });

  it('upsertActiveSnapshot throws ActiveSnapshotConflictError on conditional check failure', async () => {
    const mod = await importModule();

    dynamoSendMock.mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' });

    await expect(
      mod.upsertActiveSnapshot({
        mappingId: 'mapping-1',
        activeSnapshotId: 'snapshot-2',
        snapshotHash: 'hash-2',
        activatedBy: 'control-plane',
        sourceType: 'version',
        sourceNumber: 6,
        expectedCurrentSnapshotId: 'snapshot-1',
      }),
    ).rejects.toMatchObject({
      name: 'ActiveSnapshotConflictError',
    });
  });

  it('getActiveSnapshot returns runtime pointer or null', async () => {
    const mod = await importModule();

    dynamoSendMock
      .mockResolvedValueOnce({ Item: makeRuntimeActiveSnapshot() })
      .mockResolvedValueOnce({ Item: undefined });

    const found = await mod.getActiveSnapshot('mapping-1');
    const missing = await mod.getActiveSnapshot('mapping-2');

    expect(found?.activeSnapshotId).toBe('snapshot-1');
    expect(missing).toBeNull();
  });

  it('appendDeploymentHistory writes append-only runtime history event', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({});

    const written = await mod.appendDeploymentHistory({
      mappingId: 'mapping-1',
      eventType: 'rollback',
      snapshotId: 'snapshot-1',
      snapshotHash: 'hash-1',
      requestedBy: 'control-plane',
      sourceType: 'version',
      sourceNumber: 2,
      rollbackOf: 'PREPROD#2026-06-01T00:00:00.000Z',
      requestId: 'req-rollback-1',
    });

    expect(written.eventType).toBe('rollback');
    expect(written.rollbackOf).toBe('PREPROD#2026-06-01T00:00:00.000Z');

    const putCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { TableName: string; Item: DeploymentHistoryItem };
    };

    expect(putCommand.input.TableName).toBe('keyra-deployment-history');
    expect(putCommand.input.Item.requestId).toBe('req-rollback-1');
  });

  it('listDeploymentHistory queries runtime history in descending order', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        makeRuntimeHistoryItem({ eventAt: '2026-06-03T00:00:00.000Z', sourceNumber: 7 }),
        makeRuntimeHistoryItem({ eventAt: '2026-06-02T00:00:00.000Z', sourceNumber: 6 }),
      ],
    });

    const result = await mod.listDeploymentHistory('mapping-1', 2);

    expect(result.map((item) => item.sourceNumber)).toEqual([7, 6]);

    const queryCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ScanIndexForward: boolean;
        Limit: number;
      };
    };

    expect(queryCommand.input.TableName).toBe('keyra-deployment-history');
    expect(queryCommand.input.KeyConditionExpression).toBe('mappingId = :mappingId');
    expect(queryCommand.input.ExpressionAttributeValues[':mappingId']).toBe('mapping-1');
    expect(queryCommand.input.ScanIndexForward).toBe(false);
    expect(queryCommand.input.Limit).toBe(2);
  });

  it('getCurrent PREPROD falls back to legacy QA current key', async () => {
    const mod = await importModule();

    dynamoSendMock
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Item: makeCurrentItem({ environment: 'QA', mappingIdEnvironment: 'mapping-1#QA' }) });

    const current = await mod.getCurrent('mapping-1', 'PREPROD');

    expect(current?.mappingIdEnvironment).toBe('mapping-1#QA');
    expect(current?.environment).toBe('QA');
    expect(normalizeRuntimeDeploymentEnvironment(current?.environment ?? 'QA')).toBe('PREPROD');
  });

  it('listHistory PREPROD includes legacy QA records via normalization filter', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        makeHistoryItem({ environment: 'DEV', environmentDeployedAt: 'DEV#2026-06-03T00:00:00.000Z' }),
        makeHistoryItem({ environment: 'QA', environmentDeployedAt: 'QA#2026-06-02T00:00:00.000Z' }),
        makeHistoryItem({ environment: 'PREPROD', environmentDeployedAt: 'PREPROD#2026-06-01T00:00:00.000Z' }),
      ],
    });

    const result = await mod.listHistory('mapping-1', 'PREPROD');

    expect(result.map((item) => item.environment)).toEqual(['QA', 'PREPROD']);

    const queryCommand = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(queryCommand.input.KeyConditionExpression).toBe('mappingId = :mappingId');
    expect(queryCommand.input.ExpressionAttributeValues[':environmentPrefix']).toBeUndefined();
  });
});
