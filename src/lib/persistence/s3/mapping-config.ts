import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';

import { s3Client } from '../clients.js';
import { BUCKET_NAME, mappingConfigKey } from '../config.js';
import type { MappingConfig } from '../types.js';

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

export async function put(mappingId: string, config: MappingConfig): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: mappingConfigKey(mappingId),
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    }),
  );
}

export async function get(mappingId: string): Promise<MappingConfig | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: mappingConfigKey(mappingId),
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    return JSON.parse(content) as MappingConfig;
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }
    throw error;
  }
}

export async function remove(mappingId: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: mappingConfigKey(mappingId),
    }),
  );
}

export { remove as delete };

// Named aliases for call sites that use explicit operation naming.
export const putMappingConfig = put;
export const getMappingConfig = get;
export const deleteMappingConfig = remove;

export const mappingConfig = {
  put,
  get,
  delete: remove,
};
