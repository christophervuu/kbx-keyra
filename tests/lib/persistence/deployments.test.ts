import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateDeploymentInput,
  DeploymentCurrentItem,
  DeploymentItem,
  MappingConfig,
} from '../../../src/lib/persistence/types.js';

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

    expect(putSnapshotMock).toHaveBeenCalledWith('mapping-1', 'DEV', expect.any(String), expect.any(Object), {});

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
      { cdmSchemaTraceability: traceability },
    );

    const deploymentPut = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { Item: DeploymentItem };
    };
    expect(deploymentPut.input.Item.cdmSchemaTraceability).toEqual(traceability);
    expect(result.cdmSchemaTraceability).toEqual(traceability);
  });

  it('getCurrent returns current item or null', async () => {
    const mod = await importModule();

    dynamoSendMock.mockResolvedValueOnce({ Item: makeCurrentItem() });
    dynamoSendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await mod.getCurrent('mapping-1', 'DEV');
    const missing = await mod.getCurrent('mapping-1', 'QA');

    expect(found?.mappingIdEnvironment).toBe('mapping-1#DEV');
    expect(missing).toBeNull();
  });

  it('getCurrentAll fetches DEV/QA/PROD', async () => {
    const mod = await importModule();

    dynamoSendMock
      .mockResolvedValueOnce({ Item: makeCurrentItem({ environment: 'DEV', mappingIdEnvironment: 'mapping-1#DEV' }) })
      .mockResolvedValueOnce({ Item: makeCurrentItem({ environment: 'QA', mappingIdEnvironment: 'mapping-1#QA' }) })
      .mockResolvedValueOnce({ Item: undefined });

    const result = await mod.getCurrentAll('mapping-1');

    expect(result.DEV?.environment).toBe('DEV');
    expect(result.QA?.environment).toBe('QA');
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
    expect(mod.deployments.getCurrent).toBe(mod.getCurrent);
    expect(mod.deployments.getCurrentAll).toBe(mod.getCurrentAll);
    expect(mod.deployments.listHistory).toBe(mod.listHistory);
  });
});
