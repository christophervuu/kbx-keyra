import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';

import { s3Client } from '../clients.js';
import { BUCKET_NAME, schemaContentKey, schemaDraftRevisionContentKey, schemaOriginalKey, schemaVersionContentKey } from '../config.js';

type OriginalFormat = 'json' | 'xsd';

async function readObjectBodyAsString(output: GetObjectCommandOutput): Promise<string | null> {
  const body = output.Body;
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  const candidate = body as { transformToString?: () => Promise<string> };
  if (typeof candidate.transformToString === 'function') {
    return candidate.transformToString();
  }

  return null;
}

function isNoSuchKey(error: unknown): boolean {
  const maybe = error as { name?: string; Code?: string } | undefined;
  return maybe?.name === 'NoSuchKey' || maybe?.Code === 'NoSuchKey';
}

function originalContentType(format: OriginalFormat): string {
  return format === 'json' ? 'application/json' : 'application/xml';
}

export async function putOriginal(schemaId: string, content: string, format: OriginalFormat): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: schemaOriginalKey(schemaId, format),
      Body: content,
      ContentType: originalContentType(format),
    }),
  );
}

export async function putProcessed(schemaId: string, content: Record<string, unknown>): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: schemaContentKey(schemaId),
      Body: JSON.stringify(content),
      ContentType: 'application/json',
    }),
  );
}

export async function get(schemaId: string): Promise<Record<string, unknown> | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: schemaContentKey(schemaId),
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}

export async function putDraftRevision(schemaId: string, revision: number, content: Record<string, unknown>): Promise<string> {
  const key = schemaDraftRevisionContentKey(schemaId, revision);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(content),
      ContentType: 'application/json',
    }),
  );

  return key;
}

export async function getDraftRevision(schemaId: string, revision: number): Promise<Record<string, unknown> | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: schemaDraftRevisionContentKey(schemaId, revision),
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}

export async function putVersion(schemaId: string, version: number, content: Record<string, unknown>): Promise<string> {
  const key = schemaVersionContentKey(schemaId, version);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(content),
      ContentType: 'application/json',
    }),
  );

  return key;
}

export async function getVersion(schemaId: string, version: number): Promise<Record<string, unknown> | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: schemaVersionContentKey(schemaId, version),
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}

export async function getOriginal(schemaId: string, format: OriginalFormat): Promise<string | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: schemaOriginalKey(schemaId, format),
      }),
    );

    return readObjectBodyAsString(output);
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}

export async function remove(schemaId: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: [
          { Key: schemaOriginalKey(schemaId, 'json') },
          { Key: schemaOriginalKey(schemaId, 'xsd') },
          { Key: schemaContentKey(schemaId) },
        ],
      },
    }),
  );
}

export { remove as delete };

export const schemaContent = {
  putOriginal,
  putProcessed,
  putDraftRevision,
  putVersion,
  get,
  getDraftRevision,
  getOriginal,
  getVersion,
  delete: remove,
};
