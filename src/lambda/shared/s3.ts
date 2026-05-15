import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { notFound, serviceUnavailable, type AppErrorDetails } from './errors.js';

export const s3Client = new S3Client({});

interface S3BodyLike {
  transformToString?: () => Promise<string>;
}

export class S3ServiceError extends Error {
  constructor(
    message: string,
    public readonly appError: AppErrorDetails,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'S3ServiceError';
  }
}

function mapS3Error(error: unknown, operation: string, key?: string): never {
  if (error && typeof error === 'object') {
    const typed = error as { name?: string };
    if (typed.name === 'NoSuchKey') {
      const mapped = notFound('S3 object', key ?? 'unknown');
      throw new S3ServiceError(mapped.message, mapped, error);
    }
  }

  const mapped = serviceUnavailable(`S3 transient failure during ${operation}`);
  throw new S3ServiceError(mapped.message, mapped, error);
}

export async function putObject(params: ConstructorParameters<typeof PutObjectCommand>[0]): Promise<void> {
  try {
    await s3Client.send(new PutObjectCommand(params));
  } catch (error) {
    mapS3Error(error, 'putObject', params.Key);
  }
}

export async function getObject(params: ConstructorParameters<typeof GetObjectCommand>[0]): Promise<string> {
  try {
    const result = await s3Client.send(new GetObjectCommand(params));
    const body = result.Body as S3BodyLike | undefined;
    if (!body?.transformToString) {
      return '';
    }

    return await body.transformToString();
  } catch (error) {
    return mapS3Error(error, 'getObject', params.Key);
  }
}

export async function deleteObject(params: ConstructorParameters<typeof DeleteObjectCommand>[0]): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand(params));
  } catch (error) {
    mapS3Error(error, 'deleteObject', params.Key);
  }
}
