import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnvStore = Record<string, string | undefined>;

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class S3Client {
    send = sendMock;
  }

  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
  };
});

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_SCHEMA_BUCKET = getEnvStore().SCHEMA_BUCKET;

function setSchemaBucket(value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore.SCHEMA_BUCKET;
    return;
  }

  envStore.SCHEMA_BUCKET = value;
}

async function importStorageModule() {
  return import('../../../../src/lib/schema/s3/schema-storage.js');
}

describe('schema s3 storage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.resetModules();
    setSchemaBucket('keyra-schema-bucket');
  });

  afterEach(() => {
    setSchemaBucket(ORIGINAL_SCHEMA_BUCKET);
    vi.restoreAllMocks();
  });

  it('storeOriginalSchema constructs JSON key and content type', async () => {
    sendMock.mockResolvedValue({});
    const storage = await importStorageModule();

    const key = await storage.storeOriginalSchema('schema-1', '{"type":"object"}', 'json-schema');

    expect(key).toBe('schemas/schema-1/original.json');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0]?.[0] as { input: { Key: string; ContentType: string; Bucket: string } };
    expect(command.input).toMatchObject({
      Bucket: 'keyra-schema-bucket',
      Key: 'schemas/schema-1/original.json',
      ContentType: 'application/json',
    });
  });

  it('storeOriginalSchema constructs XSD key and xml content type', async () => {
    sendMock.mockResolvedValue({});
    const storage = await importStorageModule();

    const key = await storage.storeOriginalSchema('schema-2', '<xs:schema />', 'xsd');

    expect(key).toBe('schemas/schema-2/original.xsd');

    const command = sendMock.mock.calls[0]?.[0] as { input: { Key: string; ContentType: string } };
    expect(command.input).toMatchObject({
      Key: 'schemas/schema-2/original.xsd',
      ContentType: 'application/xml',
    });
  });

  it('storeProcessedContent writes json-stringified payload', async () => {
    sendMock.mockResolvedValue({});
    const storage = await importStorageModule();

    const payload = {
      nodes: [{ path: 'Order.Id' }],
      fieldCount: 1,
    };

    const key = await storage.storeProcessedContent('schema-3', payload);

    expect(key).toBe('schemas/schema-3/content.json');

    const command = sendMock.mock.calls[0]?.[0] as { input: { Key: string; Body: string; ContentType: string } };
    expect(command.input.Key).toBe('schemas/schema-3/content.json');
    expect(command.input.Body).toBe(JSON.stringify(payload));
    expect(command.input.ContentType).toBe('application/json');
  });

  it('getSchemaContent returns transformed string content', async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('{"fieldCount":1}'),
      },
    });

    const storage = await importStorageModule();
    const content = await storage.getSchemaContent('schema-4');

    expect(content).toBe('{"fieldCount":1}');

    const command = sendMock.mock.calls[0]?.[0] as { input: { Key: string; Bucket: string } };
    expect(command.input).toMatchObject({
      Bucket: 'keyra-schema-bucket',
      Key: 'schemas/schema-4/content.json',
    });
  });

  it('throws configuration error when SCHEMA_BUCKET is missing', async () => {
    setSchemaBucket(undefined);
    vi.resetModules();
    const storage = await importStorageModule();

    await expect(storage.storeOriginalSchema('schema-5', '{}', 'json-schema')).rejects.toMatchObject({
      name: 'SchemaStorageError',
      code: 'SCHEMA_STORAGE_CONFIG_ERROR',
    });
  });

  it('wraps put failures as domain-specific error', async () => {
    sendMock.mockRejectedValue(new Error('S3 unavailable'));
    const storage = await importStorageModule();

    await expect(storage.storeOriginalSchema('schema-6', '{}', 'json-schema')).rejects.toMatchObject({
      name: 'SchemaStorageError',
      code: 'SCHEMA_STORAGE_PUT_ERROR',
    });
  });
});
