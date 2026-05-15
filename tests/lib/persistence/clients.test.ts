import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnvStore = Record<string, string | undefined>;

const { dynamoCtorMock, documentFromMock, s3CtorMock } = vi.hoisted(() => ({
  dynamoCtorMock: vi.fn(),
  documentFromMock: vi.fn(),
  s3CtorMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {
    constructor(config: unknown) {
      dynamoCtorMock(config);
    }
  },
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: (...args: unknown[]) => documentFromMock(...args),
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class S3Client {
    constructor(config: unknown) {
      s3CtorMock(config);
    }
  },
}));

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_ENV = {
  AWS_REGION: getEnvStore().AWS_REGION,
  DYNAMODB_ENDPOINT: getEnvStore().DYNAMODB_ENDPOINT,
  S3_ENDPOINT: getEnvStore().S3_ENDPOINT,
};

function setEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore[key];
    return;
  }

  envStore[key] = value;
}

async function importClientsModule() {
  return import('../../../src/lib/persistence/clients.js');
}

describe('persistence clients', () => {
  beforeEach(() => {
    vi.resetModules();
    dynamoCtorMock.mockReset();
    documentFromMock.mockReset();
    s3CtorMock.mockReset();
    documentFromMock.mockReturnValue({ __brand: 'document-client' });
  });

  afterEach(() => {
    setEnvValue('AWS_REGION', ORIGINAL_ENV.AWS_REGION);
    setEnvValue('DYNAMODB_ENDPOINT', ORIGINAL_ENV.DYNAMODB_ENDPOINT);
    setEnvValue('S3_ENDPOINT', ORIGINAL_ENV.S3_ENDPOINT);
  });

  it('creates clients with default region and no endpoints', async () => {
    setEnvValue('AWS_REGION', undefined);
    setEnvValue('DYNAMODB_ENDPOINT', undefined);
    setEnvValue('S3_ENDPOINT', undefined);
    vi.resetModules();

    const clients = await importClientsModule();

    expect(dynamoCtorMock).toHaveBeenCalledWith({ region: 'us-east-1', endpoint: undefined });
    expect(s3CtorMock).toHaveBeenCalledWith({ region: 'us-east-1', endpoint: undefined });
    expect(documentFromMock).toHaveBeenCalledTimes(1);
    expect(clients.dynamoClient).toEqual({ __brand: 'document-client' });
  });

  it('creates clients with region and endpoint overrides', async () => {
    setEnvValue('AWS_REGION', 'us-west-2');
    setEnvValue('DYNAMODB_ENDPOINT', 'http://localhost:8000');
    setEnvValue('S3_ENDPOINT', 'http://localhost:4566');
    vi.resetModules();

    await importClientsModule();

    expect(dynamoCtorMock).toHaveBeenCalledWith({
      region: 'us-west-2',
      endpoint: 'http://localhost:8000',
    });
    expect(s3CtorMock).toHaveBeenCalledWith({
      region: 'us-west-2',
      endpoint: 'http://localhost:4566',
    });
  });
});
