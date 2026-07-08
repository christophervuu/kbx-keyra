import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';

import { computeConfigHash } from '../hash.js';
import { computeArtifactHashFromBundlePayload } from '../../deployment/artifact-bundle.js';

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

export async function remove(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }),
  );
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

export interface RuntimeSnapshotReadResult {
  readonly key: string;
  readonly body: string;
  readonly payload: unknown;
}

export class RuntimeSnapshotHashMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeSnapshotHashMismatchError';
  }
}

export class RuntimeSnapshotUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeSnapshotUnreadableError';
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

async function readBodyToString(body: unknown): Promise<string> {
  if (typeof body === 'string') {
    return body;
  }

  if (body && typeof body === 'object') {
    const candidate = body as {
      transformToString?: () => Promise<string>;
      toString?: () => string;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
    };

    if (typeof candidate.transformToString === 'function') {
      return candidate.transformToString();
    }

    if (typeof candidate[Symbol.asyncIterator] === 'function') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of candidate as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return new TextDecoder().decode(concatUint8Arrays(chunks));
    }

    if (typeof candidate.toString === 'function') {
      return candidate.toString();
    }
  }

  return '';
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export async function getRuntimeSnapshot(mappingId: string, snapshotId: string): Promise<RuntimeSnapshotReadResult> {
  const key = runtimeSnapshotKey(mappingId, snapshotId, SNAPSHOTS_PREFIX);

  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: RUNTIME_BUCKET_NAME,
      Key: key,
    }),
  );

  const body = await readBodyToString(response.Body);
  const payload = JSON.parse(body) as unknown;

  return {
    key,
    body,
    payload,
  };
}

function getPayloadConfig(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  if (Object.hasOwn(record, 'mappingConfig')) {
    return record.mappingConfig;
  }

  if (Object.hasOwn(record, 'config')) {
    return record.config;
  }

  return payload;
}

function hasBundleShape(payload: unknown): payload is {
  readonly bundleFormatVersion: unknown;
  readonly manifest: unknown;
} {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return Object.hasOwn(record, 'bundleFormatVersion') && Object.hasOwn(record, 'manifest');
}

export async function verifyRuntimeSnapshotReadHash(input: {
  readonly mappingId: string;
  readonly snapshotId: string;
  readonly expectedContentHash: string;
}): Promise<RuntimeSnapshotReadResult> {
  const readResult = await getRuntimeSnapshot(input.mappingId, input.snapshotId);
  const computedHash = hasBundleShape(readResult.payload)
    ? computeArtifactHashFromBundlePayload(readResult.payload)
    : await computeConfigHash(getPayloadConfig(readResult.payload) as MappingConfig);

  if (computedHash !== input.expectedContentHash) {
    throw new RuntimeSnapshotUnreadableError(
      `Runtime snapshot hash verification failed for ${input.mappingId}/${input.snapshotId}: expected=${input.expectedContentHash} computed=${computedHash}`,
    );
  }

  return readResult;
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
  remove,
  putRuntimeSnapshot,
  getRuntimeSnapshot,
  verifyRuntimeSnapshotReadHash,
};
