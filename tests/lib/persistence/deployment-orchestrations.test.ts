import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dynamoSendMock } = vi.hoisted(() => ({
  dynamoSendMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: dynamoSendMock,
  },
}));

async function importModule() {
  return import('../../../src/lib/persistence/deployment-orchestrations.js');
}

describe('persistence deployment-orchestrations', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoSendMock.mockReset();
  });

  it('create writes new orchestration', async () => {
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const created = await mod.create({
      mappingId: 'map-1',
      operationType: 'deploy',
      targetEnvironment: 'DEV',
      artifactId: 'artifact-1',
      requestId: 'req-1',
      requestedBy: 'system',
    });

    expect(created.mappingId).toBe('map-1');
    expect(created.operationType).toBe('deploy');
    expect(created.targetEnvironment).toBe('DEV');

    const put = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        Item: Record<string, unknown>;
        ConditionExpression?: string;
      };
    };

    expect(put.input.TableName).toBe('keyra-deployment-orchestrations');
    expect(put.input.Item.mappingId).toBe('map-1');
    expect(put.input.ConditionExpression).toBeUndefined();
  });

  it('create with explicit orchestrationId applies create-only condition', async () => {
    dynamoSendMock.mockResolvedValue({});

    const mod = await importModule();
    const created = await mod.create({
      orchestrationId: 'deploy:map-1:DEV:revision:2:key-1',
      mappingId: 'map-1',
      operationType: 'deploy',
      targetEnvironment: 'DEV',
      artifactId: 'artifact-1',
      requestId: 'req-1',
      requestedBy: 'system',
    });

    expect(created.orchestrationId).toBe('deploy:map-1:DEV:revision:2:key-1');

    const put = dynamoSendMock.mock.calls[0]?.[0] as {
      input: {
        ConditionExpression?: string;
      };
    };

    expect(put.input.ConditionExpression).toBe('attribute_not_exists(orchestrationId)');
  });

  it('acquireOperationLock returns conflict when active lock exists', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({
        Item: {
          orchestrationId: 'lock:map-1:DEV',
          mappingId: 'map-1',
          targetEnvironment: 'DEV',
          lockOwnerOperationId: 'op-existing',
          expiresAt: Math.floor(Date.now() / 1000) + 120,
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      })
      .mockRejectedValueOnce(Object.assign(new Error('conditional failed'), { name: 'ConditionalCheckFailedException' }))
      .mockResolvedValueOnce({
        Item: {
          orchestrationId: 'lock:map-1:DEV',
          mappingId: 'map-1',
          targetEnvironment: 'DEV',
          lockOwnerOperationId: 'op-existing',
          expiresAt: Math.floor(Date.now() / 1000) + 120,
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      });

    const mod = await importModule();
    const result = await mod.acquireOperationLock({
      mappingId: 'map-1',
      targetEnvironment: 'DEV',
      ownerOperationId: 'op-new',
      ttlSeconds: 300,
    });

    expect(result.outcome).toBe('conflict');
    expect(result.existingLockOwnerOperationId).toBe('op-existing');
  });

  it('acquireOperationLock acquires when existing lock is expired', async () => {
    dynamoSendMock
      .mockResolvedValueOnce({
        Item: {
          orchestrationId: 'lock:map-1:DEV',
          mappingId: 'map-1',
          targetEnvironment: 'DEV',
          lockOwnerOperationId: 'op-old',
          expiresAt: Math.floor(Date.now() / 1000) - 10,
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({});

    const mod = await importModule();
    const result = await mod.acquireOperationLock({
      mappingId: 'map-1',
      targetEnvironment: 'DEV',
      ownerOperationId: 'op-new',
      ttlSeconds: 300,
    });

    expect(result.outcome).toBe('acquired');
    const put = dynamoSendMock.mock.calls[1]?.[0] as {
      input: {
        ConditionExpression?: string;
      };
    };
    expect(put.input.ConditionExpression).toContain('expiresAt < :nowEpoch');
  });

  it('listReconciliationCandidates scans running/timed-out operations only', async () => {
    dynamoSendMock.mockResolvedValueOnce({
      Items: [
        { operationId: 'op-2', operationStatus: 'TIMED_OUT', requestedAt: '2026-07-07T00:00:02.000Z' },
        { operationId: 'op-1', operationStatus: 'RUNNING', requestedAt: '2026-07-07T00:00:01.000Z' },
      ],
    });

    const mod = await importModule();
    const items = await mod.listReconciliationCandidates();

    expect(items.map((item) => item.operationId)).toEqual(['op-1', 'op-2']);
    const scan = dynamoSendMock.mock.calls[0]?.[0] as {
      input: { FilterExpression?: string };
    };
    expect(scan.input.FilterExpression).toContain('#status');
  });
});
