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
});
