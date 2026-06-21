import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';

import { s3Client } from '../clients.js';
import { BUCKET_NAME, valueTableRevisionRowsKey } from '../config.js';
import type { ProjectValueTableRevisionRow } from '../types.js';

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

export async function put(
  valueTableId: string,
  revision: number,
  rows: readonly ProjectValueTableRevisionRow[],
): Promise<string> {
  const key = valueTableRevisionRowsKey(valueTableId, revision);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify({ rows }),
      ContentType: 'application/json',
    }),
  );

  return key;
}

export async function get(
  valueTableId: string,
  revision: number,
): Promise<readonly ProjectValueTableRevisionRow[] | null> {
  try {
    const output = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: valueTableRevisionRowsKey(valueTableId, revision),
      }),
    );

    const content = await readObjectBodyAsString(output);
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as { rows?: ProjectValueTableRevisionRow[] };
    return Array.isArray(parsed.rows) ? parsed.rows : null;
  } catch (error) {
    if (isNoSuchKey(error)) {
      return null;
    }

    throw error;
  }
}

export async function remove(valueTableId: string, revision: number): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: valueTableRevisionRowsKey(valueTableId, revision),
    }),
  );
}

export { remove as delete };

// Named aliases for call sites that use explicit operation naming.
export const putValueTableRevisionRows = put;
export const getValueTableRevisionRows = get;
export const deleteValueTableRevisionRows = remove;

export const valueTableRevisionsContent = {
  put,
  get,
  delete: remove,
};
