import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class GetCommand {
    constructor(public readonly input: unknown) {}
  }
  class PutCommand {
    constructor(public readonly input: unknown) {}
  }
  class QueryCommand {
    constructor(public readonly input: unknown) {}
  }
  class ScanCommand {
    constructor(public readonly input: unknown) {}
  }
  class DeleteCommand {
    constructor(public readonly input: unknown) {}
  }
  class UpdateCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    GetCommand,
    PutCommand,
    QueryCommand,
    ScanCommand,
    DeleteCommand,
    UpdateCommand,
    DynamoDBDocumentClient: {
      from: () => ({ send: sendMock }),
    },
  };
});

vi.mock('@aws-sdk/client-dynamodb', () => {
  class DynamoDBClient {}
  return { DynamoDBClient };
});

async function importModule() {
  return import('../../../src/lambda/shared/dynamo.js');
}

describe('lambda shared dynamo wrapper', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
  });

  it('maps ProvisionedThroughputExceededException to SERVICE_UNAVAILABLE 503', async () => {
    sendMock.mockRejectedValue({ name: 'ProvisionedThroughputExceededException' });
    const mod = await importModule();

    await expect(mod.getItem({ TableName: 'Projects', Key: { projectId: 'p1' } })).rejects.toMatchObject({
      name: 'DynamoServiceError',
      appError: {
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503,
        retryable: true,
      },
    });
  });

  it('maps ThrottlingException to SERVICE_UNAVAILABLE 503', async () => {
    sendMock.mockRejectedValue({ name: 'ThrottlingException' });
    const mod = await importModule();

    await expect(mod.putItem({ TableName: 'Projects', Item: { projectId: 'p1' } })).rejects.toMatchObject({
      name: 'DynamoServiceError',
      appError: {
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503,
        retryable: true,
      },
    });
  });
});
