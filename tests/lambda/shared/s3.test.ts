import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class S3Client {
    send = sendMock;
  }

  return {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    S3Client,
  };
});

async function importModule() {
  return import('../../../src/lambda/shared/s3.js');
}

describe('lambda shared s3 wrapper', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
  });

  it('maps NoSuchKey to RESOURCE_NOT_FOUND 404', async () => {
    sendMock.mockRejectedValue({ name: 'NoSuchKey' });
    const mod = await importModule();

    await expect(mod.getObject({ Bucket: 'content', Key: 'missing.json' })).rejects.toMatchObject({
      name: 'S3ServiceError',
      appError: {
        code: 'RESOURCE_NOT_FOUND',
        statusCode: 404,
        retryable: false,
      },
    });
  });
});
