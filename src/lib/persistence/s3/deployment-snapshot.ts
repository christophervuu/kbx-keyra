import { PutObjectCommand } from '@aws-sdk/client-s3';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

import { s3Client } from '../clients.js';
import { BUCKET_NAME, RUNTIME_BUCKET_NAME, SNAPSHOTS_PREFIX, deploymentSnapshotKey, runtimeSnapshotKey } from '../config.js';
import type { DeploymentSnapshotMetadata, MappingConfig } from '../types.js';

export async function put(
  mappingId: string,
  environment: string,
  deployedAt: string,
  config: MappingConfig,
  metadata?: DeploymentSnapshotMetadata,
): Promise<string> {
  const key = deploymentSnapshotKey(mappingId, environment, deployedAt);
  const payload = {
    config,
    metadata: metadata ?? {},
  };

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(payload),
      ContentType: 'application/json',
    }),
  );

  return key;
}

interface PutRuntimeSnapshotInput {
  readonly mappingId: string;
  readonly snapshotId: string;
  readonly payload: unknown;
  readonly contentHash: string;
}

interface RuntimeSnapshotWriteResult {
  readonly key: string;
  readonly status: 'created' | 'idempotent';
}

export class RuntimeSnapshotHashMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeSnapshotHashMismatchError';
  }
}

async function headRuntimeObject(key: string): Promise<{ eTag?: string } | null> {
  try {
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: RUNTIME_BUCKET_NAME,
        Key: key,
      }),
    );

    return { eTag: head.ETag ?? undefined };
  } catch (error) {
    const typed = error as { $metadata?: { httpStatusCode?: number }; name?: string; Code?: string };
    const statusCode = typed.$metadata?.httpStatusCode;
    const missing = statusCode === 404 || typed.name === 'NotFound' || typed.Code === 'NotFound';

    if (missing) {
      return null;
    }

    throw error;
  }
}

function normalizeETag(etag: string | undefined): string | undefined {
  return etag?.replaceAll('"', '').trim();
}

export async function putRuntimeSnapshot(input: PutRuntimeSnapshotInput): Promise<RuntimeSnapshotWriteResult> {
  const key = runtimeSnapshotKey(input.mappingId, input.snapshotId, SNAPSHOTS_PREFIX);

  const existing = await headRuntimeObject(key);
  if (existing) {
    const existingHash = normalizeETag(existing.eTag);

    if (existingHash && existingHash !== input.contentHash) {
      throw new RuntimeSnapshotHashMismatchError(
        `Runtime snapshot hash mismatch for ${input.mappingId}/${input.snapshotId}: existing=${existingHash} incoming=${input.contentHash}`,
      );
    }

    return {
      key,
      status: 'idempotent',
    };
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: RUNTIME_BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(input.payload),
      ContentType: 'application/json',
    }),
  );

  return {
    key,
    status: 'created',
  };
}

export const deploymentSnapshot = {
  put,
  putRuntimeSnapshot,
};
