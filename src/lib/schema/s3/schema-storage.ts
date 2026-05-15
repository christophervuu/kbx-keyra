import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { SchemaFormat } from '../types.js';

type S3Sender = Pick<S3Client, 'send'>;

interface S3BodyLike {
  transformToString?: () => Promise<string>;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_BUCKET = getEnvValue('SCHEMA_BUCKET');

const s3Client: S3Sender = new S3Client({});

export type SchemaStorageErrorCode =
  | 'SCHEMA_STORAGE_CONFIG_ERROR'
  | 'SCHEMA_STORAGE_PUT_ERROR'
  | 'SCHEMA_STORAGE_GET_ERROR';

export class SchemaStorageError extends Error {
  constructor(
    public readonly code: SchemaStorageErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SchemaStorageError';
  }
}

function getSchemaBucketOrThrow(): string {
  const bucket = SCHEMA_BUCKET?.trim();

  if (!bucket) {
    throw new SchemaStorageError(
      'SCHEMA_STORAGE_CONFIG_ERROR',
      'Missing required environment variable: SCHEMA_BUCKET',
    );
  }

  return bucket;
}

function getOriginalSchemaKey(schemaId: string, format: SchemaFormat): string {
  const extension = format === 'xsd' ? 'xsd' : 'json';
  return `schemas/${schemaId}/original.${extension}`;
}

function getOriginalContentType(format: SchemaFormat): string {
  return format === 'xsd' ? 'application/xml' : 'application/json';
}

function getProcessedContentKey(schemaId: string): string {
  return `schemas/${schemaId}/content.json`;
}

export async function storeOriginalSchema(schemaId: string, content: string, format: SchemaFormat): Promise<string> {
  const bucket = getSchemaBucketOrThrow();
  const key = getOriginalSchemaKey(schemaId, format);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: getOriginalContentType(format),
      }),
    );

    return key;
  } catch (error) {
    throw new SchemaStorageError(
      'SCHEMA_STORAGE_PUT_ERROR',
      `Failed to store original schema at s3://${bucket}/${key}`,
      error,
    );
  }
}

export async function storeProcessedContent(schemaId: string, content: object): Promise<string> {
  const bucket = getSchemaBucketOrThrow();
  const key = getProcessedContentKey(schemaId);

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(content),
        ContentType: 'application/json',
      }),
    );

    return key;
  } catch (error) {
    throw new SchemaStorageError(
      'SCHEMA_STORAGE_PUT_ERROR',
      `Failed to store processed schema content at s3://${bucket}/${key}`,
      error,
    );
  }
}

export async function getSchemaContent(schemaId: string): Promise<string> {
  const bucket = getSchemaBucketOrThrow();
  const key = getProcessedContentKey(schemaId);

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const body = response.Body as S3BodyLike | undefined;
    if (!body?.transformToString) {
      throw new SchemaStorageError('SCHEMA_STORAGE_GET_ERROR', `Empty response body for s3://${bucket}/${key}`);
    }

    return await body.transformToString();
  } catch (error) {
    if (error instanceof SchemaStorageError) {
      throw error;
    }

    throw new SchemaStorageError(
      'SCHEMA_STORAGE_GET_ERROR',
      `Failed to get schema content from s3://${bucket}/${key}`,
      error,
    );
  }
}
